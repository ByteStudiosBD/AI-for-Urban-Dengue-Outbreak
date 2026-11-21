"""Train, select, calibrate and evaluate one model per forecast horizon (2/3/4 weeks).

Run:  python -m backend.ml_training.train

Chronological split by TARGET date (the week whose cases are predicted):
  train       target <= 2022-12-31
  validation  2023-01-01 .. 2023-12-31  (model selection + conformal calibration)
  test        target >= 2024-01-01      (touched once, for reporting only)
"""
from __future__ import annotations

import json
import math
import platform
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from backend.config import (HORIZONS, INTERVAL_COVERAGE, METADATA_FILE, MODEL_FILE, MODELS_DIR,
                            RANDOM_STATE, TRAIN_END, VAL_END)
from backend.data_processing.loader import load_dataset
from backend.rainfall_lag_pipeline.features import (FEATURE_GROUPS, FEATURES, add_horizon,
                                                    add_lag_features, feature_matrix)

N_INTERVAL_BINS = 4
TIER_QUANTILES = {"medium": 0.70, "high": 0.85, "critical": 0.95}
CITY_IDX = FEATURES.index("city_code")


def candidates() -> dict:
    return {
        "hgb_poisson": HistGradientBoostingRegressor(
            loss="poisson", learning_rate=0.05, max_iter=300, max_leaf_nodes=31,
            min_samples_leaf=40, l2_regularization=1.0, categorical_features=[CITY_IDX],
            random_state=RANDOM_STATE),
        "hgb_squared_error": HistGradientBoostingRegressor(
            loss="squared_error", learning_rate=0.05, max_iter=300, max_leaf_nodes=31,
            min_samples_leaf=40, l2_regularization=1.0, categorical_features=[CITY_IDX],
            random_state=RANDOM_STATE),
        "poisson_glm": make_pipeline(StandardScaler(), PoissonRegressor(alpha=1e-3, max_iter=1000)),
    }


def metrics(y: np.ndarray, p: np.ndarray) -> dict:
    err = p - y
    return {
        "mae": round(float(np.mean(np.abs(err))), 4),
        "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
        "bias": round(float(np.mean(err)), 4),
        "n": int(len(y)),
    }


def split_masks(d: pd.DataFrame) -> dict[str, pd.Series]:
    usable = d["history_ok"] & d["target"].notna()
    t = d["target_date"]
    return {
        "train": usable & (t <= TRAIN_END),
        "validation": usable & (t > TRAIN_END) & (t <= VAL_END),
        "test": usable & (t > VAL_END),
    }


def conformal_quantile(abs_res: np.ndarray, coverage: float) -> float:
    n = len(abs_res)
    level = min(1.0, math.ceil((n + 1) * coverage) / n)
    return float(np.quantile(abs_res, level, method="higher"))


def fit_intervals(pred: np.ndarray, y: np.ndarray) -> dict:
    """Mondrian (prediction-binned) split-conformal calibration on validation data:
    residual spread grows with the predicted count, so each bin of predicted
    values gets its own absolute-residual quantile."""
    edges = np.unique(np.quantile(pred, np.linspace(0, 1, N_INTERVAL_BINS + 1)[1:-1]))
    bins = np.digitize(pred, edges)
    qhat = []
    for b in range(len(edges) + 1):
        r = np.abs(y[bins == b] - pred[bins == b])
        qhat.append(conformal_quantile(r, INTERVAL_COVERAGE) if len(r) >= 30 else
                    conformal_quantile(np.abs(y - pred), INTERVAL_COVERAGE))
    return {"edges": [float(e) for e in edges], "qhat": qhat}


def apply_intervals(pred: np.ndarray, cal: dict) -> tuple[np.ndarray, np.ndarray]:
    q = np.asarray(cal["qhat"])[np.digitize(pred, cal["edges"])]
    return np.maximum(0.0, pred - q), pred + q


def grouped_permutation_importance(model, X: pd.DataFrame, y: np.ndarray, repeats: int = 5) -> dict:
    """Increase in validation MAE when every column of a feature group is shuffled together."""
    rng = np.random.default_rng(RANDOM_STATE)
    base = np.mean(np.abs(model.predict(X.values) - y))
    out = {}
    for group, cols in FEATURE_GROUPS.items():
        incs = []
        for _ in range(repeats):
            Xp = X.copy()
            idx = rng.permutation(len(Xp))
            Xp[cols] = Xp[cols].values[idx]
            incs.append(np.mean(np.abs(model.predict(Xp.values) - y)) - base)
        out[group] = round(float(np.mean(incs)), 4)
    return out


def main() -> None:
    t0 = time.time()
    base = add_lag_features(load_dataset())
    artifacts: dict = {"features": FEATURES, "horizons": {}}
    meta: dict = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(), "sklearn": sklearn.__version__,
        "features": FEATURES, "feature_groups": FEATURE_GROUPS,
        "interval": {"method": "Mondrian split-conformal on validation residuals (binned by predicted value)",
                     "nominal_coverage": INTERVAL_COVERAGE, "bins": N_INTERVAL_BINS},
        "horizons": {},
    }

    # risk tiers from the TRAINING target distribution (h=2 rows; identical up to edge weeks)
    d2 = add_horizon(base, 2)
    train_targets = d2.loc[split_masks(d2)["train"], "target"]
    tiers = {k: float(train_targets.quantile(q)) for k, q in TIER_QUANTILES.items()}
    score_cap = float(train_targets.quantile(0.99))
    meta["risk_tiers"] = {
        "basis": "Quantiles of weekly ward dengue cases in the training period (target weeks 2016-2022)",
        "quantiles": TIER_QUANTILES, "thresholds_cases": tiers,
        "rule": "Low < medium; Medium [medium, high); High [high, critical); Critical >= critical (predicted cases)",
        "score_formula": f"risk_score = min(100, 100 * predicted_cases / {score_cap}) (P99 of training weekly cases)",
        "score_cap_cases": score_cap,
        "disclaimer": "Prototype operational tiers for prioritisation, not official clinical or epidemiological thresholds.",
    }

    for h in HORIZONS:
        d = add_horizon(base, h)
        m = split_masks(d)
        X = {k: feature_matrix(d[v]) for k, v in m.items()}
        y = {k: d.loc[v, "target"].to_numpy(float) for k, v in m.items()}

        cand_scores, fitted = {}, {}
        for name, model in candidates().items():
            model.fit(X["train"].values, y["train"])
            p = np.clip(model.predict(X["validation"].values), 0, None)
            cand_scores[name] = metrics(y["validation"], p)
            fitted[name] = model
        baseline_val = metrics(y["validation"], X["validation"]["cases_mean_4w"].to_numpy())
        best = min(cand_scores, key=lambda n: cand_scores[n]["mae"])
        model = fitted[best]

        p_val = np.clip(model.predict(X["validation"].values), 0, None)
        cal = fit_intervals(p_val, y["validation"])
        p_test = np.clip(model.predict(X["test"].values), 0, None)
        lo, hi = apply_intervals(p_test, cal)
        test_metrics = metrics(y["test"], p_test)
        test_metrics["interval_coverage"] = round(float(np.mean((y["test"] >= lo) & (y["test"] <= hi))), 4)
        test_metrics["mean_interval_width"] = round(float(np.mean(hi - lo)), 3)
        abs_err = np.abs(p_test - y["test"])

        artifacts["horizons"][h] = {"model": model, "model_name": best, "intervals": cal}
        meta["horizons"][str(h)] = {
            "model": best,
            "split": {k: {"target_from": d.loc[v, "target_date"].min().date().isoformat(),
                          "target_to": d.loc[v, "target_date"].max().date().isoformat(),
                          "rows": int(v.sum())} for k, v in m.items()},
            "validation_candidates": cand_scores,
            "validation_baseline_4w_mean": baseline_val,
            "test": test_metrics,
            "test_baseline_4w_mean": metrics(y["test"], X["test"]["cases_mean_4w"].to_numpy()),
            "test_abs_error_quantiles": {str(q): round(float(np.quantile(abs_err, q)), 3)
                                         for q in (0.5, 0.75, 0.9, 0.95)},
            "intervals": cal,
            "group_importance_val_mae_increase": grouped_permutation_importance(model, X["validation"], y["validation"]),
        }
        print(f"h={h}: best={best} val={cand_scores[best]} test={test_metrics}")

    d2_train = d2[split_masks(d2)["train"]]
    artifacts["train_medians"] = feature_matrix(d2_train).median().to_dict()
    meta["training_seconds"] = round(time.time() - t0, 1)
    MODELS_DIR.mkdir(exist_ok=True)
    joblib.dump(artifacts, MODEL_FILE, compress=3)
    METADATA_FILE.write_text(json.dumps(meta, indent=2))
    print(f"Saved {MODEL_FILE.name} ({MODEL_FILE.stat().st_size/1e6:.2f} MB) and {METADATA_FILE.name} "
          f"in {meta['training_seconds']}s")


if __name__ == "__main__":
    main()
