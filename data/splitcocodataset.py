import json
import random
import shutil
from pathlib import Path

# -------------------------
# Config
# -------------------------
IMAGES_DIR = Path("images")
COCO_JSON = Path("image_labels.json")
OUTPUT_DIR = Path("multiclassHelminths[SPLIT]")

TRAIN_RATIO = 0.70
DEV_RATIO = 0.20
TEST_RATIO = 0.10

SEED = 42  # for reproducible splits


def split_coco_dataset():
    if abs((TRAIN_RATIO + DEV_RATIO + TEST_RATIO) - 1.0) > 1e-9:
        raise ValueError("TRAIN_RATIO + DEV_RATIO + TEST_RATIO must equal 1.0")

    with open(COCO_JSON, "r", encoding="utf-8") as f:
        coco = json.load(f)

    images = coco["images"]
    annotations = coco["annotations"]
    categories = coco["categories"]
    info = coco.get("info", {})
    licenses = coco.get("licenses", [])

    random.seed(SEED)
    shuffled_images = images[:]
    random.shuffle(shuffled_images)

    total = len(shuffled_images)
    train_count = int(total * TRAIN_RATIO)
    dev_count = int(total * DEV_RATIO)
    test_count = total - train_count - dev_count

    train_images = shuffled_images[:train_count]
    dev_images = shuffled_images[train_count:train_count + dev_count]
    test_images = shuffled_images[train_count + dev_count:]

    def build_split(split_name, split_images):
        split_image_ids = {img["id"] for img in split_images}
        split_annotations = [ann for ann in annotations if ann["image_id"] in split_image_ids]

        split_dir = OUTPUT_DIR / split_name
        split_img_dir = split_dir / "images"
        split_img_dir.mkdir(parents=True, exist_ok=True)

        # Copy images
        missing_files = []
        for img in split_images:
            src = IMAGES_DIR / img["file_name"]
            dst = split_img_dir / img["file_name"]

            if src.exists():
                shutil.copy2(src, dst)
            else:
                missing_files.append(img["file_name"])

        split_coco = {
            "info": info,
            "licenses": licenses,
            "categories": categories,
            "images": split_images,
            "annotations": split_annotations,
        }

        with open(split_dir / "_annotations.coco.json", "w", encoding="utf-8") as f:
            json.dump(split_coco, f, indent=2)

        print(f"\n{split_name.upper()}")
        print(f"Images: {len(split_images)}")
        print(f"Annotations: {len(split_annotations)}")
        if missing_files:
            print(f"Missing image files: {len(missing_files)}")
            for name in missing_files[:10]:
                print(f"  - {name}")
            if len(missing_files) > 10:
                print("  ...")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    build_split("train", train_images)
    build_split("dev", dev_images)
    build_split("test", test_images)

    print("\nDone.")
    print(f"Total images: {total}")
    print(f"Train: {len(train_images)}")
    print(f"Dev:   {len(dev_images)}")
    print(f"Test:  {len(test_images)}")


if __name__ == "__main__":
    split_coco_dataset()