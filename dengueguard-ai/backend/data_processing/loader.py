"""Load the official hackathon workbook and convert it to a clean, sorted CSV.

Run:  python -m backend.data_processing.loader
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache

import pandas as pd

from backend.config import DATASET_CSV, RAW_XLSX

EXPECTED_COLUMNS = [
    "date", "city", "ward_id", "population_density_sqkm", "water_logging_risk_index",
    "sanitation_score", "avg_temp_c", "max_temp_c", "min_temp_c", "rainfall_mm",
    "relative_humidity_pct", "dengue_cases",
]
WARD_STATIC = ["population_density_sqkm", "water_logging_risk_index", "sanitation_score"]


class DataValidationError(ValueError):
    pass


def _parse_dates(s: pd.Series) -> pd.Series:
    """Accept real datetimes, ISO strings or Excel serial numbers."""
    if pd.api.types.is_datetime64_any_dtype(s):
        return pd.to_datetime(s).dt.normalize()
    if pd.api.types.is_numeric_dtype(s):  # Excel serial (1900 date system)
        return pd.to_datetime(s, unit="D", origin="1899-12-30").dt.normalize()
    return pd.to_datetime(s).dt.normalize()


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns=lambda c: str(c).strip().lower())
    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    if missing:
        raise DataValidationError(f"Workbook is missing columns: {missing}")
    df = df[EXPECTED_COLUMNS].copy()
    df["date"] = _parse_dates(df["date"])
    df["city"] = df["city"].astype(str).str.strip()
    df["ward_id"] = df["ward_id"].astype(str).str.strip()
    num = [c for c in EXPECTED_COLUMNS if c not in ("date", "city", "ward_id")]
    df[num] = df[num].apply(pd.to_numeric, errors="raise")
    df["dengue_cases"] = df["dengue_cases"].astype(int)
    if df.isna().any().any():
        raise DataValidationError(f"Missing values found: {df.isna().sum()[lambda s: s > 0].to_dict()}")
    dups = df.duplicated(["ward_id", "date"]).sum()
    if dups:
        raise DataValidationError(f"{dups} duplicate (ward_id, date) rows")
    if (df["dengue_cases"] < 0).any() or (df["rainfall_mm"] < 0).any():
        raise DataValidationError("Negative cases or rainfall found")
    return df.sort_values(["ward_id", "date"]).reset_index(drop=True)


def coverage_report(df: pd.DataFrame) -> dict:
    per_ward = df.groupby("ward_id")["date"].agg(["min", "max", "count"])
    # every ward should be a continuous weekly series
    gaps = df.groupby("ward_id")["date"].diff().dropna().dt.days
    return {
        "rows": int(len(df)),
        "cities": {c: sorted(g["ward_id"].unique().tolist()) for c, g in df.groupby("city")},
        "ward_count": int(df["ward_id"].nunique()),
        "date_min": df["date"].min().date().isoformat(),
        "date_max": df["date"].max().date().isoformat(),
        "weeks": int(df["date"].nunique()),
        "weeks_per_ward_min": int(per_ward["count"].min()),
        "weeks_per_ward_max": int(per_ward["count"].max()),
        "all_steps_7_days": bool((gaps == 7).all()),
        "zero_case_share": round(float((df["dengue_cases"] == 0).mean()), 4),
        "missing_values": int(df.isna().sum().sum()),
    }


def build_csv() -> pd.DataFrame:
    df = clean(pd.read_excel(RAW_XLSX))
    out = df.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    try:
        out.to_csv(DATASET_CSV, index=False)
    except OSError as exc:
        # Read-only deployments (e.g. serverless hosts): the CSV is only a cache,
        # so keep serving the freshly cleaned data from memory instead of failing.
        logging.getLogger("dengueguard.loader").warning("Could not write %s (%s); using in-memory data", DATASET_CSV, exc)
    return df


@lru_cache(maxsize=1)
def load_dataset() -> pd.DataFrame:
    """Cached loader. Uses the derived CSV if it is newer than the workbook,
    otherwise rebuilds it from the official XLSX (cache invalidation by mtime)."""
    if DATASET_CSV.exists() and DATASET_CSV.stat().st_mtime >= RAW_XLSX.stat().st_mtime:
        return clean(pd.read_csv(DATASET_CSV))
    return build_csv()


if __name__ == "__main__":
    data = build_csv()
    print(f"Wrote {DATASET_CSV}")
    print(json.dumps(coverage_report(data), indent=2))
