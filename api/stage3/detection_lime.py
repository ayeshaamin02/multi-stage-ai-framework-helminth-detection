import base64
import io
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from PIL import Image
from lime import lime_image
from skimage.segmentation import mark_boundaries

from model_store import ensure_model_available
from prediction import predict_with_model_file

logger = logging.getLogger(__name__)


def _image_to_numpy(image: Image.Image, image_size: Tuple[int, int]) -> np.ndarray:
    """
    LIME works well with uint8 RGB images.
    Unlike your classification LIME, do not divide by 255 here.
    """
    image = image.convert("RGB")
    image = image.resize(image_size)
    return np.array(image).astype(np.uint8)


def _numpy_to_pil(arr: np.ndarray) -> Image.Image:
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr).convert("RGB")


def _iou(box_a: List[float], box_b: List[float]) -> float:
    """
    box format: [x1, y1, x2, y2]
    """
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)

    union = area_a + area_b - inter_area

    if union <= 0:
        return 0.0

    return float(inter_area / union)


def _pick_detection(
    predictions: List[Dict[str, object]],
    detection_index: Optional[int] = None,
    target_class_id: Optional[int] = None,
) -> Dict[str, object]:
    """
    Pick which detection to explain.

    Priority:
    1. detection_index if provided
    2. highest-confidence detection for target_class_id if provided
    3. highest-confidence detection overall
    """
    if not predictions:
        raise ValueError("No detections found to explain.")

    if detection_index is not None:
        if detection_index < 0 or detection_index >= len(predictions):
            raise ValueError(
                f"detection_index {detection_index} is out of range. "
                f"Available detections: 0 to {len(predictions) - 1}"
            )
        return predictions[detection_index]

    filtered = predictions

    if target_class_id is not None:
        filtered = [
            p for p in predictions
            if int(p.get("class_id", -1)) == int(target_class_id)
        ]

        if not filtered:
            raise ValueError(f"No detection found for target_class_id={target_class_id}")

    return max(filtered, key=lambda p: float(p.get("confidence", 0.0)))


def _detection_score(
    predictions: List[Dict[str, object]],
    target_class_id: int,
    target_box: List[float],
    min_iou: float = 0.20,
) -> float:
    """
    Returns a score for how strongly the perturbed image still contains
    the same kind of detection near the original target box.

    This makes LIME focus on the selected detection, not just the class anywhere.
    """
    best_score = 0.0

    for pred in predictions:
        pred_class_id = int(pred.get("class_id", -1))
        pred_box = pred.get("box")
        confidence = float(pred.get("confidence", 0.0))

        if pred_class_id != target_class_id:
            continue

        if not pred_box or len(pred_box) != 4:
            continue

        overlap = _iou(target_box, pred_box)

        if overlap < min_iou:
            continue

        score = confidence * overlap
        best_score = max(best_score, score)

    return float(best_score)


def build_detection_predict_fn(
    model_path: Path,
    model_input_feature_size: int,
    target_class_id: int,
    target_box: List[float],
):
    """
    LIME expects a function that receives a batch of images and returns
    class probabilities.

    For detection, we create a fake binary classification task:

    class 0 = target detection absent
    class 1 = target detection present

    So the returned shape is:
    [
      [1 - score, score],
      [1 - score, score],
      ...
    ]
    """

    def predict_fn(images: np.ndarray) -> np.ndarray:
        outputs = []

        for arr in images:
            pil_img = _numpy_to_pil(arr)

            try:
                result = predict_with_model_file(
                    pil_img,
                    model_path,
                    model_input_feature_size,
                )

                predictions = result.get("predictions", [])

                score = _detection_score(
                    predictions=predictions,
                    target_class_id=target_class_id,
                    target_box=target_box,
                )

            except Exception as exc:
                logger.warning("LIME perturbation prediction failed: %s", exc)
                score = 0.0

            score = max(0.0, min(1.0, float(score)))
            outputs.append([1.0 - score, score])

        return np.array(outputs, dtype=np.float32)

    return predict_fn


def generate_detection_lime_explanation(
    model_filename: str,
    image: Image.Image,
    models_dir: Path,
    model_input_feature_size: int,
    detection_index: Optional[int] = None,
    target_class_id: Optional[int] = None,
    num_samples: int = 100,
    num_features: int = 8,
):
    model_path = ensure_model_available(model_filename, models_dir)

    image_size = (model_input_feature_size, model_input_feature_size)
    input_image = _image_to_numpy(image, image_size)

    original_result = predict_with_model_file(
        image,
        model_path,
        model_input_feature_size,
    )

    predictions = original_result.get("predictions", [])

    target_detection = _pick_detection(
        predictions=predictions,
        detection_index=detection_index,
        target_class_id=target_class_id,
    )

    target_box = target_detection.get("box")
    if not target_box or len(target_box) != 4:
        raise ValueError("Selected detection does not have a valid box.")

    selected_class_id = int(target_detection.get("class_id"))
    selected_class_name = target_detection.get("class_name", str(selected_class_id))
    selected_confidence = float(target_detection.get("confidence", 0.0))

    predict_fn = build_detection_predict_fn(
        model_path=model_path,
        model_input_feature_size=model_input_feature_size,
        target_class_id=selected_class_id,
        target_box=target_box,
    )

    explainer = lime_image.LimeImageExplainer()

    explanation = explainer.explain_instance(
        input_image,
        predict_fn,
        top_labels=2,
        hide_color=0,
        num_samples=num_samples,
    )

    temp, mask = explanation.get_image_and_mask(
        label=1,
        positive_only=True,
        num_features=num_features,
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
        "numFeatures": num_features,
        "selectedDetection": {
            "class_id": selected_class_id,
            "class_name": selected_class_name,
            "confidence": selected_confidence,
            "box": target_box,
        },
        "limeImage": f"data:image/png;base64,{encoded}",
        "originalPrediction": original_result,
    }