import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


def test_health_and_metadata(c):
    assert c.get("/api/health").json()["model_loaded"] is True
    m = c.get("/api/metadata").json()
    assert len(m["wards"]) == 60 and m["llm_calls_per_request"] == 0
    assert m["as_of_range"]["max"] == "2025-12-29"


@pytest.mark.parametrize("h", [2, 3, 4])
def test_predict_shape_and_interval(c, h):
    r = c.get(f"/api/predict?ward_id=DSCC_Ward_03&horizon_weeks={h}&as_of=2023-08-07").json()
    assert r["target_date"] == (pd.Timestamp("2023-08-07") + pd.Timedelta(weeks=h)).date().isoformat()
    iv = r["interval"]
    assert 0 <= iv["lower"] <= r["predicted_cases"] <= iv["upper"]
    assert r["risk_tier"] in {"Low", "Medium", "High", "Critical"}
    assert r["evaluation_status"] == "validation"
    assert r["drivers"] and all("contribution_cases" in d for d in r["drivers"])


def test_prediction_is_model_output_not_constant(c):
    a = c.get("/api/predict?ward_id=DNCC_Ward_01&horizon_weeks=2&as_of=2023-09-04").json()["predicted_cases"]
    b = c.get("/api/predict?ward_id=DNCC_Ward_01&horizon_weeks=2&as_of=2023-02-06").json()["predicted_cases"]
    assert a != b


def test_as_of_snaps_to_week(c):
    r = c.get("/api/predict?ward_id=CCC_Ward_01&horizon_weeks=2&as_of=2023-08-09").json()
    assert r["as_of"] == "2023-08-07"


def test_forecast_beyond_data(c):
    r = c.get("/api/predict?ward_id=CCC_Ward_01&horizon_weeks=4&as_of=2025-12-29").json()
    assert r["evaluation_status"] == "forecast_beyond_data" and r["actual_cases"] is None


def test_predict_all_counts_consistent(c):
    r = c.get("/api/predict-all?city=Dhaka%20North&horizon_weeks=3&as_of=2023-08-07").json()
    assert len(r["predictions"]) == 20
    assert sum(r["tier_counts"].values()) == 20
    assert r["alerts"] == r["tier_counts"]["High"] + r["tier_counts"]["Critical"]
    vals = [p["predicted_cases"] for p in r["predictions"]]
    assert vals == sorted(vals, reverse=True)


def test_weather_lags_correct(c):
    r = c.get("/api/weather-lags?ward_id=CCC_Ward_02&as_of=2024-07-01").json()
    obs = c.get("/api/observations?ward_id=CCC_Ward_02&from=2024-06-01&to=2024-07-01").json()["observations"]
    by_date = {o["date"]: o["rainfall_mm"] for o in obs}
    for lag in r["lags"]:
        assert lag["rainfall_mm"] == pytest.approx(by_date[lag["week"]], abs=0.01)


def test_validation_metrics(c):
    v = c.get("/api/validation").json()["metrics"]
    assert [m["horizon_weeks"] for m in v] == [2, 3, 4]
    for m in v:
        assert m["test"]["mae"] > 0 and m["test"]["n"] > 0 and m["test"]["rmse"] >= m["test"]["mae"]
    s = c.get("/api/validation-series?horizon_weeks=2&ward_id=CCC_Ward_01").json()
    assert {p["split"] for p in s["series"]} == {"validation", "held_out_test"}


def test_heatmap(c):
    r = c.get("/api/heatmap?city=Gazipur&as_of=2024-08-05").json()
    assert len(r["cells"]) == 5 * 3 and len(r["timeline_weeks"]) == 8


@pytest.mark.parametrize("url,code", [
    ("/api/predict?ward_id=NOPE&horizon_weeks=2", "unknown_ward"),
    ("/api/predict?ward_id=CCC_Ward_01&horizon_weeks=5", "invalid_parameter"),
    ("/api/predict?ward_id=CCC_Ward_01&as_of=2030-01-01", "date_out_of_range"),
    ("/api/predict?ward_id=CCC_Ward_01&as_of=notadate", "invalid_date"),
    ("/api/predict-all?city=Atlantis", "unknown_city"),
])
def test_structured_errors(c, url, code):
    r = c.get(url)
    assert r.status_code >= 400 and r.json()["error"]["code"] == code


def test_auth_is_honest(c):
    assert c.post("/api/auth/demo").json()["mode"] == "demo"
    r = c.post("/api/auth/login", json={"email": "a@b.co", "password": "whatever123"})
    assert r.status_code in (401, 503)
