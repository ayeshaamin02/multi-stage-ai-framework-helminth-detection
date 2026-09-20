import logging
from io import BytesIO
from pathlib import Path
from typing import Dict

import requests
from PIL import Image
from ultralytics import RTDETR, YOLO

logger = logging.getLogger(__name__)


def load_image_from_url(image_url: str) -> Image.Image:
    try:
        response = requests.get(image_url, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Unable to download image from URL '{image_url}': {exc}") from exc

    try:
        return Image.open(BytesIO(response.content)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Unable to decode image from URL '{image_url}': {exc}") from exc


def load_detection_model(model_path: Path):
    """
    Loads the correct Ultralytics model class based on the model filename.

    YOLO models must be loaded with YOLO(...).
    RT-DETR models must be loaded with RTDETR(...).

    Example filenames:
      - multiclass_helminths_yolo11_l_round_1_best.pt  -> YOLO
      - multiclass_helminths_rtdetr_l_round_1_best.pt  -> RTDETR
      - multiclass_helminths_rt-detr_l_round_1_best.pt -> RTDETR
    """
    model_name = model_path.name.lower()

    if "rtdetr" in model_name or "rt-detr" in model_name or "rt_detr" in model_name:
        logger.info("Loading RT-DETR model: %s", model_path.name)
        return RTDETR(str(model_path))

    logger.info("Loading YOLO model: %s", model_path.name)
    return YOLO(str(model_path))


def predict_with_model_file(source_image: Image.Image, model_path: Path, size: int) -> Dict[str, object]:
    name_lower = model_path.name.lower()
    if "yolo" in name_lower:
        model = YOLO(str(model_path))
    else:
        model = RTDETR(str(model_path))
    results = model.predict(source_image, imgsz=size, conf=0.25, save=False)

    predictions = []

    for result in results:
        boxes = result.boxes

        if boxes is None or len(boxes) == 0:
            continue

        for idx in range(len(boxes)):
            cls_id = int(boxes.cls[idx].item())
            confidence = float(boxes.conf[idx].item())
            x1, y1, x2, y2 = [float(v) for v in boxes.xyxy[idx].tolist()]

            model_names = getattr(model, "names", {}) or {}

            if cls_id not in model_names:
                logger.warning(
                    "Invalid class_id=%s from model=%s. Available class IDs=%s",
                    cls_id,
                    model_path.name,
                    list(model_names.keys()),
                )
                class_name = str(cls_id)
            else:
                class_name = model_names[cls_id]

            predictions.append(
                {
                    "class_id": cls_id,
                    "class_name": class_name,
                    "confidence": confidence,
                    "box": [x1, y1, x2, y2],
                }
            )

    return {
        "model_filename": model_path.name,
        "model_type": "rtdetr"
        if any(token in model_path.name.lower() for token in ["rtdetr", "rt-detr", "rt_detr"])
        else "yolo",
        "detections": len(predictions),
        "predictions": predictions,
    }