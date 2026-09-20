from ultralytics import YOLO

model = YOLO("yolo11m.pt")

model.train(
    data="multiclassHelminths/parasite.yaml",
    epochs=100,
    imgsz=640,
    batch=32,
    workers=8,
    optimizer="AdamW",
    lr0=0.00001,
    project="runs/yolo11",
    name="multiclass_helminths_yolo11_m"
)