import json
import shutil
from pathlib import Path

SRC_ROOT = Path("multiclassHelminths[SPLIT]")
DST_ROOT = Path("multiclassHelminths")

SPLITS = {
    "train": "train",
    "dev": "val",   # dev becomes val for Ultralytics
    "test": "test",
}


def coco_bbox_to_yolo(bbox, img_w, img_h):
    x, y, w, h = bbox

    x_center = (x + w / 2) / img_w
    y_center = (y + h / 2) / img_h
    width = w / img_w
    height = h / img_h

    return x_center, y_center, width, height


def ensure_dirs():
    for split_out in SPLITS.values():
        (DST_ROOT / "images" / split_out).mkdir(parents=True, exist_ok=True)
        (DST_ROOT / "labels" / split_out).mkdir(parents=True, exist_ok=True)


def convert_split(split_in, split_out):
    json_path = SRC_ROOT / split_in / "_annotations.coco.json"
    images_dir = SRC_ROOT / split_in / "images"

    with open(json_path, "r", encoding="utf-8") as f:
        coco = json.load(f)

    images = coco["images"]
    annotations = coco["annotations"]
    categories = coco["categories"]

    # Map image_id -> image info
    image_map = {img["id"]: img for img in images}

    # Group annotations by image_id
    ann_map = {}
    for ann in annotations:
        ann_map.setdefault(ann["image_id"], []).append(ann)

    # Copy images and write label txt files
    missing_images = []
    empty_label_files = 0

    for img in images:
        image_id = img["id"]
        file_name = img["file_name"]
        img_w = img["width"]
        img_h = img["height"]

        src_img = images_dir / file_name
        dst_img = DST_ROOT / "images" / split_out / file_name

        if not src_img.exists():
            missing_images.append(file_name)
            continue

        shutil.copy2(src_img, dst_img)

        label_path = DST_ROOT / "labels" / split_out / f"{Path(file_name).stem}.txt"
        anns = ann_map.get(image_id, [])

        lines = []
        for ann in anns:
            category_id = ann["category_id"]
            bbox = ann["bbox"]

            x_center, y_center, width, height = coco_bbox_to_yolo(bbox, img_w, img_h)

            # clamp to safe range
            x_center = min(max(x_center, 0.0), 1.0)
            y_center = min(max(y_center, 0.0), 1.0)
            width = min(max(width, 0.0), 1.0)
            height = min(max(height, 0.0), 1.0)

            lines.append(
                f"{category_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}"
            )

        with open(label_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        if not lines:
            empty_label_files += 1

    print(f"\nConverted split: {split_in} -> {split_out}")
    print(f"Images in JSON: {len(images)}")
    print(f"Annotations: {len(annotations)}")
    print(f"Missing image files: {len(missing_images)}")
    print(f"Images with no annotations: {empty_label_files}")

    if missing_images:
        print("First missing files:")
        for name in missing_images[:10]:
            print(" -", name)


def write_yaml():
    yaml_path = DST_ROOT / "parasite.yaml"

    names = {
        0: "Ascaris lumbricoides",
        1: "Capillaria philippinensis",
        2: "Enterobius vermicularis",
        3: "Fasciolopsis buski",
        4: "Hookworm egg",
        5: "Hymenolepis diminuta",
        6: "Hymenolepis nana",
        7: "Opisthorchis viverrine",
        8: "Paragonimus spp",
        9: "Taenia spp. egg",
        10: "Trichuris trichiura",
    }

    lines = [
        f"path: {DST_ROOT.resolve()}",
        "train: images/train",
        "val: images/val",
        "test: images/test",
        "",
        "names:",
    ]

    for k, v in names.items():
        lines.append(f"  {k}: {v}")

    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\nWrote dataset YAML: {yaml_path}")


def main():
    ensure_dirs()

    for split_in, split_out in SPLITS.items():
        convert_split(split_in, split_out)

    write_yaml()
    print("\nDone.")


if __name__ == "__main__":
    main()