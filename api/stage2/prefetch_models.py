import logging
import os
import sys
from pathlib import Path

from model_store import download_models_from_manifest


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> int:
    models_dir = Path(os.getenv("MODELS_DIR", "./models"))
    manifest_path = Path(os.getenv("MODELS_MANIFEST", str(models_dir / "models.json")))

    try:
        downloaded = download_models_from_manifest(manifest_path, models_dir)
    except Exception as exc:
        logger.error("Model prefetch failed: %s", exc)
        return 1

    if downloaded:
        logger.info("Downloaded %d model(s).", len(downloaded))
    else:
        logger.info("All models already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
