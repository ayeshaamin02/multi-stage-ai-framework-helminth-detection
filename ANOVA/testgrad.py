import matplotlib.cm as cm
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image as keras_image
from PIL import Image


# -----------------------------
# Config
# -----------------------------
MODEL_PATH = "HELMINTHS_BINARY_ConvNeXtBase_Round1.keras"
IMAGE_PATH = "0209.jpg"
OUTPUT_PATH = "gradcam_overlay.jpg"

IMG_SIZE = (224, 224)

# For MobileNetV2, "out_relu" is correct.
# You can also set this to None to auto-pick the last 4D layer inside the backbone.
MANUAL_LAYER_NAME = "conv5_block3"

CLASS_NAMES = None


# -----------------------------
# Image loading
# -----------------------------
def load_and_preprocess_image(img_path, target_size):
    img = keras_image.load_img(img_path, target_size=target_size)

    # Use this if the model was trained with rescale=1./255
    arr = keras_image.img_to_array(img).astype("float32") / 255.0

    arr = np.expand_dims(arr, axis=0)
    return img, arr


# -----------------------------
# Model helpers
# -----------------------------
def find_backbone_model(model):
    """
    Find the nested backbone model inside a Sequential model.
    Usually this is MobileNetV2, VGG19, ResNet50, ConvNeXt, etc.
    """
    for layer in model.layers:
        if isinstance(layer, tf.keras.Model) and len(layer.layers) > 5:
            return layer

    raise ValueError("Could not find a nested backbone model inside the model.")


def get_head_layers_after_backbone(model, backbone):
    """
    Return layers after the backbone in the outer Sequential model.
    Example:
    backbone -> GAP -> Dense -> Dropout -> Dense
    """
    head_layers = []
    found_backbone = False

    for layer in model.layers:
        if layer is backbone:
            found_backbone = True
            continue

        if found_backbone:
            head_layers.append(layer)

    if not head_layers:
        raise ValueError("No classification head layers found after backbone.")

    return head_layers


def get_all_4d_layers(backbone):
    """
    Get all 4D layers inside the backbone.
    """
    candidates = []

    for layer in backbone.layers:
        try:
            shape = layer.output.shape
            if len(shape) == 4:
                candidates.append(layer)
        except Exception:
            pass

    return candidates


def print_last_4d_layers(backbone, limit=25):
    candidates = get_all_4d_layers(backbone)

    print("\nLast 4D layers inside backbone:")
    print("-" * 80)

    for layer in candidates[-limit:]:
        print(f"{layer.name:60s} {str(layer.output.shape)}")

    print("-" * 80)

    return candidates[-limit:]


def find_layer_in_backbone(backbone, layer_name):
    try:
        return backbone.get_layer(layer_name)
    except ValueError:
        raise ValueError(f"Layer '{layer_name}' not found inside backbone.")


def find_last_4d_layer(backbone):
    candidates = get_all_4d_layers(backbone)

    if not candidates:
        raise ValueError("No 4D layer found inside backbone.")

    return candidates[-1]


# -----------------------------
# Fixed GradCAM for nested Sequential model
# -----------------------------
def make_gradcam_heatmap_nested_sequential(
    img_array,
    model,
    layer_name=None,
):
    """
    GradCAM for models like:

    Sequential(
        backbone,
        GlobalAveragePooling2D,
        Dense,
        Dropout,
        Dense(sigmoid)
    )

    This avoids graph KeyError by:
    1. Creating feature extractor from backbone input.
    2. Returning selected conv output and backbone final output.
    3. Manually passing backbone final output through the classification head.
    """
    img_tensor = tf.convert_to_tensor(img_array, dtype=tf.float32)

    # Make sure model is called.
    _ = model(img_tensor, training=False)

    backbone = find_backbone_model(model)
    head_layers = get_head_layers_after_backbone(model, backbone)

    print("\nBackbone found:", backbone.name)
    print("Head layers:")
    for layer in head_layers:
        print(" -", layer.name, layer.__class__.__name__)

    if layer_name is None:
        target_layer = find_last_4d_layer(backbone)
    else:
        target_layer = find_layer_in_backbone(backbone, layer_name)

    print("\nUsing GradCAM layer:", target_layer.name)
    print("Layer output shape:", target_layer.output.shape)

    # This model is built only inside the backbone graph.
    # This avoids the outer Sequential graph issue.
    backbone_feature_model = tf.keras.Model(
        inputs=backbone.inputs,
        outputs=[
            target_layer.output,
            backbone.output,
        ],
    )

    with tf.GradientTape() as tape:
        conv_outputs, backbone_output = backbone_feature_model(
            img_tensor,
            training=False,
        )

        x = backbone_output

        # Manually run classification head.
        for layer in head_layers:
            x = layer(x, training=False)

        preds = x

        # Binary sigmoid output
        if preds.shape[-1] == 1:
            class_channel = preds[:, 0]
        else:
            predicted_class = tf.argmax(preds[0])
            class_channel = preds[:, predicted_class]

    grads = tape.gradient(class_channel, conv_outputs)

    if grads is None:
        raise ValueError(
            f"Gradients are None for layer '{target_layer.name}'. "
            "Try an earlier 4D layer."
        )

    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    conv_outputs = conv_outputs[0]

    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)

    heatmap = tf.maximum(heatmap, 0)

    max_val = tf.reduce_max(heatmap)

    if max_val <= 0:
        raise ValueError(
            f"Heatmap is zero for layer '{target_layer.name}'. "
            "Try an earlier 4D layer."
        )

    heatmap = heatmap / (max_val + 1e-8)

    return heatmap.numpy(), preds.numpy(), target_layer.name


# -----------------------------
# Overlay
# -----------------------------
def apply_heatmap(original_img, heatmap, alpha=0.4):
    original = np.array(original_img).astype("float32")

    heatmap_img = Image.fromarray(np.uint8(255 * heatmap)).resize(
        (original.shape[1], original.shape[0])
    )

    heatmap_uint8 = np.array(heatmap_img)

    cmap = cm.get_cmap("jet")
    colored_heatmap = cmap(heatmap_uint8 / 255.0)[:, :, :3]
    colored_heatmap = (colored_heatmap * 255).astype("float32")

    superimposed = original * (1 - alpha) + colored_heatmap * alpha
    superimposed = np.clip(superimposed, 0, 255).astype("uint8")

    return Image.fromarray(superimposed)


# -----------------------------
# Main
# -----------------------------
def main():
    print("Loading model:", MODEL_PATH)

    model = load_model(MODEL_PATH, compile=False)

    original_img, img_array = load_and_preprocess_image(IMAGE_PATH, IMG_SIZE)

    img_tensor = tf.convert_to_tensor(img_array, dtype=tf.float32)
    initial_pred = model(img_tensor, training=False)

    print("\nModel loaded.")
    print("Model type:", type(model))
    print("Model input shape:", model.input_shape)
    print("Model output shape:", model.output_shape)
    print("Initial prediction:", initial_pred.numpy())

    backbone = find_backbone_model(model)
    print_last_4d_layers(backbone, limit=25)

    try:
        heatmap, preds, used_layer = make_gradcam_heatmap_nested_sequential(
            img_array=img_array,
            model=model,
            layer_name=MANUAL_LAYER_NAME,
        )

    except Exception as e:
        print("\nManual/automatic layer failed:")
        print(e)
        print("\nTrying fallback layers...")

        candidates = get_all_4d_layers(backbone)

        last_error = None

        for layer in reversed(candidates[-30:]):
            try:
                heatmap, preds, used_layer = make_gradcam_heatmap_nested_sequential(
                    img_array=img_array,
                    model=model,
                    layer_name=layer.name,
                )
                break
            except Exception as layer_error:
                last_error = layer_error
                print(f"Failed layer {layer.name}: {layer_error}")
        else:
            raise RuntimeError(f"All fallback layers failed. Last error: {last_error}")

    prob = float(preds[0][0])
    predicted_class = int(prob >= 0.5)

    print("\nPrediction result")
    print("-" * 80)
    print("Used GradCAM layer:", used_layer)
    print("Raw sigmoid probability:", prob)
    print("Predicted class:", predicted_class)
    print("Confidence:", prob if predicted_class == 1 else 1 - prob)

    if CLASS_NAMES:
        print("Predicted class name:", CLASS_NAMES[predicted_class])

    print("Heatmap min:", float(heatmap.min()))
    print("Heatmap max:", float(heatmap.max()))
    print("Heatmap mean:", float(heatmap.mean()))

    overlay = apply_heatmap(original_img, heatmap, alpha=0.4)
    overlay.save(OUTPUT_PATH)

    print("\nSaved:", OUTPUT_PATH)


if __name__ == "__main__":
    main()