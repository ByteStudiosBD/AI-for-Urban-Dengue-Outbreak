import numpy as np
import pandas as pd
import pytest

from backend.config import TRAIN_END, VAL_END
from backend.data_processing.loader import DataValidationError, clean, coverage_report, load_dataset
from backend.ml_training.train import apply_intervals, conformal_quantile, split_masks
from backend.rainfall_lag_pipeline.features import FEATURES, add_horizon, add_lag_features


@pytest.fixture(scope="module")
def raw():
    return load_dataset()


@pytest.fixture(scope="module")
def feats(raw):
    return add_lag_features(raw)


def test_schema_and_coverage(raw):
    rep = coverage_report(raw)
    assert rep["rows"] == 31320 and rep["ward_count"] == 60
    assert rep["all_steps_7_days"] and rep["missing_values"] == 0
    assert set(rep["cities"]) == {"Chattogram", "Dhaka North", "Dhaka South", "Gazipur", "Narayanganj"}


def test_excel_serial_dates_parse():
    df = pd.DataFrame({c: [1] for c in ["population_density_sqkm", "water_logging_risk_index",
                                        "sanitation_score", "avg_temp_c", "max_temp_c", "min_temp_c",
                                        "rainfall_mm", "relative_humidity_pct", "dengue_cases"]})
    df["date"], df["city"], df["ward_id"] = [42373], ["Dhaka North"], ["W1"]  # 2016-01-04
    assert clean(df)["date"].iloc[0] == pd.Timestamp("2016-01-04")


def test_duplicates_rejected(raw):
    with pytest.raises(DataValidationError):
        clean(pd.concat([raw.head(3), raw.head(1)]))


def test_rain_lags_match_manual_per_ward(feats, raw):
    for ward in ["CCC_Ward_01", "DNCC_Ward_07", "NCC_Ward_05" if "NCC_Ward_05" in set(raw.ward_id) else raw.ward_id.iloc[-1]]:
        w = raw[raw.ward_id == ward].sort_values("date").reset_index(drop=True)
        f = feats[feats.ward_id == ward].reset_index(drop=True)
        for k in (1, 2, 3, 4):
            pd.testing.assert_series_equal(f[f"rain_lag{k}"], w["rainfall_mm"].shift(k), check_names=False)
        assert np.allclose(f["rain_sum_4w"].iloc[10], w["rainfall_mm"].iloc[7:11].sum())


def test_no_cross_ward_contamination(feats):
    first_rows = feats.groupby("ward_id").head(4)
    # first week of each ward has no lag-1 value: it must not borrow from the previous ward
    firsts = feats.groupby("ward_id").head(1)
    assert firsts["rain_lag1"].isna().all() and firsts["cases_lag1"].isna().all()
    assert first_rows["rain_lag4"].isna().all()
    assert not feats.loc[feats.history_ok, FEATURES[:-2]].isna().any().any()


def test_features_do_not_change_when_future_is_altered(raw):
    """Changing every week after the as-of date must not change as-of features."""
    asof = pd.Timestamp("2021-07-05")
    altered = raw.copy()
    future = altered["date"] > asof
    altered.loc[future, ["rainfall_mm", "dengue_cases", "avg_temp_c", "relative_humidity_pct"]] *= 7
    a = add_horizon(add_lag_features(raw), 3)
    b = add_horizon(add_lag_features(altered), 3)
    cols = FEATURES
    pd.testing.assert_frame_equal(a.loc[a.date == asof, cols].reset_index(drop=True),
                                  b.loc[b.date == asof, cols].reset_index(drop=True))


@pytest.mark.parametrize("h", [2, 3, 4])
def test_target_is_h_weeks_ahead_same_ward(feats, h):
    d = add_horizon(feats, h)
    row = d[(d.ward_id == "CCC_Ward_03")].iloc[50]
    actual = feats[(feats.ward_id == "CCC_Ward_03") & (feats.date == row.date + pd.Timedelta(weeks=h))]
    assert row.target == actual.dengue_cases.iloc[0]
    assert d.groupby("ward_id").tail(h)["target"].isna().all()


@pytest.mark.parametrize("h", [2, 3, 4])
def test_chronological_split_is_disjoint(feats, h):
    d = add_horizon(feats, h)
    m = split_masks(d)
    assert d.loc[m["train"], "target_date"].max() <= pd.Timestamp(TRAIN_END)
    assert d.loc[m["validation"], "target_date"].min() > pd.Timestamp(TRAIN_END)
    assert d.loc[m["validation"], "target_date"].max() <= pd.Timestamp(VAL_END)
    assert d.loc[m["test"], "target_date"].min() > pd.Timestamp(VAL_END)
    assert not (m["train"] & m["test"]).any()


def test_conformal_interval_properties():
    rng = np.random.default_rng(0)
    res = np.abs(rng.normal(size=500))
    q = conformal_quantile(res, 0.9)
    assert (res <= q).mean() >= 0.9
    pred = np.array([0.1, 2.0, 15.0])
    lo, hi = apply_intervals(pred, {"edges": [1.0, 5.0], "qhat": [1.0, 2.0, 6.0]})
    assert (lo >= 0).all() and (lo <= pred).all() and (pred <= hi).all()
