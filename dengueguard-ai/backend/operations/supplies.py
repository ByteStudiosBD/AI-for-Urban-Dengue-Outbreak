"""Phase 2 supply rules and planning baselines, derived from the onsite workbook.

What the onsite workbook gives us
---------------------------------
`bangladesh_dengue_large_dataset_onsite.xlsx` is the Phase 1 dataset (same 60
wards, same 522 weeks, identical `dengue_cases`) plus three columns:
`saline_bags_needed`, `diagnostic_kits_needed`, `hospital_beds_required`.

In every row each supply column is a fixed multiple of that week's cases,
rounded half-up:   supply = floor(rate * cases + 0.5)
The nominal rates are ~2.39 / ~1.17 / ~0.30, but those exact values do NOT
reproduce every row (e.g. 5 cases x 0.30 = 1.5 -> 2 beds, the data says 1).
So the rate is fitted here: we scan candidate rates and keep the midpoint of
the interval of rates that reproduces 100% of rows. The agreement share is
reported with the rate so the claim can be checked live.

What it does NOT give us (planning assumptions, all editable in the UI)
-----------------------------------------------------------------------
* hospital bed capacity  -> default = 90th percentile of the ward's historical
  weekly `hospital_beds_required`, rounded up to a whole bed
  ("Planning baseline capacity (editable assumption), derived from historical
  ward demand").
* stock on hand          -> scenario slider, % of projected total demand.
* spraying crews/effect  -> scenario inputs; see planner.py.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from backend.config import (CAPACITY_QUANTILE, NOMINAL_SUPPLY_RATES, ONSITE_CSV, ONSITE_XLSX,
                            SUPPLY_COLUMNS)

log = logging.getLogger("dengueguard.supplies")
KEYS = ["date", "ward_id", "city", "dengue_cases", *SUPPLY_COLUMNS]


def round_half_up(x):
    """The workbook's rounding: .5 always rounds up (not banker's rounding)."""
    return np.floor(np.asarray(x, dtype=float) + 0.5)


def supply_from_cases(cases, rate: float):
    """Dataset rule applied to whole cases: floor(rate * cases + 0.5)."""
    return round_half_up(rate * np.asarray(cases, dtype=float)).astype(int)


@dataclass(frozen=True)
class SupplyRate:
    column: str
    rate: float              # fitted value actually used
    nominal: float           # value quoted in the brief / UI
    exact_range: tuple[float, float] | None  # all rates reproducing 100% of rows
    agreement: float         # share of workbook rows reproduced by `rate`

    def as_dict(self) -> dict:
        return {"column": self.column, "rate": round(self.rate, 5), "nominal": self.nominal,
                "exact_range": [round(v, 5) for v in self.exact_range] if self.exact_range else None,
                "agreement": round(self.agreement, 6),
                "rule": f"{self.column} = floor({self.rate:.4f} x cases + 0.5)"}


def _load_onsite() -> pd.DataFrame | None:
    """Supply columns from the onsite workbook (cached as CSV, rebuilt by mtime)."""
    if not ONSITE_XLSX.exists():
        if ONSITE_CSV.exists():
            return pd.read_csv(ONSITE_CSV, parse_dates=["date"])
        log.warning("Onsite workbook %s not found; using nominal supply rates", ONSITE_XLSX.name)
        return None
    if ONSITE_CSV.exists() and ONSITE_CSV.stat().st_mtime >= ONSITE_XLSX.stat().st_mtime:
        return pd.read_csv(ONSITE_CSV, parse_dates=["date"])
    df = pd.read_excel(ONSITE_XLSX).rename(columns=lambda c: str(c).strip().lower())
    missing = [c for c in KEYS if c not in df.columns]
    if missing:
        raise ValueError(f"Onsite workbook is missing columns: {missing}")
    df = df[KEYS].copy()
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    try:
        out = df.copy()
        out["date"] = out["date"].dt.strftime("%Y-%m-%d")
        out.to_csv(ONSITE_CSV, index=False)
    except OSError as exc:  # read-only deployment: the CSV is only a cache
        log.warning("Could not write %s (%s)", ONSITE_CSV, exc)
    return df


def fit_rate(cases: np.ndarray, supply: np.ndarray, column: str) -> SupplyRate:
    nominal = NOMINAL_SUPPLY_RATES[column]
    pos = cases > 0
    guess = supply[pos].sum() / max(1, cases[pos].sum())
    grid = np.round(np.arange(guess * 0.8, guess * 1.2, 0.0001), 5)
    acc = np.array([(supply_from_cases(cases, r) == supply).mean() for r in grid])
    exact = grid[acc == 1.0]
    if len(exact):
        lo, hi = float(exact.min()), float(exact.max())
        rate = round((lo + hi) / 2, 5)
        return SupplyRate(column, rate, nominal, (lo, hi), float((supply_from_cases(cases, rate) == supply).mean()))
    best = float(grid[acc.argmax()])
    return SupplyRate(column, best, nominal, None, float(acc.max()))


@dataclass(frozen=True)
class SupplyModel:
    rates: dict[str, SupplyRate]
    capacity: dict[str, int]          # ward_id -> planning baseline beds
    capacity_raw_p90: dict[str, float]
    source: str
    rows: int

    def supplies(self, cases) -> dict[str, np.ndarray]:
        """Whole expected cases -> supplies via the dataset rule."""
        whole = round_half_up(np.clip(np.asarray(cases, dtype=float), 0, None))
        return {c: supply_from_cases(whole, r.rate) for c, r in self.rates.items()}

    def describe(self) -> dict:
        return {
            "source": self.source, "rows_checked": self.rows,
            "rates": {c: r.as_dict() for c, r in self.rates.items()},
            "rounding": ("Expected cases from the forecast are first rounded half-up to whole cases; "
                         "each supply is then floor(rate x cases + 0.5), the rule that reproduces the workbook."),
            "capacity": {
                "label": "Planning baseline capacity (editable assumption), derived from historical ward demand.",
                "method": f"{int(CAPACITY_QUANTILE * 100)}th percentile of the ward's weekly hospital_beds_required "
                          "over 2016-2025, rounded up to a whole bed.",
                "is_official_data": False,
                "per_ward": self.capacity,
            },
        }


@lru_cache(maxsize=1)
def get_supply_model() -> SupplyModel:
    df = _load_onsite()
    if df is None:
        rates = {c: SupplyRate(c, v, v, None, float("nan")) for c, v in NOMINAL_SUPPLY_RATES.items()}
        return SupplyModel(rates, {}, {}, "nominal (onsite workbook missing)", 0)
    cases = df["dengue_cases"].to_numpy()
    rates = {c: fit_rate(cases, df[c].to_numpy(), c) for c in SUPPLY_COLUMNS}
    p90 = df.groupby("ward_id")["hospital_beds_required"].quantile(CAPACITY_QUANTILE)
    # ceil after a tiny tolerance so 3.0000000001 (float noise) stays 3
    cap = {w: max(1, int(np.ceil(v - 1e-9))) for w, v in p90.items()}
    for r in rates.values():
        log.info("Supply rule %s rate=%.4f agreement=%.4f", r.column, r.rate, r.agreement)
    return SupplyModel(rates, cap, {w: round(float(v), 3) for w, v in p90.items()}, ONSITE_XLSX.name, len(df))
