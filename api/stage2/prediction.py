import logging
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict
import tensorflow as tf

import numpy as np
import requests
from PIL import Image
from tensorflow.keras import Input, Model
from tensorflow.keras.applications import EfficientNetB0
from tensorflow.keras.layers import Dense, Dropout, GlobalAveragePooling2D
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image

logger = logging.getLogger(__name__)


def preprocess_image(source_image: Image.Image, size: int, model_name: str) -> np.ndarray:
    rgb_image = source_image.convert("RGB")
    resized_image = rgb_image.resize((size, size), Image.Resampling.LANCZOS)

    img_array = image.img_to_array(resized_image)
    img_array = np.expand_dims(img_array, axis=0)

    preprocess_fn = get_preprocess_fn_from_model_name(model_name)
    img_array = preprocess_fn(img_array)

    return img_array

def get_preprocess_fn_from_model_name(model_name: str):
    lower = model_name.lower()

    if "vgg19" in lower:
        return tf.keras.applications.vgg19.preprocess_input

    if "resnet50" in lower:
        return tf.keras.applications.resnet50.preprocess_input

    if "efficientnetb0" in lower:
        return tf.keras.applications.efficientnet.preprocess_input

    if "mobilenetv2" in lower:
        return tf.keras.applications.mobilenet_v2.preprocess_input

    if "nasnetmobile" in lower:
        return tf.keras.applications.nasnet.preprocess_input

    if "densenet169" in lower:
        return tf.keras.applications.densenet.preprocess_input

    if "convnextbase" in lower or "convnext" in lower:
        return tf.keras.applications.convnext.preprocess_input

    raise ValueError(f"Could not determine preprocessing function for model: {model_name}")

def build_model() -> Model:
    inputs = Input(shape=(224, 224, 3), name="input_layer_3")
    base = EfficientNetB0(include_top=False, weights=None, input_tensor=inputs, name="efficientnetb0")

    x = base.output
    x = GlobalAveragePooling2D(name="global_average_pooling2d")(x)
    x = Dense(256, activation="relu", name="dense")(x)
    x = Dropout(0.5, name="dropout")(x)
    outputs = Dense(1, activation="sigmoid", name="dense_1")(x)

    return Model(inputs, outputs, name="helminth_binary_efficientnetb0")


def load_keras_model(model_path: Path) -> Model:
    try:
        return load_model(str(model_path), compile=False, safe_mode=False)
    except Exception as exc:
        logger.warning("load_model failed, falling back to manual model rebuild: %s", exc)

    with tempfile.TemporaryDirectory() as tmpdir:
        weights_path = Path(tmpdir) / "model.weights.h5"
        with zipfile.ZipFile(model_path, "r") as archive:
            archive.extract("model.weights.h5", path=tmpdir)

        model = build_model()
        model.load_weights(str(weights_path))
        return model


def predict_with_model_file(source_image: Image.Image, model_path: Path, size: int) -> Dict[str, object]:
    loaded_model = load_keras_model(model_path)
    return predict_image(loaded_model, source_image, size, model_path.name)

def predict_image(model, source_image: Image.Image, size: int, model_name: str) -> Dict[str, object]:
    preprocessed_image = preprocess_image(source_image, size, model_name)

    logger.info("Preprocessed image shape: %s", preprocessed_image.shape)
    logger.info(
        "Preprocessed image stats: min=%s max=%s mean=%s",
        float(np.min(preprocessed_image)),
        float(np.max(preprocessed_image)),
        float(np.mean(preprocessed_image)),
    )

    assert preprocessed_image.shape == (1, size, size, 3), f"Unexpected shape: {preprocessed_image.shape}"

    prediction = model.predict(preprocessed_image)
    probability = float(prediction[0][0])

    return {
        "probability": probability,
        "predicted_class": int(probability >= 0.5),
        "class_probabilities": {
            0: float(round((1 - probability) * 100, 2)),
            1: float(round(probability * 100, 2)),
        },
    }


def load_image_from_file(image_path: Path) -> Image.Image:
    """Open an image from disk."""
    try:
        return Image.open(image_path)
    except Exception as exc:
        raise ValueError(f"Unable to open image from path '{image_path}': {exc}") from exc


def load_image_from_url(image_url: str) -> Image.Image:
    """Download and open an image from a remote URL."""
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Unable to download image from URL '{image_url}': {exc}") from exc

    try:
        return Image.open(BytesIO(response.content))
    except Exception as exc:
        raise ValueError(f"Unable to decode image from URL '{image_url}': {exc}") from exc
