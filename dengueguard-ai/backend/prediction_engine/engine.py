"""Inference engine.

Efficiency strategy: the serialized models are loaded ONCE per process and every
(ward, as-of week, horizon) row in the dataset is scored in a single vectorised
batch per horizon at startup (~31k rows x 3 horizons, well under a second).
Requests are then table look-ups. Local driver explanations are computed on
demand (7 extra model calls) and memoised. Nothing is retrained at request time.
Cache invalidation: the process cache is rebuilt when the model file's mtime
changes (i.e. after re-running training) or on restart.
"""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from backend.config import HORIZONS, METADATA_FILE, MODEL_FILE, TRAIN_END, VAL_END
from backend.data_processing.loader import load_dataset
from backend.ml_training.train import apply_intervals
from backend.rainfall_lag_pipeline.features import (FEATURE_GROUPS, FEATURES, add_horizon,
                                                    add_lag_features, feature_matrix)

log = logging.getLogger("dengueguard.engine")
TIERS = ("Low", "Medium", "High", "Critical")


class ModelUnavailable(RuntimeError):
    pass


def _load_artifacts():
    if not MODEL_FILE.exists() or not METADATA_FILE.exists():
        raise ModelUnavailable("Model artifacts not found. Run: python -m backend.ml_training.train")
    try:
        art = joblib.load(MODEL_FILE)
        if art.get("features") != FEATURES:
            raise ModelUnavailable("Model feature order does not match the current pipeline; retrain.")
        return art, json.loads(METADATA_FILE.read_text())
    except ModelUnavailable:
        raise
    except Exception as exc:  # e.g. incompatible scikit-learn pickle
        raise ModelUnavailable(f"Could not load model artifacts ({exc}); retrain.") from exc


def tier_for(pred: np.ndarray, th: dict) -> np.ndarray:
    idx = np.digitize(pred, [th["medium"], th["high"], th["critical"]])
    return np.asarray(TIERS, dtype=object)[idx]


def eval_status(target_date: pd.Series, last_date: pd.Timestamp) -> np.ndarray:
    return np.select(
        [target_date > last_date, target_date <= pd.Timestamp(TRAIN_END), target_date <= pd.Timestamp(VAL_END)],
        ["forecast_beyond_data", "in_sample_train", "validation"], default="held_out_test")


@dataclass
class Engine:
    artifacts: dict
    metadata: dict
    raw: pd.DataFrame
    frames: dict          # h -> feature frame (all rows, with target/date columns)
    table: dict           # h -> scored prediction table (history_ok rows only)
    mtime: float

    @property
    def thresholds(self) -> dict:
        return self.metadata["risk_tiers"]["thresholds_cases"]

    def _score(self, h: int, X: np.ndarray) -> np.ndarray:
        return np.clip(self.artifacts["horizons"][h]["model"].predict(X), 0, None)

    @classmethod
    def build(cls) -> "Engine":
        art, meta = _load_artifacts()
        raw = load_dataset()
        base = add_lag_features(raw)
        last = raw["date"].max()
        cap = meta["risk_tiers"]["score_cap_cases"]
        frames, table = {}, {}
        self = cls(art, meta, raw, frames, table, MODEL_FILE.stat().st_mtime)
        for h in HORIZONS:
            d = add_horizon(base, h)
            d = d[d["history_ok"]].reset_index(drop=True)
            pred = self._score(h, feature_matrix(d).values)
            lo, hi = apply_intervals(pred, art["horizons"][h]["intervals"])
            frames[h] = d
            table[h] = pd.DataFrame({
                "ward_id": d["ward_id"], "city": d["city"], "as_of": d["date"],
                "target_date": d["target_date"], "predicted_cases": pred, "lower": lo, "upper": hi,
                "risk_tier": tier_for(pred, self.thresholds),
                "risk_score": np.minimum(100.0, 100.0 * pred / cap),
                "actual_cases": d["target"], "evaluation_status": eval_status(d["target_date"], last),
            })
        log.info("Engine ready: %d scored rows", sum(len(t) for t in table.values()))
        return self

    # ---- queries -------------------------------------------------------
    def row_index(self, h: int, ward_id: str, as_of: pd.Timestamp) -> int:
        t = self.table[h]
        idx = t.index[(t["ward_id"] == ward_id) & (t["as_of"] == as_of)]
        if len(idx) == 0:
            raise KeyError("no prediction for that ward/as-of week")
        return int(idx[0])

    def drivers(self, h: int, i: int) -> list[dict]:
        return _drivers_cached(id(self), h, i)


_ENGINE: Engine | None = None
_LOCK = threading.Lock()


def get_engine() -> Engine:
    """Process-wide singleton; rebuilt if the model file was retrained."""
    global _ENGINE
    with _LOCK:
        stale = _ENGINE is not None and MODEL_FILE.exists() and MODEL_FILE.stat().st_mtime != _ENGINE.mtime
        if _ENGINE is None or stale:
            _drivers_cached.cache_clear()
            _ENGINE = Engine.build()
        return _ENGINE


@lru_cache(maxsize=4096)
def _drivers_cached(engine_id: int, h: int, i: int) -> list[dict]:
    """Local what-if sensitivity: prediction with the row's real values minus the
    prediction when one feature group is replaced by its training-period median.
    Positive = this group pushes the forecast above a typical-conditions baseline.
    This is a model explanation, not proof of causation."""
    eng = get_engine()
    row = feature_matrix(eng.frames[h].iloc[[i]])
    base_pred = float(eng._score(h, row.values)[0])
    med = eng.artifacts["train_medians"]
    out = []
    for group, cols in FEATURE_GROUPS.items():
        if group == "seasonality":
            continue  # calendar position is not an actionable driver; shown separately
        cols = [c for c in cols if c != "city_code"]  # a ward's city is identity, not a condition
        alt = row.copy()
        for c in cols:
            alt[c] = med[c]
        out.append({"group": group, "contribution_cases": round(base_pred - float(eng._score(h, alt.values)[0]), 3),
                    "features": {c: round(float(row[c].iloc[0]), 3) for c in cols},
                    "typical": {c: round(float(med[c]), 3) for c in cols}})
    return sorted(out, key=lambda d: -abs(d["contribution_cases"]))
