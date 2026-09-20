import asyncio
import base64
import logging
import os
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont
from starlette.middleware.base import BaseHTTPMiddleware

from model_store import ensure_model_available
from prediction import load_image_from_url, predict_with_model_file

MODELS_DIR = Path(os.getenv("MODELS_DIR", "./models"))
BOX_COLOR = "yellow"
TEXT_COLOR = "black"
TEXT_BG_COLOR = "yellow"
LINE_WIDTH = 2
FONT_SIZE = 13

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://helminthdetect.app",
        "https://www.helminthdetect.app",
        "http://localhost:7139",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        logger.info("Request: %s %s", request.method, request.url)
        response = await call_next(request)
        logger.info("Response: %s", response.status_code)
        return response


app.add_middleware(LoggingMiddleware)

jobs: Dict[str, Dict[str, object]] = {}
connections: Dict[str, WebSocket] = {}


def _pil_from_bytes(data: bytes) -> Image.Image:
    if not data:
        raise ValueError("Uploaded image is empty.")

    try:
        img = Image.open(BytesIO(data))
        img.load()
        return img.convert("RGB")
    except Exception as exc:
        raise ValueError(f"Unable to decode uploaded image: {exc}") from exc


async def _read_upload_as_pil(upload: UploadFile) -> Image.Image:
    if upload.content_type and not upload.content_type.startswith("image/"):
        raise ValueError(f"Uploaded file is not an image (content-type={upload.content_type})")

    data = await upload.read()
    return _pil_from_bytes(data)


def load_font(font_size: int):
    candidates = [
        Path(__file__).resolve().parent / "Arial.ttf",
    ]

    for candidate in candidates:
        try:
            return ImageFont.truetype(str(candidate), font_size)
        except Exception:
            continue

    return ImageFont.load_default()


def _encode_image_to_base64(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"

def _annotate_image(image: Image.Image, results: List[Dict[str, object]]) -> Image.Image:
    annotated = image.convert("RGB").copy()
    draw = ImageDraw.Draw(annotated)
    font = load_font(FONT_SIZE)

    class_colors = {
        0: ("yellow", "black"),
        1: ("red", "white"),
        2: ("lime", "black"),
        3: ("cyan", "black"),
        4: ("orange", "black"),
        5: ("magenta", "white"),
        6: ("blue", "white"),
        7: ("purple", "white"),
        8: ("gold", "black"),
        9: ("deeppink", "white"),
        10: ("white", "black"),
    }

    default_box_color = BOX_COLOR
    default_text_color = TEXT_COLOR

    for model_index, item in enumerate(results, start=1):
        predictions = item.get("prediction", {}).get("predictions", [])

        for prediction in predictions:
            box = prediction.get("box")
            cls_id = int(prediction.get("class_id", -1)) if prediction.get("class_id") is not None else -1
            label_text = prediction.get("class_name", str(cls_id))
            confidence = prediction.get("confidence")

            if not box or len(box) != 4:
                continue

            box_color, text_color = class_colors.get(cls_id, (default_box_color, default_text_color))
            x1, y1, x2, y2 = box

            if confidence is not None:
                label = f"{label_text} {float(confidence):.2f}"
            else:
                label = str(label_text)

            draw.rectangle([x1, y1, x2, y2], outline=box_color, width=LINE_WIDTH)

            text_bbox = draw.textbbox((0, 0), label, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]

            pad = 2
            text_x = x1
            text_y = y1 - text_h - 2 * pad - 2

            if text_y < 0:
                text_y = y2 + 2

            if text_x + text_w + 2 * pad > annotated.width:
                text_x = max(0, annotated.width - text_w - 2 * pad)

            if text_y + text_h + 2 * pad > annotated.height:
                text_y = max(0, annotated.height - text_h - 2 * pad)

            draw.rectangle(
                [text_x, text_y, text_x + text_w + 2 * pad, text_y + text_h + 2 * pad],
                fill=box_color,
            )
            draw.text((text_x + pad, text_y + pad), label, fill=text_color, font=font)
    
    return annotated


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/predict/batch")
async def predict_batch(
    modelInputFeatureSize: int = Form(...),
    modelFilenames: List[str] = Form(...),
    image: Optional[UploadFile] = File(None),
    imageUrl: Optional[str] = Form(None),
):
    if image is None and not imageUrl:
        raise HTTPException(
            status_code=400,
            detail="Provide an image file (form-data 'image') or an imageUrl (form field).",
        )

    if not modelFilenames:
        raise HTTPException(status_code=400, detail="At least one model filename is required.")

    if modelInputFeatureSize <= 0:
        raise HTTPException(status_code=400, detail="modelInputFeatureSize must be a positive integer.")

    try:
        if image is not None:
            logger.info("Loading image from uploaded file: %s", image.filename)
            pil_img = await _read_upload_as_pil(image)
        else:
            logger.info("Fetching image from URL: %s", imageUrl)
            pil_img = load_image_from_url(imageUrl)

        job_id = str(uuid4())
        jobs[job_id] = {
            "status": "queued",
            "total_models": len(modelFilenames),
            "completed_models": 0,
            "results": [],
            "errors": [],
            "annotated_image": None,
        }

        asyncio.create_task(
            process_models(
                job_id=job_id,
                image=pil_img,
                model_filenames=modelFilenames,
                model_input_feature_size=modelInputFeatureSize,
            )
        )

        return {
            "job_id": job_id,
            "total_models": len(modelFilenames),
        }

    except ValueError as exc:
        logger.error("Validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error while starting batch prediction")
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@app.get("/predict/status/{job_id}")
def predict_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()
    connections[job_id] = websocket

    job = jobs.get(job_id)
    if job:
        await websocket.send_json(
            {
                "type": "connected",
                "job_id": job_id,
                "status": job["status"],
                "total_models": job["total_models"],
                "completed_models": job["completed_models"],
                "results": job["results"],
                "errors": job["errors"],
                "annotated_image": job.get("annotated_image"),
            }
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for job_id=%s", job_id)
    except Exception:
        logger.exception("WebSocket error for job_id=%s", job_id)
    finally:
        connections.pop(job_id, None)


async def _send_ws(job_id: str, payload: dict):
    websocket = connections.get(job_id)
    if websocket is None:
        return

    try:
        await websocket.send_json(payload)
    except Exception:
        logger.exception("Failed sending websocket message for job_id=%s", job_id)
        connections.pop(job_id, None)


async def process_models(
    job_id: str,
    image: Image.Image,
    model_filenames: List[str],
    model_input_feature_size: int,
):
    jobs[job_id]["status"] = "running"

    await _send_ws(
        job_id,
        {
            "type": "started",
            "job_id": job_id,
            "total_models": len(model_filenames),
        },
    )

    for idx, model_filename in enumerate(model_filenames, start=1):
        try:
            logger.info("Processing model %s for job %s", model_filename, job_id)

            model_path = ensure_model_available(model_filename, MODELS_DIR)
            result = await asyncio.to_thread(
                predict_with_model_file,
                image,
                model_path,
                model_input_feature_size,
            )

            item = {
                "modelFilename": model_filename,
                "prediction": result,
                "index": idx,
            }

            jobs[job_id]["results"].append(item)
            jobs[job_id]["completed_models"] += 1

            await _send_ws(
                job_id,
                {
                    "type": "prediction",
                    "job_id": job_id,
                    "data": item,
                    "progress": {
                        "completed": jobs[job_id]["completed_models"],
                        "total": jobs[job_id]["total_models"],
                    },
                },
            )

        except FileNotFoundError as exc:
            logger.error("Model not found: %s", exc)
            error_item = {
                "modelFilename": model_filename,
                "error": str(exc),
                "index": idx,
            }
            jobs[job_id]["errors"].append(error_item)
            jobs[job_id]["completed_models"] += 1

            await _send_ws(
                job_id,
                {
                    "type": "model_error",
                    "job_id": job_id,
                    "data": error_item,
                    "progress": {
                        "completed": jobs[job_id]["completed_models"],
                        "total": jobs[job_id]["total_models"],
                    },
                },
            )

        except Exception as exc:
            logger.exception("Prediction failed for model %s", model_filename)
            error_item = {
                "modelFilename": model_filename,
                "error": "Prediction failed",
                "details": str(exc),
                "index": idx,
            }
            jobs[job_id]["errors"].append(error_item)
            jobs[job_id]["completed_models"] += 1

            await _send_ws(
                job_id,
                {
                    "type": "model_error",
                    "job_id": job_id,
                    "data": error_item,
                    "progress": {
                        "completed": jobs[job_id]["completed_models"],
                        "total": jobs[job_id]["total_models"],
                    },
                },
            )

    jobs[job_id]["status"] = "finished"

    annotated_image_b64 = None

    try:
        annotated_image = _annotate_image(image, jobs[job_id]["results"])
        annotated_image_b64 = _encode_image_to_base64(annotated_image)

        logger.info(
        "Annotated image generated for job %s, base64 length=%s",
        job_id,
        len(annotated_image_b64),
        )
    except Exception:
        logger.exception("Failed to annotate image for job %s", job_id)

    jobs[job_id]["status"] = "finished"
    jobs[job_id]["annotated_image"] = annotated_image_b64

    payload = {
        "type": "finished",
        "job_id": job_id,
        "status": jobs[job_id]["status"],
        "results": jobs[job_id]["results"],
        "errors": jobs[job_id]["errors"],
        "annotated_image": jobs[job_id]["annotated_image"],
    }

    await _send_ws(job_id, payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7139)