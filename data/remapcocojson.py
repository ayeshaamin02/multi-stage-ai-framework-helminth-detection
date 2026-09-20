import json

TRAIN_JSON = "train_labels.json"
TEST_JSON = "test_labels.json"
OUTPUT_JSON = "merged_labels.json"


def merge_coco(train_path, test_path, output_path):
    with open(train_path, "r", encoding="utf-8") as f:
        train = json.load(f)

    with open(test_path, "r", encoding="utf-8") as f:
        test = json.load(f)

    # Start with train as the base
    merged = {
        "info": train.get("info", {}),
        "licenses": train.get("licenses", []),
        "categories": train.get("categories", []),
        "images": [],
        "annotations": [],
    }

    # Keep train as-is
    merged["images"].extend(train["images"])
    merged["annotations"].extend(train["annotations"])

    # Find next available IDs after train
    next_image_id = max(img["id"] for img in train["images"]) + 1 if train["images"] else 1
    next_ann_id = max(ann["id"] for ann in train["annotations"]) + 1 if train["annotations"] else 1

    # Map old test image IDs -> new merged image IDs
    image_id_map = {}

    for img in test["images"]:
        old_id = img["id"]
        new_id = next_image_id
        next_image_id += 1

        new_img = dict(img)
        new_img["id"] = new_id

        image_id_map[old_id] = new_id
        merged["images"].append(new_img)

    # Remap test annotations
    for ann in test["annotations"]:
        new_ann = dict(ann)
        new_ann["id"] = next_ann_id
        next_ann_id += 1

        old_image_id = ann["image_id"]
        new_ann["image_id"] = image_id_map[old_image_id]

        merged["annotations"].append(new_ann)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2)

    print(f"Merged file written to: {output_path}")
    print(f"Total images: {len(merged['images'])}")
    print(f"Total annotations: {len(merged['annotations'])}")


if __name__ == "__main__":
    merge_coco(TRAIN_JSON, TEST_JSON, OUTPUT_JSON)