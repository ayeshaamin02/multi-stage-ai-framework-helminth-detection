from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path
from typing import Optional, List
from io import BytesIO
from uuid import uuid4
from PIL import Image
import logging
import asyncio
import os
import gc

from prediction import (
    load_image_from_url,
    predict_image,
)
from gradcam import generate_gradcam_base64
from model_cache import get_model
from model_store import ensure_model_available
from lime_explainer import generate_lime_explanation

MODELS_DIR = Path(os.getenv("MODELS_DIR", "./models"))
JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "300"))
MAX_CONCURRENT_INFERENCE = int(os.getenv("MAX_CONCURRENT_INFERENCE", "2"))
LIME_DEFAULT_SAMPLES = int(os.getenv("LIME_DEFAULT_SAMPLES", "1000"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://uticlassification.app",
        "https://www.uticlassification.app",
        "http://localhost:7137",
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

# -------------------------
# In-memory job state
# -------------------------
jobs = {}
gradcam_connections = {}
connections = {}
job_images = {}
lime_connections = {}
lime_locks = {}
inference_semaphore = asyncio.Semaphore(MAX_CONCURRENT_INFERENCE)


async def _run_inference(func, *args):
    async with inference_semaphore:
        return await asyncio.to_thread(func, *args)


def _predict_with_cached_model(image: Image.Image, model_path: Path, size: int):
    model = get_model(model_path)
    return predict_image(model, image, size, model_path.name)

def _pil_from_bytes(data: bytes) -> Image.Image:
    if not data:
        raise ValueError("Uploaded image is empty.")
    try:
        img = Image.open(BytesIO(data))
        img.load()
        return img
    except Exception as exc:
        raise ValueError(f"Unable to decode uploaded image: {exc}") from exc


async def _read_upload_as_pil(upload: UploadFile) -> Image.Image:
    if upload.content_type and not upload.content_type.startswith("image/"):
        raise ValueError(f"Uploaded file is not an image (content-type={upload.content_type})")

    data = await upload.read()
    return _pil_from_bytes(data)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/predict/batch")
async def predict_batch(
    modelInputFeatureSize: int = Form(...),
    modelFilenames: List[str] = Form(...),  # repeated form-data key: modelFilenames
    image: Optional[UploadFile] = File(None),
    imageUrl: Optional[str] = Form(None),
):
    """
    Accepts multipart/form-data:
      - modelInputFeatureSize: int
      - modelFilenames: repeated form field
          e.g. modelFilenames=model1.keras
               modelFilenames=model2.keras
      - image: uploaded file
      - imageUrl: optional fallback

    Returns:
      {
        "job_id": "...",
        "total_models": 3
      }
    """

    if image is None and not imageUrl:
        raise HTTPException(
            status_code=400,
            detail="Provide an image file (form-data 'image') or an imageUrl (form field).",
        )

    if not modelFilenames:
        raise HTTPException(status_code=400, detail="At least one model filename is required.")

    try:
        # Load image once
        if image is not None:
            logger.info("Loading image from uploaded file: %s", image.filename)
            pil_img = await _read_upload_as_pil(image)
        else:
            logger.info("Fetching image from URL: %s", imageUrl)
            pil_img = load_image_from_url(imageUrl)

        job_id = str(uuid4())

        job_images[job_id] = pil_img.copy()

        jobs[job_id] = {
            "status": "queued",
            "total_models": len(modelFilenames),
            "completed_models": 0,
            "results": [],
            "gradcams": [],
            "errors": [],
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

    # If job already exists, send initial state
    job = jobs.get(job_id)
    if job:
        await websocket.send_json({
            "type": "connected",
            "job_id": job_id,
            "status": job["status"],
            "total_models": job["total_models"],
            "completed_models": job["completed_models"],
            "results": job["results"],
            "errors": job["errors"],
        })

    try:
        while True:
            # keep socket alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for job_id=%s", job_id)
    except Exception:
        logger.exception("WebSocket error for job_id=%s", job_id)
    finally:
        if connections.get(job_id) is websocket:
            connections.pop(job_id, None)


@app.websocket("/ws/gradcam/{job_id}")
async def websocket_gradcam_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()
    gradcam_connections[job_id] = websocket

    job = jobs.get(job_id)
    if job:
        await websocket.send_json({
            "type": "connected",
            "job_id": job_id,
            "status": job["status"],
            "total_models": job["total_models"],
            "completed_models": job["completed_models"],
            "gradcams": job.get("gradcams", []),
            "errors": job["errors"],
        })

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("GradCAM websocket disconnected for job_id=%s", job_id)
    except Exception:
        logger.exception("GradCAM websocket error for job_id=%s", job_id)
    finally:
        if gradcam_connections.get(job_id) is websocket:
            gradcam_connections.pop(job_id, None)

@app.websocket("/ws/lime/{job_id}")
async def websocket_lime_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()
    lime_connections[job_id] = websocket

    if job_id not in jobs:
        await websocket.send_json({
            "type": "error",
            "job_id": job_id,
            "error": "Job not found."
        })
        await websocket.close()
        return

    await websocket.send_json({
        "type": "connected",
        "job_id": job_id,
        "message": "LIME websocket connected."
    })

    try:
        while True:
            payload = await websocket.receive_json()

            model_filename = payload.get("modelFilename")
            
            try:
                num_samples = int(payload.get("numSamples", LIME_DEFAULT_SAMPLES))
            except Exception:
                num_samples = LIME_DEFAULT_SAMPLES

            num_samples = max(50, min(num_samples, 1000))

            if not model_filename:
                await websocket.send_json({
                    "type": "lime_error",
                    "job_id": job_id,
                    "error": "modelFilename is required."
                })
                continue

            image = job_images.get(job_id)

            if image is None:
                await websocket.send_json({
                    "type": "lime_error",
                    "job_id": job_id,
                    "modelFilename": model_filename,
                    "error": "Original image for this job is no longer available."
                })
                continue

            await websocket.send_json({
                "type": "lime_started",
                "job_id": job_id,
                "modelFilename": model_filename,
                "numSamples": num_samples,
            })

            try:
                lock = lime_locks.setdefault(job_id, asyncio.Lock())

                if lock.locked():
                    await websocket.send_json({
                        "type": "lime_error",
                        "job_id": job_id,
                        "modelFilename": model_filename,
                        "error": "A LIME explanation is already running for this job."
                    })
                    continue

                async with lock:
                    lime_result = await _run_inference(
                        generate_lime_explanation,
                        model_filename,
                        image.copy(),
                        ["Negative", "Positive"],
                        num_samples,
                    )

                    gc.collect()

                await websocket.send_json({
                    "type": "lime",
                    "job_id": job_id,
                    "modelFilename": model_filename,
                    "data": lime_result,
                })

            except Exception as exc:
                logger.exception("LIME failed for model %s", model_filename)

                await websocket.send_json({
                    "type": "lime_error",
                    "job_id": job_id,
                    "modelFilename": model_filename,
                    "error": "LIME generation failed",
                    "details": str(exc),
                })

    except WebSocketDisconnect:
        logger.info("LIME websocket disconnected for job_id=%s", job_id)
    except Exception:
        logger.exception("LIME websocket error for job_id=%s", job_id)
    finally:
        if lime_connections.get(job_id) is websocket:
            lime_connections.pop(job_id, None)

async def _send_ws(job_id: str, payload: dict):
    websocket = connections.get(job_id)
    if websocket is None:
        return

    try:
        await websocket.send_json(payload)
    except Exception:
        logger.exception("Failed sending websocket message for job_id=%s", job_id)
        connections.pop(job_id, None)


async def _send_ws_gradcam(job_id: str, payload: dict):
    websocket = gradcam_connections.get(job_id)
    if websocket is None:
        return

    try:
        await websocket.send_json(payload)
    except Exception:
        logger.exception("Failed sending gradcam websocket message for job_id=%s", job_id)
        gradcam_connections.pop(job_id, None)


async def process_models(
    job_id: str,
    image: Image.Image,
    model_filenames: List[str],
    model_input_feature_size: int,
):
    try:
        jobs[job_id]["status"] = "running"

        await _send_ws(job_id, {
            "type": "started",
            "job_id": job_id,
            "total_models": len(model_filenames),
        })

        for idx, model_filename in enumerate(model_filenames, start=1):
            try:
                logger.info("Processing model %s for job %s", model_filename, job_id)

                model_path = ensure_model_available(model_filename, MODELS_DIR)

                result = await _run_inference(
                    _predict_with_cached_model,
                    image,
                    model_path,
                    model_input_feature_size,
                )

                gc.collect()

                item = {
                    "modelFilename": model_filename,
                    "classification": result,
                    "index": idx,
                }

                jobs[job_id]["results"].append(item)
                jobs[job_id]["completed_models"] += 1

                await _send_ws(job_id, {
                    "type": "prediction",
                    "job_id": job_id,
                    "data": item,
                    "progress": {
                        "completed": jobs[job_id]["completed_models"],
                        "total": jobs[job_id]["total_models"],
                    }
                })

                try:
                    gradcam_image = await _run_inference(
                        generate_gradcam_base64,
                        image,
                        model_path,
                        model_input_feature_size,
                    )

                    gc.collect()

                    gradcam_item = {
                        "modelFilename": model_filename,
                        "gradcamImage": gradcam_image,
                        "index": idx,
                    }

                    jobs[job_id]["gradcams"].append(gradcam_item)

                    await _send_ws_gradcam(job_id, {
                        "type": "gradcam",
                        "job_id": job_id,
                        "data": gradcam_item,
                        "progress": {
                            "completed": jobs[job_id]["completed_models"],
                            "total": jobs[job_id]["total_models"],
                        }
                    })
                except Exception as exc:
                    logger.exception("GradCAM failed for model %s", model_filename)
                    gradcam_error = {
                        "modelFilename": model_filename,
                        "error": "GradCAM generation failed",
                        "details": str(exc),
                        "index": idx,
                    }
                    jobs[job_id]["errors"].append(gradcam_error)
                    await _send_ws_gradcam(job_id, {
                        "type": "gradcam_error",
                        "job_id": job_id,
                        "data": gradcam_error,
                        "progress": {
                            "completed": jobs[job_id]["completed_models"],
                            "total": jobs[job_id]["total_models"],
                        }
                    })

            except FileNotFoundError as exc:
                logger.error("Model not found: %s", exc)
                error_item = {
                    "modelFilename": model_filename,
                    "error": str(exc),
                    "index": idx,
                }
                jobs[job_id]["errors"].append(error_item)
                jobs[job_id]["completed_models"] += 1

                await _send_ws(job_id, {
                    "type": "model_error",
                    "job_id": job_id,
                    "data": error_item,
                    "progress": {
                        "completed": jobs[job_id]["completed_models"],
                        "total": jobs[job_id]["total_models"],
                    }
                })

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

                await _send_ws(job_id, {
                    "type": "model_error",
                    "job_id": job_id,
                    "data": error_item,
                    "progress": {
                        "completed": jobs[job_id]["completed_models"],
                        "total": jobs[job_id]["total_models"],
                    }
                })

        jobs[job_id]["status"] = "finished"

        await _send_ws(job_id, {
            "type": "finished",
            "job_id": job_id,
            "results": jobs[job_id]["results"],
            "errors": jobs[job_id]["errors"],
        })
        await _send_ws_gradcam(job_id, {
            "type": "gradcam_finished",
            "job_id": job_id,
            "gradcams": jobs[job_id].get("gradcams", []),
            "errors": jobs[job_id]["errors"],
        })
    except Exception:
        logger.exception("Batch job failed unexpectedly for job_id=%s", job_id)
        if job_id in jobs:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["errors"].append({"error": "Batch job failed unexpectedly"})
    finally:
        asyncio.create_task(cleanup_job_later(job_id))

async def cleanup_job_later(job_id: str, delay_seconds: int = JOB_TTL_SECONDS):
    await asyncio.sleep(delay_seconds)

    jobs.pop(job_id, None)
    job_images.pop(job_id, None)
    connections.pop(job_id, None)
    gradcam_connections.pop(job_id, None)
    lime_connections.pop(job_id, None)
    lime_locks.pop(job_id, None)

    logger.info("Cleaned up job_id=%s from memory", job_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7137)
