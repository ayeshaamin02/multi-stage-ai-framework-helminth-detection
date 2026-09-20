import subprocess
import time
from collections import deque

ROUNDS = 5
GPUS = ["0", "1"]
SEEDS = [101, 202, 303, 404, 505]

PYTHON_BIN = "python"
TRAIN_SCRIPT = "train_rtdetr_anova.py"


def launch_run(round_idx: int, gpu: str, seed: int):
    round_name = f"multiclass_helminths_rtdetr_l_round_{round_idx + 1}"
    cmd = [
        PYTHON_BIN,
        TRAIN_SCRIPT,
        "--device", gpu,
        "--seed", str(seed),
        "--round-name", round_name,
    ]
    print(f"Starting {round_name} on GPU {gpu} with seed {seed}")
    proc = subprocess.Popen(cmd)
    return {
        "proc": proc,
        "gpu": gpu,
        "seed": seed,
        "round_idx": round_idx,
        "round_name": round_name,
    }


def main():
    pending = deque(range(ROUNDS))
    running = []

    while pending or running:
        # Fill free GPUs
        used_gpus = {job["gpu"] for job in running if job["proc"].poll() is None}
        free_gpus = [gpu for gpu in GPUS if gpu not in used_gpus]

        while pending and free_gpus:
            round_idx = pending.popleft()
            gpu = free_gpus.pop(0)
            seed = SEEDS[round_idx]
            running.append(launch_run(round_idx, gpu, seed))

        # Check completed jobs
        still_running = []
        for job in running:
            returncode = job["proc"].poll()
            if returncode is None:
                still_running.append(job)
            else:
                status = "finished" if returncode == 0 else f"failed (code {returncode})"
                print(f"{job['round_name']} on GPU {job['gpu']} {status}")
        running = still_running

        time.sleep(10)

    print("All ANOVA rounds completed.")


if __name__ == "__main__":
    main()