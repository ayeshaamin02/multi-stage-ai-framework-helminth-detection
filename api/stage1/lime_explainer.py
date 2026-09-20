import io
import base64
import inspect
from pathlib import Path
from typing import List
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from PIL import Image
from lime import lime_image
from skimage.segmentation import mark_boundaries

from model_cache import get_model
from model_store import ensure_model_available
from prediction import get_preprocess_fn_from_model_name


MODELS_DIR = Path(os.getenv("MODELS_DIR", "./models"))
IMAGE_SIZE = (224, 224)
LIME_RANDOM_SEED = int(os.getenv("LIME_RANDOM_SEED", "42"))


def preprocess_image(image: Image.Image) -> np.ndarray:
    image = image.convert("RGB")
    image = image.resize(IMAGE_SIZE)

    arr = np.array(image).astype(np.float32)
    arr = arr / 255.0

    return arr


def preprocess_lime_batch(images: np.ndarray, model_filename: str) -> np.ndarray:
    batch = images.astype(np.float32)

    if float(np.max(batch)) <= 1.0:
        batch = batch * 255.0

    preprocess_fn = get_preprocess_fn_from_model_name(model_filename)
    return preprocess_fn(batch)


def build_predict_fn(model, model_filename: str):
    def predict_fn(images):
        images = preprocess_lime_batch(images, model_filename)

        preds = model.predict(images, verbose=0)

        if preds.shape[-1] == 1:
            positive = preds[:, 0]
            negative = 1 - positive
            preds = np.stack([negative, positive], axis=1)

        return preds

    return predict_fn


def generate_lime_explanation(
    model_filename: str,
    image: Image.Image,
    class_names: List[str],
    num_samples: int = 100,
):
    model_path = ensure_model_available(model_filename, MODELS_DIR)
    model = get_model(model_path)

    input_image = preprocess_image(image)
    predict_fn = build_predict_fn(model, model_filename)

    explainer = lime_image.LimeImageExplainer(random_state=LIME_RANDOM_SEED)

    explain_kwargs = {
        "image": input_image,
        "classifier_fn": predict_fn,
        "top_labels": len(class_names),
        "hide_color": 0,
        "num_samples": num_samples,
    }

    if "random_seed" in inspect.signature(explainer.explain_instance).parameters:
        explain_kwargs["random_seed"] = LIME_RANDOM_SEED

    explanation = explainer.explain_instance(**explain_kwargs)

    preds = predict_fn(np.expand_dims(input_image, axis=0))

    predicted_class = int(np.argmax(preds[0]))
    confidence = float(preds[0][predicted_class])

    temp, mask = explanation.get_image_and_mask(
        predicted_class,
        positive_only=True,
        num_features=8,
        hide_rest=False,
    )

    fig = plt.figure(figsize=(6, 6))
    plt.imshow(mark_boundaries(temp, mask))
    plt.axis("off")

    buffer = io.BytesIO()
    plt.savefig(buffer, format="png", bbox_inches="tight", pad_inches=0)
    plt.close(fig)

    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("utf-8")

    return {
        "modelFilename": model_filename,
        "numSamples": num_samples,
        "predictedClass": class_names[predicted_class],
        "confidence": confidence,
        "limeImage": encoded,
    }
