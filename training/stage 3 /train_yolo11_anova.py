import argparse
from ultralytics import YOLO


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", type=str, required=True, help="GPU device, e.g. 0 or 1")
    parser.add_argument("--seed", type=int, required=True, help="Random seed for this run")
    parser.add_argument("--round-name", type=str, required=True, help="Run name suffix")
    return parser.parse_args()


def main():
    args = parse_args()

    model = YOLO("yolo11l.pt")

    model.train(
        data="multiclassHelminths/parasite.yaml",
        epochs=30,
        imgsz=640,
        batch=32,
        workers=8,
        optimizer="AdamW",
        lr0=1e-4,
        device=args.device,
        seed=args.seed,
        deterministic=False,  # avoids the warning pressure from strict deterministic mode
        project="runs/yolo11_anova",
        name=args.round_name,
        exist_ok=False,
        pretrained=True,
        verbose=True,
    )


if __name__ == "__main__":
    main()