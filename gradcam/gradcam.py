import os
import matplotlib.cm as cm
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image as keras_image
from PIL import Image

# -----------------------------
# Config
# -----------------------------
MODEL_PATH = "models/HELMINTHS_BINARY_VGG19_Round1.keras"
IMAGE_PATH = "test/helminths-003.jpg"
OUTPUT_PATH = "gradcam_overlay.jpg"
IMG_SIZE = (224, 224)   # change if your model expects something else
CLASS_NAMES = None  # or your list

BACKBONE_CONFIGS = {
    "resnet50": {
        "backbone_name": "resnet50",
        "last_conv_name": "conv5_block3_out",
    },
    "vgg19": {
        "backbone_name": "vgg19",
        "last_conv_name": "block5_conv4",
    },
    "convnext": {
        "backbone_name": "convnext",
        "last_conv_name": "conv5_block3",
    },
    "mobilenetv2": {
        "backbone_name": "mobilenetv2",
        "last_conv_name": "out_relu",
    },
    "efficientnetb0": {
        "backbone_name": "efficientnetb0",
        "last_conv_name": "top_conv",
    },
    "nasnetmobile": {
        "backbone_name": "nasnetmobile",
        "last_conv_name": "normal_concat_12",
    },
    "densenet169": {
        "backbone_name": "densenet169",
        "last_conv_name": "conv5_block32_concat",
    },
}


def load_and_preprocess_image(img_path, target_size):
    img = keras_image.load_img(img_path, target_size=target_size)
    arr = keras_image.img_to_array(img).astype("float32") / 255.0
    arr = np.expand_dims(arr, axis=0)
    return img, arr


def _find_layer(model, layer_name):
    try:
        return model.get_layer(layer_name)
    except ValueError:
        for layer in model.layers:
            if hasattr(layer, "layers"):
                try:
                    return layer.get_layer(layer_name)
                except ValueError:
                    continue
    raise ValueError(f"Layer '{layer_name}' not found in model or nested submodels.")


def build_gradcam_models(model, backbone_config):
    backbone_name = backbone_config["backbone_name"]
    last_conv_name = backbone_config["last_conv_name"]

    try:
        backbone = model.get_layer(backbone_name)
    except ValueError:
        backbone = None

    if backbone is not None:
        try:
            last_conv_layer = backbone.get_layer(last_conv_name)
        except ValueError:
            last_conv_layer = _find_layer(model, last_conv_name)
    else:
        last_conv_layer = _find_layer(model, last_conv_name)

    last_conv_layer_model = tf.keras.Model(model.inputs, last_conv_layer.output)
    classifier_model = tf.keras.Model(last_conv_layer.output, model.output)

    return last_conv_layer_model, classifier_model, backbone_name, last_conv_name


def make_gradcam_heatmap(img_array, last_conv_layer_model, classifier_model):
    img_tensor = tf.convert_to_tensor(img_array, dtype=tf.float32)

    with tf.GradientTape() as tape:
        last_conv_output = last_conv_layer_model(img_tensor, training=False)
        tape.watch(last_conv_output)

        preds = classifier_model(last_conv_output, training=False)
        prob = preds[:, 0]

    grads = tape.gradient(prob, last_conv_output)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    last_conv_output = last_conv_output[0]
    heatmap = tf.reduce_sum(last_conv_output * pooled_grads, axis=-1)

    heatmap = tf.maximum(heatmap, 0)
    max_val = tf.reduce_max(heatmap)
    if max_val > 0:
        heatmap /= max_val

    return heatmap.numpy(), preds.numpy()


def apply_heatmap(original_img, heatmap, alpha=0.35):
    import numpy as np
    from PIL import Image
    import matplotlib.cm as cm

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


def main():
    model = load_model(MODEL_PATH)

    original_img, img_array = load_and_preprocess_image(IMAGE_PATH, IMG_SIZE)
    _ = model(tf.convert_to_tensor(img_array, dtype=tf.float32), training=False)

    backbone_key = "vgg19"
    backbone_config = BACKBONE_CONFIGS[backbone_key]
    last_conv_layer_model, classifier_model, backbone_name, last_conv_name = build_gradcam_models(
        model,
        backbone_config,
    )

    print(f"Using backbone='{backbone_name}', last_conv='{last_conv_name}'")

    heatmap, preds = make_gradcam_heatmap(
        img_array,
        last_conv_layer_model,
        classifier_model,
    )

    prob = float(preds[0][0])
    predicted_class = int(prob >= 0.5)

    print("Raw sigmoid probability:", prob)
    print("Predicted class:", predicted_class)
    print("Confidence:", prob if predicted_class == 1 else 1 - prob)

    if CLASS_NAMES:
        print("Predicted class:", CLASS_NAMES[predicted_class])

    overlay = apply_heatmap(original_img, heatmap, alpha=0.4)
    overlay.save(OUTPUT_PATH)
    print("Saved:", OUTPUT_PATH)


if __name__ == "__main__":
    main()
