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


# ---- /api/records (View Data tab and ward drill-down) and all-ward forecasts (risk overview tiles)
SOURCE_COLUMNS = ["date", "city", "ward_id", "population_density_sqkm", "water_logging_risk_index",
                  "sanitation_score", "avg_temp_c", "max_temp_c", "min_temp_c", "rainfall_mm",
                  "relative_humidity_pct", "dengue_cases"]


def test_records_cover_full_dataset_with_original_columns(c):
    r = c.get("/api/records?page_size=10").json()
    assert r["total"] == 31320 and r["columns"] == SOURCE_COLUMNS
    assert len(r["rows"]) == 10 and list(r["rows"][0].keys()) == SOURCE_COLUMNS


def test_records_ward_filter_returns_only_that_ward_with_unchanged_values(c):
    src = pd.read_csv("data/dataset.csv")
    src = src[src["ward_id"] == "DNCC_Ward_05"].sort_values("date")
    r = c.get("/api/records?ward_id=DNCC_Ward_05&page_size=500").json()
    assert r["total"] == len(src) == 522 and r["pages"] == 2
    assert {row["ward_id"] for row in r["rows"]} == {"DNCC_Ward_05"}
    first, exp = r["rows"][0], src.iloc[0]
    for col in SOURCE_COLUMNS:
        assert first[col] == exp[col], col
    page2 = c.get("/api/records?ward_id=DNCC_Ward_05&page_size=500&page=2").json()
    dates = [row["date"] for row in r["rows"] + page2["rows"]]
    assert len(dates) == 522 and len(set(dates)) == 522 and dates == sorted(dates)


def test_records_same_ward_number_in_two_cities_never_mix(c):
    a = c.get("/api/records?ward_id=DNCC_Ward_05&page_size=10").json()["rows"]
    b = c.get("/api/records?ward_id=DSCC_Ward_05&page_size=10").json()["rows"]
    assert {x["city"] for x in a} == {"Dhaka North"} and {x["city"] for x in b} == {"Dhaka South"}


def test_records_sort_search_dates_and_csv(c):
    r = c.get("/api/records?city=Gazipur&sort=dengue_cases&order=desc&page_size=20").json()
    cases = [row["dengue_cases"] for row in r["rows"]]
    assert cases == sorted(cases, reverse=True) and r["total"] == 5 * 522
    s = c.get("/api/records?q=ncc_ward_0&page_size=10").json()
    assert all("ncc_ward_0" in row["ward_id"].lower() for row in s["rows"])
    d = c.get("/api/records?from=2025-01-01&to=2025-12-31&page_size=10").json()
    assert d["total"] == 3120
    csv = c.get("/api/records?ward_id=GCC_Ward_02&format=csv")
    assert csv.headers["content-type"].startswith("text/csv")
    lines = csv.text.strip().splitlines()
    assert lines[0].split(",") == SOURCE_COLUMNS and len(lines) == 523


@pytest.mark.parametrize("url, code", [
    ("/api/records?sort=nope", "invalid_parameter"),
    ("/api/records?ward_id=NOPE", "unknown_ward"),
    ("/api/records?city=Atlantis", "unknown_city"),
    ("/api/records?page_size=5", "invalid_parameter"),
])
def test_records_errors(c, url, code):
    assert c.get(url).json()["error"]["code"] == code


@pytest.mark.parametrize("h", [2, 3, 4])
def test_predict_all_cities_returns_every_ward_once(c, h):
    r = c.get(f"/api/predict-all?horizon_weeks={h}&as_of=2024-08-05").json()
    ids = [p["ward_id"] for p in r["predictions"]]
    assert len(ids) == 60 and len(set(ids)) == 60
    assert sum(r["tier_counts"].values()) == 60
    one = c.get(f"/api/predict?ward_id=CCC_Ward_03&horizon_weeks={h}&as_of=2024-08-05").json()
    match = next(p for p in r["predictions"] if p["ward_id"] == "CCC_Ward_03")
    assert match["risk_tier"] == one["risk_tier"] and match["predicted_cases"] == one["predicted_cases"]


def test_html_shell_is_revalidated_and_hashed_assets_are_cached(c):
    from backend.api.main import DIST
    if not DIST.exists():
        pytest.skip("frontend not built")
    for path in ("/", "/login", "/risk"):
        r = c.get(path)
        assert r.status_code == 200 and r.headers["cache-control"] == "no-cache", path
    asset = next((DIST / "assets").glob("*.js")).name
    r = c.get(f"/assets/{asset}")
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
