import argparse
import gc
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
import tensorflow as tf
from sklearn.metrics import (
    auc,
    balanced_accuracy_score,
    cohen_kappa_score,
    confusion_matrix,
    fbeta_score,
    jaccard_score,
    log_loss,
    matthews_corrcoef,
    precision_recall_fscore_support,
    roc_curve,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train one binary-classification round with a frozen ImageNet backbone."
    )
    parser.add_argument("--base-dir", default="./binaryFecal", help="Dataset root with train/dev/test folders")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument(
        "--model-name",
        default="VGG19",
        choices=[
            "VGG19",
            "ResNet50",
            "EfficientNetB0",
            "MobileNetV2",
            "NASNetMobile",
            "DenseNet169",
            "ConvNeXtBase",
        ],
    )
    parser.add_argument("--group-type", default="binary")
    parser.add_argument("--results-dir", default="results")
    parser.add_argument("--round-index", type=int, required=True, help="ANOVA round number, e.g. 1")
    return parser.parse_args()


def configure_environment() -> None:
    gpus = tf.config.list_physical_devices("GPU")
    for gpu in gpus:
        tf.config.experimental.set_memory_growth(gpu, True)


def get_backbone_and_preprocess(model_name: str, image_size: int):
    if model_name == "VGG19":
        backbone = tf.keras.applications.VGG19(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.vgg19.preprocess_input

    elif model_name == "ResNet50":
        backbone = tf.keras.applications.ResNet50(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.resnet50.preprocess_input

    elif model_name == "EfficientNetB0":
        backbone = tf.keras.applications.EfficientNetB0(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.efficientnet.preprocess_input

    elif model_name == "MobileNetV2":
        backbone = tf.keras.applications.MobileNetV2(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.mobilenet_v2.preprocess_input

    elif model_name == "NASNetMobile":
        backbone = tf.keras.applications.NASNetMobile(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.nasnet.preprocess_input

    elif model_name == "DenseNet169":
        backbone = tf.keras.applications.DenseNet169(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.densenet.preprocess_input

    elif model_name == "ConvNeXtBase":
        backbone = tf.keras.applications.ConvNeXtBase(
            input_shape=(image_size, image_size, 3),
            include_top=False,
            weights="imagenet",
        )
        preprocess_fn = tf.keras.applications.convnext.preprocess_input

    else:
        raise ValueError(f"Unsupported model name: {model_name}")

    backbone.trainable = False
    return backbone, preprocess_fn


def get_datasets(base_dir: str, image_size: int, batch_size: int):
    train_ds = tf.keras.utils.image_dataset_from_directory(
        Path(base_dir) / "train",
        labels="inferred",
        label_mode="binary",
        image_size=(image_size, image_size),
        batch_size=batch_size,
        shuffle=True,
    )

    val_ds = tf.keras.utils.image_dataset_from_directory(
        Path(base_dir) / "dev",
        labels="inferred",
        label_mode="binary",
        image_size=(image_size, image_size),
        batch_size=batch_size,
        shuffle=True,
    )

    test_ds = tf.keras.utils.image_dataset_from_directory(
        Path(base_dir) / "test",
        labels="inferred",
        label_mode="binary",
        image_size=(image_size, image_size),
        batch_size=batch_size,
        shuffle=False,
    )

    return train_ds, val_ds, test_ds, train_ds.class_names


def augment_and_preprocess(train_ds, val_ds, test_ds, preprocess_fn):
    augmenter = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.05),
            tf.keras.layers.RandomZoom(0.05),
            tf.keras.layers.RandomContrast(0.1),
        ]
    )

    train_ds = train_ds.map(
        lambda x, y: (preprocess_fn(augmenter(x, training=True)), y),
        num_parallel_calls=tf.data.AUTOTUNE,
    )
    val_ds = val_ds.map(
        lambda x, y: (preprocess_fn(x), y),
        num_parallel_calls=tf.data.AUTOTUNE,
    )
    test_ds = test_ds.map(
        lambda x, y: (preprocess_fn(x), y),
        num_parallel_calls=tf.data.AUTOTUNE,
    )

    train_ds = train_ds.prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.prefetch(tf.data.AUTOTUNE)
    test_ds = test_ds.prefetch(tf.data.AUTOTUNE)
    return train_ds, val_ds, test_ds


def create_model(model_name: str, image_size: int, learning_rate: float):
    backbone, _ = get_backbone_and_preprocess(model_name, image_size)

    model = tf.keras.Sequential(
        [
            tf.keras.Input(shape=(image_size, image_size, 3)),
            backbone,
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(256, activation="relu"),
            tf.keras.layers.Dropout(0.5),
            tf.keras.layers.Dense(1, activation="sigmoid"),
        ]
    )

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="binary_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )
    return model


def save_training_metrics(history, results_dir: Path) -> None:
    plt.figure(figsize=(10, 5))
    plt.plot(history.history["accuracy"], label="Training Accuracy")
    plt.plot(history.history["val_accuracy"], label="Validation Accuracy")
    plt.title("Model Accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.legend(loc="lower right")
    plt.tight_layout()
    plt.savefig(results_dir / "training_accuracy.png")
    plt.close()

    plt.figure(figsize=(10, 5))
    plt.plot(history.history["loss"], label="Training Loss")
    plt.plot(history.history["val_loss"], label="Validation Loss")
    plt.title("Model Loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.legend(loc="upper right")
    plt.tight_layout()
    plt.savefig(results_dir / "training_loss.png")
    plt.close()

    with open(results_dir / "training_validation_metrics.txt", "w", encoding="utf-8") as f:
        f.write("Training and Validation Metrics Per Epoch\n")
        f.write("=" * 50 + "\n")
        for i, (acc, val_acc, loss, val_loss) in enumerate(
            zip(
                history.history["accuracy"],
                history.history["val_accuracy"],
                history.history["loss"],
                history.history["val_loss"],
            ),
            start=1,
        ):
            f.write(f"Epoch {i}\n")
            f.write(f"  Training Accuracy: {acc:.4f}\n")
            f.write(f"  Validation Accuracy: {val_acc:.4f}\n")
            f.write(f"  Training Loss: {loss:.4f}\n")
            f.write(f"  Validation Loss: {val_loss:.4f}\n")
            f.write("-" * 50 + "\n")


def save_confusion_matrix(y_true, y_pred, class_names, results_dir: Path) -> None:
    cm = confusion_matrix(y_true, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", xticklabels=class_names, yticklabels=class_names)
    plt.title("Confusion Matrix")
    plt.xlabel("Predicted Label")
    plt.ylabel("True Label")
    plt.tight_layout()
    plt.savefig(results_dir / "confusion_matrix.png")
    plt.close()


def save_roc_curve(y_true, y_probs, results_dir: Path) -> float:
    fpr, tpr, _ = roc_curve(y_true, y_probs)
    roc_auc = auc(fpr, tpr)

    plt.figure(figsize=(10, 6))
    plt.plot(fpr, tpr, lw=2, label=f"ROC Curve (AUC = {roc_auc:.4f})")
    plt.plot([0, 1], [0, 1], lw=2, linestyle="--")
    plt.title("Receiver Operating Characteristic (ROC)")
    plt.xlabel("False Positive Rate")
    plt.ylabel("True Positive Rate")
    plt.legend(loc="lower right")
    plt.tight_layout()
    plt.savefig(results_dir / "roc_curve.png")
    plt.close()

    return roc_auc


def save_classification_metrics(y_true, y_pred, y_probs, results_dir: Path) -> None:
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()

    sensitivity = tp / (tp + fn) if (tp + fn) else 0.0
    specificity = tn / (tn + fp) if (tn + fp) else 0.0
    mcc = matthews_corrcoef(y_true, y_pred)
    kappa = cohen_kappa_score(y_true, y_pred)
    balanced_acc = balanced_accuracy_score(y_true, y_pred)
    jaccard = jaccard_score(y_true, y_pred, average="binary", zero_division=0)
    logloss = log_loss(y_true, y_probs)
    fbeta = fbeta_score(y_true, y_pred, beta=0.5, zero_division=0)
    roc_auc = save_roc_curve(y_true, y_probs, results_dir)

    with open(results_dir / "classification_metrics.txt", "w", encoding="utf-8") as f:
        f.write(f"Precision: {precision:.4f}\n")
        f.write(f"Recall: {recall:.4f}\n")
        f.write(f"Sensitivity: {sensitivity:.4f}\n")
        f.write(f"Specificity: {specificity:.4f}\n")
        f.write(f"F1-Score: {f1:.4f}\n")
        f.write(f"AUC: {roc_auc:.4f}\n")
        f.write(f"MCC: {mcc:.4f}\n")
        f.write(f"Cohen's Kappa: {kappa:.4f}\n")
        f.write(f"Balanced Accuracy: {balanced_acc:.4f}\n")
        f.write(f"Jaccard Index: {jaccard:.4f}\n")
        f.write(f"Log Loss: {logloss:.4f}\n")
        f.write(f"F0.5-Score: {fbeta:.4f}\n")


def save_model_metrics(model, test_ds, results_dir: Path, class_names) -> None:
    eval_results = model.evaluate(test_ds, verbose=1, return_dict=True)

    with open(results_dir / "testing_metrics.txt", "w", encoding="utf-8") as f:
        for key, value in eval_results.items():
            f.write(f"{key}: {value:.4f}\n")

    y_true = []
    for _, y in test_ds:
        y_true.append(y.numpy().reshape(-1))
    y_true = np.concatenate(y_true, axis=0).astype(int)

    y_probs = model.predict(test_ds, verbose=1).reshape(-1)
    y_pred = (y_probs >= 0.5).astype(int)

    save_confusion_matrix(y_true, y_pred, class_names, results_dir)
    save_classification_metrics(y_true, y_pred, y_probs, results_dir)


def main() -> None:
    args = parse_args()
    configure_environment()

    print(f"Starting round {args.round_index} with {args.model_name}")

    train_ds, val_ds, test_ds, class_names = get_datasets(
        base_dir=args.base_dir,
        image_size=args.image_size,
        batch_size=args.batch_size,
    )

    _, preprocess_fn = get_backbone_and_preprocess(args.model_name, args.image_size)
    train_ds, val_ds, test_ds = augment_and_preprocess(train_ds, val_ds, test_ds, preprocess_fn)

    model = create_model(
        model_name=args.model_name,
        image_size=args.image_size,
        learning_rate=args.learning_rate,
    )

    history = model.fit(train_ds, epochs=args.epochs, validation_data=val_ds)

    run_name = f"{args.group_type.upper()}_{args.model_name}_Round{args.round_index}"
    results_dir = Path(args.results_dir) / args.group_type / args.model_name / run_name
    results_dir.mkdir(parents=True, exist_ok=True)

    model.save(results_dir / f"{run_name}.keras")
    save_training_metrics(history, results_dir)
    save_model_metrics(model, test_ds, results_dir, class_names)

    tf.keras.backend.clear_session()
    del model, history, train_ds, val_ds, test_ds
    gc.collect()


if __name__ == "__main__":
    main()
