import json
from collections import Counter

with open("merged_labels.json", "r", encoding="utf-8") as f:
    coco = json.load(f)

names = [img["file_name"] for img in coco["images"]]
dupes = [name for name, count in Counter(names).items() if count > 1]

print("Duplicate file names:", len(dupes))
print(dupes[:20])