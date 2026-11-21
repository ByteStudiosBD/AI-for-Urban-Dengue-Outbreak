"""Per-ward, chronology-safe feature engineering.

Every feature for a row at reference ("as-of") week t is computed ONLY from
weeks <= t of the SAME ward (groupby('ward_id') + shift/rolling). The target for
horizon h is dengue_cases at week t + h of the same ward. Calendar features of
the target week are deterministic (known in advance) and therefore not leakage.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RAIN_LAGS = (1, 2, 3, 4)
ROLL_WINDOWS = (2, 3, 4)

CITY_CODES = {"Chattogram": 0, "Dhaka North": 1, "Dhaka South": 2, "Gazipur": 3, "Narayanganj": 4}

# Feature groups drive the explanation panel in the UI.
FEATURE_GROUPS: dict[str, list[str]] = {
    "rainfall": [
        "rainfall_mm", *[f"rain_lag{k}" for k in RAIN_LAGS],
        *[f"rain_sum_{w}w" for w in ROLL_WINDOWS], "rain_sum_lag1_4",
    ],
    "temperature": ["avg_temp_c", "max_temp_c", "min_temp_c", "temp_mean_4w", "temp_lag2"],
    "humidity": ["relative_humidity_pct", "humidity_mean_4w", "humidity_lag2"],
    "recent_cases": ["cases_now", "cases_lag1", "cases_lag2", "cases_mean_4w"],
    "ward_vulnerability": [
        "population_density_sqkm", "water_logging_risk_index", "sanitation_score", "city_code",
    ],
    "seasonality": ["target_woy_sin", "target_woy_cos"],
}
FEATURES: list[str] = [f for g in FEATURE_GROUPS.values() for f in g]
# Raw base columns that must exist for every row the model scores.
MIN_HISTORY_WEEKS = max(max(RAIN_LAGS), max(ROLL_WINDOWS), 4)


def add_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add as-of features (no horizon dependence). Input must contain the cleaned
    columns; it is re-sorted by ward/date to guarantee groupwise order."""
    df = df.sort_values(["ward_id", "date"]).reset_index(drop=True).copy()
    g = df.groupby("ward_id", sort=False)

    for k in RAIN_LAGS:
        df[f"rain_lag{k}"] = g["rainfall_mm"].shift(k)
    # rolling totals ending at the as-of week (inclusive), per ward
    for w in ROLL_WINDOWS:
        df[f"rain_sum_{w}w"] = g["rainfall_mm"].transform(lambda s, w=w: s.rolling(w, min_periods=w).sum())
    df["rain_sum_lag1_4"] = df[[f"rain_lag{k}" for k in RAIN_LAGS]].sum(axis=1, min_count=4)

    df["temp_mean_4w"] = g["avg_temp_c"].transform(lambda s: s.rolling(4, min_periods=4).mean())
    df["temp_lag2"] = g["avg_temp_c"].shift(2)
    df["humidity_mean_4w"] = g["relative_humidity_pct"].transform(lambda s: s.rolling(4, min_periods=4).mean())
    df["humidity_lag2"] = g["relative_humidity_pct"].shift(2)

    df["cases_now"] = df["dengue_cases"]
    df["cases_lag1"] = g["dengue_cases"].shift(1)
    df["cases_lag2"] = g["dengue_cases"].shift(2)
    df["cases_mean_4w"] = g["dengue_cases"].transform(lambda s: s.rolling(4, min_periods=4).mean())

    df["city_code"] = df["city"].map(CITY_CODES).astype(float)
    df["history_ok"] = g.cumcount() >= MIN_HISTORY_WEEKS
    return df


def add_horizon(df: pd.DataFrame, h: int) -> pd.DataFrame:
    """Attach target-week calendar features and the target for horizon h.
    `target` is NaN where t+h lies beyond the dataset (true forecasts)."""
    out = df.copy()
    out["target_date"] = out["date"] + pd.to_timedelta(7 * h, unit="D")
    woy = out["target_date"].dt.isocalendar().week.astype(float)
    out["target_woy_sin"] = np.sin(2 * np.pi * woy / 52.0)
    out["target_woy_cos"] = np.cos(2 * np.pi * woy / 52.0)
    out["target"] = out.groupby("ward_id", sort=False)["dengue_cases"].shift(-h)
    # guard: shifted target must really be h weeks later for the same ward
    later = out.groupby("ward_id", sort=False)["date"].shift(-h)
    bad = later.notna() & (later != out["target_date"])
    out.loc[bad, "target"] = np.nan
    return out


def feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    return df[FEATURES].astype(float)
