from ultralytics import RTDETR

model = RTDETR("rtdetr-l.pt")

model.train(
    data="multiclassHelminths/parasite.yaml",
    epochs=100,
    imgsz=640,
    batch=32,
    workers=8,
    optimizer="AdamW",
    lr0=0.00001,
    project="runs/rtdetr",
    name="multiclass_helminths_rtdetr_l"
)