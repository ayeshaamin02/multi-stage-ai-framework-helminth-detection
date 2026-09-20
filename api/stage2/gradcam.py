import base64
import inspect
import io
import logging
from pathlib import Path
from typing import Dict, Optional, List

import matplotlib
import numpy as np
import tensorflow as tf
from PIL import Image

from model_cache import get_model
from prediction import preprocess_image

logger = logging.getLogger(__name__)


# ============================================================
# BACKBONE CONFIGS
# ============================================================

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
        "last_conv_name": None,
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


# ============================================================
# DEBUG HELPERS
# ============================================================

def _safe_shape(value):
    try:
        return value.shape
    except Exception:
        return None


def _log_model_layers(model: tf.keras.Model, prefix: str = "model") -> None:
    logger.info("GradCAM loaded %s name: %s", prefix, getattr(model, "name", None))
    logger.info("GradCAM loaded %s type: %s", prefix, type(model).__name__)
    logger.info("GradCAM loaded %s layers:", prefix)

    for idx, layer in enumerate(getattr(model, "layers", [])):
        try:
            output_shape = layer.output.shape
        except Exception:
            output_shape = None

        logger.info(
            "  [%s] %s | %s | output=%s",
            idx,
            layer.name,
            type(layer).__name__,
            output_shape,
        )


def _log_tensor_stats(name: str, arr) -> None:
    arr_np = np.asarray(arr)

    logger.info(
        "%s stats: shape=%s dtype=%s min=%.6f max=%.6f mean=%.6f std=%.6f",
        name,
        arr_np.shape,
        arr_np.dtype,
        float(np.min(arr_np)),
        float(np.max(arr_np)),
        float(np.mean(arr_np)),
        float(np.std(arr_np)),
    )


def _preprocess_for_model(source_image: Image.Image, size: int, model_filename: str) -> np.ndarray:
    """
    Calls prediction.preprocess_image safely.

    Supports both versions:

        preprocess_image(source_image, size)

    and:

        preprocess_image(source_image, size, model_name)
        preprocess_image(source_image, size, model_filename)
    """
    try:
        signature = inspect.signature(preprocess_image)
        params = signature.parameters

        if len(params) >= 3:
            logger.info(
                "GradCAM preprocessing using model-aware preprocess_image with model=%s",
                model_filename,
            )
            return preprocess_image(source_image, size, model_filename)

        logger.warning(
            "GradCAM preprocessing is using old preprocess_image(source_image, size). "
            "If prediction uses model-aware preprocessing, update prediction.preprocess_image "
            "to accept model filename here too."
        )
        return preprocess_image(source_image, size)

    except TypeError:
        logger.warning(
            "GradCAM preprocess_image rejected model filename. Falling back to two-argument call.",
            exc_info=True,
        )
        return preprocess_image(source_image, size)


# ============================================================
# MODEL / LAYER HELPERS
# ============================================================

def _get_backbone_key_from_filename(model_filename: str) -> Optional[str]:
    lower = model_filename.lower()

    if "resnet50" in lower:
        return "resnet50"

    if "vgg19" in lower:
        return "vgg19"

    if "convnextbase" in lower or "convnext" in lower:
        return "convnext"

    if "mobilenetv2" in lower:
        return "mobilenetv2"

    if "efficientnetb0" in lower:
        return "efficientnetb0"

    if "nasnetmobile" in lower:
        return "nasnetmobile"

    if "densenet169" in lower:
        return "densenet169"

    return None


def _find_layer_recursive(model_or_layer, layer_name: str):
    for layer in model_or_layer.layers:
        if layer.name == layer_name:
            return layer

        if hasattr(layer, "layers") and len(layer.layers) > 0:
            try:
                return _find_layer_recursive(layer, layer_name)
            except ValueError:
                pass

    raise ValueError(f"Layer '{layer_name}' not found.")


def _layer_exists(model_or_layer, layer_name: Optional[str]) -> bool:
    if not layer_name:
        return False

    try:
        _find_layer_recursive(model_or_layer, layer_name)
        return True
    except ValueError:
        return False


def _get_backbone(model, backbone_name: str):
    try:
        return model.get_layer(backbone_name)
    except ValueError:
        pass

    for layer in model.layers:
        if isinstance(layer, tf.keras.Model):
            if backbone_name.lower() in layer.name.lower():
                return layer

    for layer in model.layers:
        if hasattr(layer, "layers") and len(layer.layers) > 0:
            if backbone_name.lower() in layer.name.lower():
                return layer

    for layer in model.layers:
        if isinstance(layer, tf.keras.Model) and len(layer.layers) > 5:
            logger.warning(
                "GradCAM backbone fallback selected first large nested model: %s",
                layer.name,
            )
            return layer

    return None


def _get_all_4d_layers(model_or_layer) -> List[tf.keras.layers.Layer]:
    candidates = []

    for layer in model_or_layer.layers:
        try:
            shape = layer.output.shape

            if len(shape) == 4:
                candidates.append(layer)

        except Exception:
            pass

        if hasattr(layer, "layers") and len(layer.layers) > 0:
            candidates.extend(_get_all_4d_layers(layer))

    return candidates


def _find_last_4d_layer(model_or_layer):
    candidates = _get_all_4d_layers(model_or_layer)

    if not candidates:
        raise ValueError("No 4D feature-map layer found for GradCAM.")

    logger.warning(
        "GradCAM using fallback last 4D layer: %s -> %s",
        candidates[-1].name,
        candidates[-1].output.shape,
    )

    return candidates[-1]


def _get_head_layers_after_backbone(model, backbone) -> List[tf.keras.layers.Layer]:
    head_layers = []
    found_backbone = False

    for layer in model.layers:
        if layer is backbone:
            found_backbone = True
            continue

        if found_backbone:
            head_layers.append(layer)

    if not head_layers:
        raise ValueError(
            "No classification head layers found after backbone. "
            "This GradCAM implementation expects a model like: "
            "Input -> Backbone -> GAP -> Dense -> Dropout -> Dense."
        )

    return head_layers


def _get_backbone_config(model_filename: str, model) -> Dict[str, Optional[str]]:
    key = _get_backbone_key_from_filename(model_filename)

    logger.info("GradCAM inferred backbone key from filename: %s", key)

    if key and key in BACKBONE_CONFIGS:
        config = BACKBONE_CONFIGS[key]
        backbone = _get_backbone(model, config["backbone_name"])

        if backbone is not None:
            logger.info(
                "GradCAM selected config from filename: key=%s backbone=%s",
                key,
                backbone.name,
            )
            return config

        logger.warning(
            "GradCAM filename suggested key=%s but backbone=%s was not found.",
            key,
            config["backbone_name"],
        )

    for config in BACKBONE_CONFIGS.values():
        backbone = _get_backbone(model, config["backbone_name"])

        if backbone is not None:
            logger.warning(
                "GradCAM selected config by model structure fallback: backbone=%s",
                backbone.name,
            )
            return config

    raise ValueError(
        f"Unable to determine backbone config for model '{model_filename}'. "
        "Make sure the model contains a nested backbone or filename contains a known backbone name."
    )


# ============================================================
# GRADCAM MODEL BUILDING
# ============================================================

def build_gradcam_model_parts(model, backbone_config: Dict[str, Optional[str]]):
    backbone = _get_backbone(model, backbone_config["backbone_name"])

    if backbone is None:
        raise ValueError(
            f"Backbone '{backbone_config['backbone_name']}' not found in model."
        )

    _log_model_layers(backbone, prefix=f"backbone:{backbone.name}")

    last_conv_name = backbone_config.get("last_conv_name")

    if last_conv_name and _layer_exists(backbone, last_conv_name):
        target_layer = _find_layer_recursive(backbone, last_conv_name)
    else:
        logger.warning(
            "GradCAM configured layer '%s' not found. Falling back to last 4D layer.",
            last_conv_name,
        )
        target_layer = _find_last_4d_layer(backbone)

    head_layers = _get_head_layers_after_backbone(model, backbone)

    logger.info("GradCAM backbone: %s", backbone.name)
    logger.info("GradCAM target layer: %s", target_layer.name)
    logger.info("GradCAM target layer shape: %s", target_layer.output.shape)
    logger.info("GradCAM head layers: %s", [layer.name for layer in head_layers])

    all_4d_layers = _get_all_4d_layers(backbone)
    logger.info("GradCAM 4D candidate layers count: %s", len(all_4d_layers))

    for layer in all_4d_layers[-10:]:
        logger.info("  4D candidate: %s -> %s", layer.name, layer.output.shape)

    backbone_feature_model = tf.keras.Model(
        inputs=backbone.inputs,
        outputs=[
            target_layer.output,
            backbone.output,
        ],
    )

    return backbone_feature_model, head_layers, target_layer.name


def make_gradcam_heatmap(
    img_array,
    backbone_feature_model,
    head_layers: List[tf.keras.layers.Layer],
    explain_class: str = "predicted",
):
    img_tensor = tf.convert_to_tensor(img_array, dtype=tf.float32)

    with tf.GradientTape() as tape:
        last_conv_output, backbone_output = backbone_feature_model(
            img_tensor,
            training=False,
        )

        x = backbone_output

        for layer in head_layers:
            x = layer(x, training=False)

        preds = x

        if preds.shape[-1] == 1:
            prob = preds[:, 0]

            if explain_class == "positive":
                class_channel = prob
                explained_class = 1

            elif explain_class == "negative":
                class_channel = 1.0 - prob
                explained_class = 0

            elif explain_class == "predicted":
                predicted_is_positive = prob >= 0.5
                class_channel = tf.where(predicted_is_positive, prob, 1.0 - prob)
                explained_class = int(predicted_is_positive[0].numpy())

            else:
                raise ValueError(
                    "explain_class must be 'positive', 'negative', or 'predicted'."
                )

        else:
            predicted_class = tf.argmax(preds[0])
            class_channel = preds[:, predicted_class]
            explained_class = int(predicted_class.numpy())

    grads = tape.gradient(class_channel, last_conv_output)

    if grads is None:
        raise ValueError("Gradients are None. Try another GradCAM target layer.")

    _log_tensor_stats("GradCAM last_conv_output", last_conv_output.numpy())
    _log_tensor_stats("GradCAM gradients", grads.numpy())

    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    last_conv_output = last_conv_output[0]

    heatmap = tf.reduce_sum(last_conv_output * pooled_grads, axis=-1)
    heatmap = tf.maximum(heatmap, 0)

    max_val = tf.reduce_max(heatmap)

    if max_val > 0:
        heatmap = heatmap / (max_val + 1e-8)

    heatmap_np = heatmap.numpy()
    preds_np = preds.numpy()

    logger.info("GradCAM explained class: %s", explained_class)
    _log_tensor_stats("GradCAM raw prediction", preds_np)
    _log_tensor_stats("GradCAM heatmap", heatmap_np)

    logger.info(
        "GradCAM heatmap nonzero=%s total=%s",
        int(np.count_nonzero(heatmap_np)),
        int(heatmap_np.size),
    )

    return heatmap_np, preds_np, explained_class


# ============================================================
# IMAGE OVERLAY / BASE64
# ============================================================

def apply_heatmap(original_img: Image.Image, heatmap, alpha=0.45) -> Image.Image:
    original = np.array(original_img.convert("RGB")).astype("float32")

    heatmap_img = Image.fromarray(np.uint8(255 * heatmap)).resize(
        (original.shape[1], original.shape[0]),
        resample=Image.Resampling.BICUBIC,
    )

    heatmap_uint8 = np.array(heatmap_img)

    cmap = matplotlib.colormaps.get_cmap("jet")
    colored_heatmap = cmap(heatmap_uint8 / 255.0)[:, :, :3]
    colored_heatmap = (colored_heatmap * 255).astype("float32")

    superimposed = original * (1 - alpha) + colored_heatmap * alpha
    superimposed = np.clip(superimposed, 0, 255).astype("uint8")

    return Image.fromarray(superimposed)


def _image_to_base64(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    return "data:image/png;base64," + base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")


# ============================================================
# PUBLIC API FUNCTION
# ============================================================

def generate_gradcam_base64(
    source_image: Image.Image,
    model_path: Path,
    size: int,
    explain_class: str = "predicted",
) -> str:
    model = get_model(model_path)

    logger.info("========== GradCAM START ==========")
    logger.info("GradCAM model path: %s", model_path)
    logger.info("GradCAM model filename: %s", model_path.name)
    logger.info("GradCAM image size: %s", size)
    logger.info("GradCAM explain_class requested: %s", explain_class)

    _log_model_layers(model, prefix="full-model")

    image_tensor = _preprocess_for_model(
        source_image=source_image,
        size=size,
        model_filename=model_path.name,
    )

    image_tensor = tf.convert_to_tensor(image_tensor, dtype=tf.float32)
    _log_tensor_stats("GradCAM preprocessed image", image_tensor.numpy())

    full_preds = model(image_tensor, training=False).numpy()

    backbone_config = _get_backbone_config(model_path.name, model)

    backbone_feature_model, head_layers, target_layer_name = build_gradcam_model_parts(
        model=model,
        backbone_config=backbone_config,
    )

    heatmap, gradcam_preds, explained_class = make_gradcam_heatmap(
        img_array=image_tensor,
        backbone_feature_model=backbone_feature_model,
        head_layers=head_layers,
        explain_class=explain_class,
    )

    logger.info("GradCAM model: %s", model_path.name)
    logger.info("GradCAM target layer used: %s", target_layer_name)
    logger.info("GradCAM explain_class requested: %s", explain_class)
    logger.info("GradCAM explained class final: %s", explained_class)
    logger.info("GradCAM full model prediction: %s", full_preds)
    logger.info("GradCAM reconstructed path prediction: %s", gradcam_preds)

    if full_preds.shape == gradcam_preds.shape:
        diff = np.abs(full_preds - gradcam_preds)
        logger.info(
            "GradCAM prediction diff: max=%.8f mean=%.8f",
            float(np.max(diff)),
            float(np.mean(diff)),
        )

        if float(np.max(diff)) > 1e-4:
            logger.warning(
                "GradCAM reconstructed prediction does not match full model prediction. "
                "This usually means the GradCAM path is skipping or mis-ordering layers."
            )
    else:
        logger.warning(
            "GradCAM full prediction shape %s differs from reconstructed prediction shape %s",
            full_preds.shape,
            gradcam_preds.shape,
        )

    overlay = apply_heatmap(source_image, heatmap, alpha=0.45)

    logger.info("========== GradCAM END ==========")

    return _image_to_base64(overlay)
