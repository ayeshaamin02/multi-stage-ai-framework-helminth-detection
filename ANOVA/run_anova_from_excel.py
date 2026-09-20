import re
from pathlib import Path

import pandas as pd
from scipy.stats import f_oneway
from statsmodels.stats.multicomp import pairwise_tukeyhsd


# ============================================================
# CONFIG
# ============================================================

EXCEL_FILE = "binary-helminths-results-[stage2].xlsx"   # Change this to your Excel file name
SHEET_NAME = 0                      
OUTPUT_DIR = Path("stage2_anova_results")

OUTPUT_DIR.mkdir(exist_ok=True)


# ============================================================
# LOAD EXCEL
# ============================================================

df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME)

# Clean column names
df.columns = [str(col).strip() for col in df.columns]

model_col = df.columns[0]

print(f"Using model column: {model_col}")


# ============================================================
# EXTRACT ARCHITECTURE AND ROUND
# ============================================================

def extract_architecture_and_round(model_name: str):
    """
    Example:
    HELMINTHS_BINARY_VGG19_round1

    Returns:
    Architecture = VGG19
    Round = 1
    """

    model_name = str(model_name).strip()

    pattern = r"HELMINTHS_BINARY_(.+?)_round(\d+)"
    match = re.search(pattern, model_name, re.IGNORECASE)

    if not match:
        raise ValueError(f"Could not parse model name: {model_name}")

    architecture = match.group(1)
    round_number = int(match.group(2))

    return architecture, round_number


df[["Architecture", "Round"]] = df[model_col].apply(
    lambda name: pd.Series(extract_architecture_and_round(name))
)


# ============================================================
# IDENTIFY METRIC COLUMNS
# ============================================================

non_metric_columns = {model_col, "Architecture", "Round"}

metric_columns = [
    col for col in df.columns
    if col not in non_metric_columns
]

print("\nDetected metric columns:")
for metric in metric_columns:
    print(f"- {metric}")


# ============================================================
# VALIDATE DATA
# ============================================================

round_counts = df.groupby("Architecture")["Round"].nunique()

print("\nRounds detected per architecture:")
print(round_counts)

for architecture, count in round_counts.items():
    if count != 5:
        print(
            f"Warning: {architecture} has {count} rounds instead of 5."
        )


# ============================================================
# RUN ANOVA AND TUKEY FOR EACH METRIC
# ============================================================

all_anova_results = []

for metric_name in metric_columns:
    print("\n" + "=" * 70)
    print(f"Running ANOVA for metric: {metric_name}")
    print("=" * 70)

    # Convert metric column to numeric
    df[metric_name] = pd.to_numeric(df[metric_name], errors="coerce")

    metric_df = df[["Architecture", "Round", metric_name]].dropna()

    # Get groups for ANOVA
    groups = [
        group[metric_name].values
        for _, group in metric_df.groupby("Architecture")
    ]

    architecture_names = [
        architecture
        for architecture, _ in metric_df.groupby("Architecture")
    ]

    # Skip metric if not enough groups
    if len(groups) < 2:
        print(f"Skipping {metric_name}: not enough architecture groups.")
        continue

    # Run one-way ANOVA
    f_statistic, p_value = f_oneway(*groups)

    significant = p_value < 0.05

    print(f"F-statistic: {f_statistic:.6f}")
    print(f"p-value: {p_value:.6f}")

    if significant:
        print("Result: Significant difference between architectures.")
    else:
        print("Result: No significant difference between architectures.")

    # Summary statistics
    summary = (
        metric_df.groupby("Architecture")[metric_name]
        .agg(["mean", "std", "min", "max", "count"])
        .reset_index()
    )

    summary["mean ± std"] = (
        summary["mean"].round(4).astype(str)
        + " ± "
        + summary["std"].round(4).astype(str)
    )

    print("\nSummary:")
    print(summary)

    # Tukey HSD
    tukey = pairwise_tukeyhsd(
        endog=metric_df[metric_name],
        groups=metric_df["Architecture"],
        alpha=0.05
    )

    print("\nTukey HSD:")
    print(tukey)

    tukey_df = pd.DataFrame(
        data=tukey.summary().data[1:],
        columns=tukey.summary().data[0]
    )

    # Save individual metric results
    safe_metric_name = (
        metric_name
        .replace(" ", "_")
        .replace("/", "_")
        .replace("\\", "_")
        .replace("'", "")
    )

    summary.to_csv(
        OUTPUT_DIR / f"{safe_metric_name}_summary_statistics.csv",
        index=False
    )

    tukey_df.to_csv(
        OUTPUT_DIR / f"{safe_metric_name}_tukey_hsd.csv",
        index=False
    )

    anova_row = {
        "Metric": metric_name,
        "F-statistic": f_statistic,
        "p-value": p_value,
        "Significant at 0.05": significant,
        "Number of architectures": len(groups),
        "Architectures": ", ".join(architecture_names),
    }

    all_anova_results.append(anova_row)


# ============================================================
# SAVE COMBINED ANOVA RESULTS
# ============================================================

anova_results_df = pd.DataFrame(all_anova_results)

anova_results_df.to_csv(
    OUTPUT_DIR / "all_anova_results.csv",
    index=False
)

# Save cleaned data too
df.to_csv(
    OUTPUT_DIR / "cleaned_model_results.csv",
    index=False
)

print("\nDone.")
print(f"Results saved in: {OUTPUT_DIR.resolve()}")
print("\nMain file:")
print(f"- {OUTPUT_DIR / 'all_anova_results.csv'}")