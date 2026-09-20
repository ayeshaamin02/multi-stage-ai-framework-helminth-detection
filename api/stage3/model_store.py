import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

MIN_EXPECTED_FILE_SIZE = 1_000_000  # 1 MB safety check


def ensure_model_available(model_filename: str, models_dir: Path) -> Path:
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / model_filename

    if model_path.exists():
        logger.info("Model already exists: %s", model_path)
        return model_path

    manifest_path = _manifest_path(models_dir)

    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    entry = _find_manifest_entry(manifest_path, model_filename)
    if not entry:
        raise FileNotFoundError(
            f"No manifest entry found for model '{model_filename}' in {manifest_path}"
        )

    _download_manifest_entry(entry, model_path)

    if not model_path.exists():
        raise FileNotFoundError(
            f"Model download completed but file is still missing: {model_path}"
        )

    return model_path


def download_models_from_manifest(manifest_path: Path, models_dir: Path) -> List[Path]:
    models_dir.mkdir(parents=True, exist_ok=True)

    entries = _load_manifest(manifest_path)
    if not entries:
        raise ValueError(f"Manifest is empty: {manifest_path}")

    downloaded: List[Path] = []

    for entry in entries:
        filename = entry.get("filename")
        if not filename:
            raise ValueError("Manifest entry missing 'filename'.")

        destination = models_dir / filename

        if destination.exists():
            logger.info("Model already exists, skipping: %s", destination)
            continue

        _download_manifest_entry(entry, destination)

        if not destination.exists():
            raise FileNotFoundError(
                f"Model download completed but file is still missing: {destination}"
            )

        downloaded.append(destination)

    return downloaded


def _download_manifest_entry(entry: Dict[str, str], destination: Path) -> None:
    if destination.exists():
        logger.info("Model already exists, skipping download: %s", destination)
        return

    url = entry.get("url")
    if not url:
        raise ValueError("Manifest entry missing 'url'.")

    _download_http(url, destination)


def _load_manifest(manifest_path: Path) -> List[Dict[str, str]]:
    try:
        raw = manifest_path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Manifest not found: {manifest_path}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Manifest is not valid JSON: {manifest_path}") from exc

    if isinstance(data, dict):
        data = data.get("models", [])

    if not isinstance(data, list):
        raise ValueError("Manifest must be a list or an object with a 'models' list.")

    return data


def _find_manifest_entry(
    manifest_path: Path, model_filename: str
) -> Optional[Dict[str, str]]:
    for entry in _load_manifest(manifest_path):
        if entry.get("filename") == model_filename:
            return entry
    return None


def _manifest_path(models_dir: Path) -> Path:
    raw = os.getenv("MODELS_MANIFEST", "").strip()
    if raw:
        return Path(raw)
    return models_dir / "models.json"


def _download_http(url: str, destination: Path) -> None:
    logger.info("Downloading model from URL: %s", url)

    with requests.get(url, stream=True, timeout=120, allow_redirects=True) as response:
        response.raise_for_status()
        _validate_response(response)
        _save_response_content(response, destination)

    _validate_download(destination)
    logger.info("Downloaded model successfully: %s", destination)


def _validate_response(response: requests.Response) -> None:
    content_type = response.headers.get("Content-Type", "").lower()

    if "text/html" in content_type:
        preview = response.text[:500]
        raise RuntimeError(
            "Download returned HTML instead of a file. "
            f"Response preview: {preview}"
        )


def _validate_download(destination: Path) -> None:
    size = destination.stat().st_size

    if size < MIN_EXPECTED_FILE_SIZE:
        raise RuntimeError(
            f"Downloaded file is suspiciously small ({size} bytes): {destination}"
        )


def _save_response_content(response: requests.Response, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)

    with destination.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=32768):
            if chunk:
                handle.write(chunk)