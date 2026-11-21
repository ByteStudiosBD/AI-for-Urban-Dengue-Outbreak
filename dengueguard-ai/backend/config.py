"""Central paths and constants. All paths are relative to the project root
(the folder that contains `backend/`, `data/` and `models/`)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "models"

RAW_XLSX = DATA_DIR / "hackathon_preli_dataset.xlsx"
DATASET_CSV = DATA_DIR / "dataset.csv"
MODEL_FILE = MODELS_DIR / "trained_model.joblib"
METADATA_FILE = MODELS_DIR / "model_metadata.json"

HORIZONS = (2, 3, 4)

# Chronological split by TARGET date (inclusive year ranges).
TRAIN_END = "2022-12-31"
VAL_END = "2023-12-31"  # validation / calibration year = 2023; test = 2024-2025

# Nominal coverage of the split-conformal prediction interval.
INTERVAL_COVERAGE = 0.90
RANDOM_STATE = 42
