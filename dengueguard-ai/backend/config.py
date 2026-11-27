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

# ---- Phase 2 (onsite) ------------------------------------------------------
# Onsite workbook = the Phase 1 dataset (identical dates/wards/cases) plus three
# supply columns. Used only to derive per-case supply rates and the planning
# baseline bed capacity; forecasting still uses the Phase 1 model unchanged.
ONSITE_XLSX = DATA_DIR / "bangladesh_dengue_large_dataset_onsite.xlsx"
ONSITE_CSV = DATA_DIR / "onsite_supplies.csv"
SUPPLY_COLUMNS = ("saline_bags_needed", "diagnostic_kits_needed", "hospital_beds_required")
# Nominal rates quoted to users; the exact values are fitted from the workbook at startup.
NOMINAL_SUPPLY_RATES = {"saline_bags_needed": 2.39, "diagnostic_kits_needed": 1.17, "hospital_beds_required": 0.30}
CAPACITY_QUANTILE = 0.90
EXPORTS_DIR = ROOT / "exports"
