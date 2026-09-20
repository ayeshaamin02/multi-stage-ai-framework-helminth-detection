from pathlib import Path
from model_store import download_models_from_manifest

models_dir = Path("./models")
manifest_path = models_dir / "models.json"

downloaded = download_models_from_manifest(manifest_path, models_dir)

print("Downloaded models:")
for m in downloaded:
    print(m)