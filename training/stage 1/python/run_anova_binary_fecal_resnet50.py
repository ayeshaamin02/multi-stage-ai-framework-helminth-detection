import os
import subprocess
import time
from collections import deque
from pathlib import Path

TOTAL_ROUNDS = 5
GPU_IDS = ["0", "1"]
TRAIN_SCRIPT = "train_binary_fecal_models.py"
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

BASE_CMD = [
    "python",
    TRAIN_SCRIPT,
    "--base-dir", "./binaryFecal",
    "--batch-size", "32",
    "--learning-rate", "1e-4",
    "--epochs", "30",
    "--image-size", "224",
    "--model-name", "ResNet50",
    "--group-type", "binary",
    "--results-dir", "results",
]


def launch_round(gpu_id: str, round_index: int):
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = gpu_id

    log_path = LOG_DIR / f"round_{round_index}_gpu_{gpu_id}.log"
    log_file = open(log_path, "w", encoding="utf-8")

    cmd = BASE_CMD + ["--round-index", str(round_index)]
    print(f"Starting round {round_index} on GPU {gpu_id} -> {log_path}")

    process = subprocess.Popen(
        cmd,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return process, log_file


def main():
    pending_rounds = deque(range(1, TOTAL_ROUNDS + 1))
    running = {}

    for gpu_id in GPU_IDS:
        if pending_rounds:
            round_index = pending_rounds.popleft()
            process, log_file = launch_round(gpu_id, round_index)
            running[gpu_id] = {
                "round_index": round_index,
                "process": process,
                "log_file": log_file,
            }

    while running:
        finished_gpus = []

        for gpu_id, info in running.items():
            ret = info["process"].poll()
            if ret is not None:
                print(f"Round {info['round_index']} on GPU {gpu_id} finished with code {ret}")
                info["log_file"].close()
                finished_gpus.append(gpu_id)

        for gpu_id in finished_gpus:
            del running[gpu_id]
            if pending_rounds:
                next_round = pending_rounds.popleft()
                process, log_file = launch_round(gpu_id, next_round)
                running[gpu_id] = {
                    "round_index": next_round,
                    "process": process,
                    "log_file": log_file,
                }

        time.sleep(10)

    print("All ANOVA rounds completed.")


if __name__ == "__main__":
    main()
