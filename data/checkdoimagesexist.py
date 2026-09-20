import json
from pathlib import Path

JSON_PATH = Path("image_labels.json")   # or train_labels.json / test_labels.json
IMAGES_DIR = Path("images")             # folder that should contain the images


def find_missing_images(json_path: Path, images_dir: Path):
    with open(json_path, "r", encoding="utf-8") as f:
        coco = json.load(f)

    expected_files = {img["file_name"] for img in coco.get("images", [])}

    actual_files = {
        p.name
        for p in images_dir.iterdir()
        if p.is_file() and not p.name.startswith("._")
    }

    missing = sorted(expected_files - actual_files)
    extra = sorted(actual_files - expected_files)

    print(f"Images listed in JSON: {len(expected_files)}")
    print(f"Files found in folder: {len(actual_files)}")
    print(f"Missing files: {len(missing)}")
    print(f"Extra files: {len(extra)}")

    if missing:
        print("\nMissing image files:")
        for name in missing[:50]:
            print(name)
        if len(missing) > 50:
            print(f"... and {len(missing) - 50} more")

    if extra:
        print("\nExtra files not referenced in JSON:")
        for name in extra[:50]:
            print(name)
        if len(extra) > 50:
            print(f"... and {len(extra) - 50} more")

    return missing, extra


if __name__ == "__main__":
    find_missing_images(JSON_PATH, IMAGES_DIR)