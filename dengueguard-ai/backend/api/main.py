"""DengueGuard AI REST API.  Run:  uvicorn backend.api.main:app --port 8000"""
from __future__ import annotations

import logging
import math
from contextlib import asynccontextmanager

import numpy as np
import pandas as pd
from fastapi import FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.api import auth
from backend.config import ROOT
from backend.data_processing.loader import coverage_report
from backend.prediction_engine.engine import TIERS, ModelUnavailable, get_engine

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("dengueguard.api")
HORIZON = Query(2, ge=2, le=4, description="Forecast horizon in weeks (2, 3 or 4)")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        get_engine()  # load model + score all rows once
    except ModelUnavailable as exc:
        log.error("Model unavailable at startup: %s", exc)
    yield


app = FastAPI(title="DengueGuard AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["GET", "POST"], allow_headers=["*"])


@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    msg = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=422, content={"error": {"code": "invalid_parameter", "message": msg}})


@app.exception_handler(ModelUnavailable)
async def _model_error(_: Request, exc: ModelUnavailable):
    return JSONResponse(status_code=503, content={"error": {"code": "model_unavailable", "message": str(exc)}})


@app.middleware("http")
async def _cache_headers(request: Request, call_next):
    resp = await call_next(request)
    # data is a static historical dataset: allow short browser caching of GET API calls
    if request.method == "GET" and request.url.path.startswith("/api/") and resp.status_code == 200:
        resp.headers["Cache-Control"] = "private, max-age=300"
    return resp


# ---------------------------------------------------------------- helpers
def _f(x, nd=3):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), nd)


def _date(s: str | None, field: str) -> pd.Timestamp | None:
    if s is None:
        return None
    try:
        return pd.Timestamp(s).normalize()
    except (ValueError, TypeError):
        raise ApiError(422, "invalid_date", f"{field} must be an ISO date (YYYY-MM-DD)")


def _ward(eng, ward_id: str) -> pd.DataFrame:
    w = eng.raw[eng.raw["ward_id"] == ward_id]
    if w.empty:
        raise ApiError(404, "unknown_ward", f"Unknown ward_id '{ward_id}'")
    return w


def _asof(eng, h: int, as_of: str | None) -> pd.Timestamp:
    t = eng.table[h]
    if as_of is None:
        return t["as_of"].max()
    d = _date(as_of, "as_of")
    if d < t["as_of"].min() or d > t["as_of"].max():
        raise ApiError(422, "date_out_of_range",
                       f"as_of must be between {t['as_of'].min().date()} and {t['as_of'].max().date()}")
    # snap to the dataset's weekly grid (Mondays): latest week <= requested date
    weeks = t["as_of"].drop_duplicates()
    return weeks[weeks <= d].max()


def _pred_row(r: pd.Series, h: int, eng) -> dict:
    return {
        "ward_id": r["ward_id"], "city": r["city"], "horizon_weeks": h,
        "as_of": r["as_of"].date().isoformat(), "target_date": r["target_date"].date().isoformat(),
        "predicted_cases": _f(r["predicted_cases"], 2),
        "interval": {"lower": _f(r["lower"], 2), "upper": _f(r["upper"], 2),
                     "nominal_coverage": eng.metadata["interval"]["nominal_coverage"],
                     "kind": "prediction_interval"},
        "risk_tier": r["risk_tier"], "risk_score": _f(r["risk_score"], 1),
        "actual_cases": _f(r["actual_cases"], 0), "evaluation_status": r["evaluation_status"],
    }


def _city_or_404(eng, city: str | None):
    if city is not None and city not in set(eng.raw["city"]):
        raise ApiError(404, "unknown_city", f"Unknown city '{city}'")


# ---------------------------------------------------------------- endpoints
@app.get("/api/health")
def health():
    try:
        eng = get_engine()
        return {"status": "ok", "model_loaded": True, "trained_at_utc": eng.metadata["trained_at_utc"]}
    except ModelUnavailable as exc:
        return JSONResponse(status_code=503, content={"status": "degraded", "model_loaded": False, "detail": str(exc)})


@app.get("/api/metadata")
def metadata():
    eng = get_engine()
    raw, t = eng.raw, eng.table[2]
    wards = (raw.drop_duplicates("ward_id")[["ward_id", "city", "population_density_sqkm",
                                             "water_logging_risk_index", "sanitation_score"]]
             .sort_values(["city", "ward_id"]).to_dict("records"))
    return {
        "coverage": coverage_report(raw),
        "cities": sorted(raw["city"].unique().tolist()),
        "wards": wards,
        "as_of_range": {"min": t["as_of"].min().date().isoformat(), "max": t["as_of"].max().date().isoformat()},
        "available_weeks": [d.date().isoformat() for d in sorted(t["as_of"].unique())],
        "horizons": [2, 3, 4],
        "risk_tiers": eng.metadata["risk_tiers"],
        "interval": eng.metadata["interval"],
        "models": {h: v["model"] for h, v in eng.metadata["horizons"].items()},
        "trained_at_utc": eng.metadata["trained_at_utc"],
        "llm_calls_per_request": 0,
    }


@app.get("/api/observations")
def observations(city: str | None = None, ward_id: str | None = None,
                 from_: str | None = Query(None, alias="from"), to: str | None = None):
    eng = get_engine()
    _city_or_404(eng, city)
    df = eng.raw
    if ward_id:
        df = _ward(eng, ward_id)
    if city:
        df = df[df["city"] == city]
    lo, hi = _date(from_, "from"), _date(to, "to")
    if lo is not None:
        df = df[df["date"] >= lo]
    if hi is not None:
        df = df[df["date"] <= hi]
    if not ward_id:  # aggregate across wards (weekly city/total series)
        agg = df.groupby("date").agg(dengue_cases=("dengue_cases", "sum"), rainfall_mm=("rainfall_mm", "mean"),
                                     avg_temp_c=("avg_temp_c", "mean"),
                                     relative_humidity_pct=("relative_humidity_pct", "mean"),
                                     wards=("ward_id", "nunique")).reset_index()
        return {"level": "city" if city else "all", "city": city, "aggregation":
                "dengue_cases summed over wards; weather averaged over wards",
                "observations": [{"date": r.date.date().isoformat(), "dengue_cases": int(r.dengue_cases),
                                  "rainfall_mm": _f(r.rainfall_mm, 2), "avg_temp_c": _f(r.avg_temp_c, 2),
                                  "relative_humidity_pct": _f(r.relative_humidity_pct, 2), "wards": int(r.wards)}
                                 for r in agg.itertuples()]}
    return {"level": "ward", "ward_id": ward_id, "observations": [
        {"date": r.date.date().isoformat(), "city": r.city, "ward_id": r.ward_id, "dengue_cases": int(r.dengue_cases),
         "rainfall_mm": r.rainfall_mm, "avg_temp_c": r.avg_temp_c, "max_temp_c": r.max_temp_c,
         "min_temp_c": r.min_temp_c, "relative_humidity_pct": r.relative_humidity_pct}
        for r in df.itertuples()]}


@app.get("/api/weather-lags")
def weather_lags(ward_id: str, as_of: str | None = None, weeks: int = Query(12, ge=4, le=52)):
    eng = get_engine()
    _ward(eng, ward_id)
    d = _asof(eng, 2, as_of)
    f = eng.frames[2]
    row = f[(f["ward_id"] == ward_id) & (f["date"] == d)].iloc[0]
    hist = f[(f["ward_id"] == ward_id) & (f["date"] <= d)].tail(weeks)
    return {
        "ward_id": ward_id, "city": row["city"], "as_of": d.date().isoformat(),
        "lags": [{"lag_weeks": k, "week": (d - pd.Timedelta(weeks=k)).date().isoformat(),
                  "rainfall_mm": _f(row[f"rain_lag{k}"], 2)} for k in (1, 2, 3, 4)],
        "current": {"rainfall_mm": _f(row["rainfall_mm"], 2), "avg_temp_c": _f(row["avg_temp_c"], 2),
                    "max_temp_c": _f(row["max_temp_c"], 2), "min_temp_c": _f(row["min_temp_c"], 2),
                    "relative_humidity_pct": _f(row["relative_humidity_pct"], 2)},
        "rolling": {"rain_sum_2w": _f(row["rain_sum_2w"], 2), "rain_sum_3w": _f(row["rain_sum_3w"], 2),
                    "rain_sum_4w": _f(row["rain_sum_4w"], 2), "rain_sum_lag1_4": _f(row["rain_sum_lag1_4"], 2),
                    "temp_mean_4w": _f(row["temp_mean_4w"], 2), "humidity_mean_4w": _f(row["humidity_mean_4w"], 2)},
        "series": [{"date": r.date.date().isoformat(), "rainfall_mm": _f(r.rainfall_mm, 2),
                    "rain_lag1": _f(r.rain_lag1, 2), "rain_lag2": _f(r.rain_lag2, 2),
                    "rain_lag3": _f(r.rain_lag3, 2), "rain_lag4": _f(r.rain_lag4, 2),
                    "rain_sum_4w": _f(r.rain_sum_4w, 2), "avg_temp_c": _f(r.avg_temp_c, 2),
                    "relative_humidity_pct": _f(r.relative_humidity_pct, 2), "dengue_cases": int(r.dengue_cases)}
                   for r in hist.itertuples()],
    }


@app.get("/api/predict")
def predict(ward_id: str, horizon_weeks: int = HORIZON, as_of: str | None = None):
    eng = get_engine()
    _ward(eng, ward_id)
    h = int(horizon_weeks)
    d = _asof(eng, h, as_of)
    i = eng.row_index(h, ward_id, d)
    out = _pred_row(eng.table[h].iloc[i], h, eng)
    out["drivers"] = eng.drivers(h, i)
    out["model"] = eng.metadata["horizons"][str(h)]["model"]
    out["test_metrics"] = eng.metadata["horizons"][str(h)]["test"]
    return out


@app.get("/api/predict-horizons")
def predict_horizons(ward_id: str, as_of: str | None = None):
    """All three horizons for one ward/as-of week in one call (fewer round-trips)."""
    eng = get_engine()
    _ward(eng, ward_id)
    d = _asof(eng, 2, as_of)
    res = []
    for h in (2, 3, 4):
        i = eng.row_index(h, ward_id, d)
        r = _pred_row(eng.table[h].iloc[i], h, eng)
        r["drivers"] = eng.drivers(h, i)
        r["model"] = eng.metadata["horizons"][str(h)]["model"]
        r["test_metrics"] = eng.metadata["horizons"][str(h)]["test"]
        res.append(r)
    return {"ward_id": ward_id, "as_of": d.date().isoformat(), "predictions": res}


@app.get("/api/predict-all")
def predict_all(city: str | None = None, horizon_weeks: int = HORIZON, as_of: str | None = None):
    eng = get_engine()
    _city_or_404(eng, city)
    h = int(horizon_weeks)
    d = _asof(eng, h, as_of)
    t = eng.table[h]
    sel = t[(t["as_of"] == d) & ((t["city"] == city) if city else True)]
    sel = sel.sort_values("predicted_cases", ascending=False)
    preds = [_pred_row(r, h, eng) for _, r in sel.iterrows()]
    counts = {tier: int((sel["risk_tier"] == tier).sum()) for tier in TIERS}
    return {"city": city, "as_of": d.date().isoformat(), "horizon_weeks": h,
            "target_date": (d + pd.Timedelta(weeks=h)).date().isoformat(),
            "tier_counts": counts, "alerts": counts["High"] + counts["Critical"],
            "total_predicted_cases": _f(sel["predicted_cases"].sum(), 1), "predictions": preds}


@app.get("/api/heatmap")
def heatmap(city: str | None = None, as_of: str | None = None, weeks: int = Query(8, ge=1, le=26)):
    """Ward x horizon matrix for one as-of week, plus ward x recent-as-of-week matrix for a chosen horizon."""
    eng = get_engine()
    _city_or_404(eng, city)
    d = _asof(eng, 2, as_of)
    cells = []
    for h in (2, 3, 4):
        t = eng.table[h]
        sel = t[(t["as_of"] == d) & ((t["city"] == city) if city else True)]
        cells += [_pred_row(r, h, eng) for _, r in sel.iterrows()]
    t2 = eng.table[2]
    all_weeks = sorted(t2["as_of"].unique())
    recent = [w for w in all_weeks if w <= d][-weeks:]
    timeline = {}
    for h in (2, 3, 4):
        t = eng.table[h]
        sel = t[t["as_of"].isin(recent) & ((t["city"] == city) if city else True)]
        timeline[h] = [{"ward_id": r.ward_id, "as_of": r.as_of.date().isoformat(),
                        "target_date": r.target_date.date().isoformat(),
                        "predicted_cases": _f(r.predicted_cases, 2), "risk_tier": r.risk_tier}
                       for r in sel.itertuples()]
    return {"city": city, "as_of": d.date().isoformat(), "cells": cells,
            "timeline_weeks": [pd.Timestamp(w).date().isoformat() for w in recent], "timeline": timeline}


@app.get("/api/validation")
def validation(horizon_weeks: int | None = Query(None, ge=2, le=4), model: str | None = None):
    eng = get_engine()
    hs = [int(horizon_weeks)] if horizon_weeks else [2, 3, 4]
    out = []
    for h in hs:
        m = eng.metadata["horizons"][str(h)]
        if model and model != m["model"]:
            raise ApiError(404, "unknown_model", f"Horizon {h} uses model '{m['model']}', not '{model}'")
        t = eng.table[h]
        test = t[t["evaluation_status"] == "held_out_test"]
        by_city = [{"city": c, "mae": _f(np.mean(np.abs(g.predicted_cases - g.actual_cases)), 3),
                    "rmse": _f(np.sqrt(np.mean((g.predicted_cases - g.actual_cases) ** 2)), 3), "n": int(len(g))}
                   for c, g in test.groupby("city")]
        out.append({"horizon_weeks": h, **m, "test_by_city": by_city})
    return {"metrics": out, "interval": eng.metadata["interval"], "risk_tiers": eng.metadata["risk_tiers"]}


@app.get("/api/validation-series")
def validation_series(horizon_weeks: int = HORIZON, ward_id: str | None = None, city: str | None = None,
                      from_: str | None = Query(None, alias="from"), to: str | None = None):
    eng = get_engine()
    _city_or_404(eng, city)
    h = int(horizon_weeks)
    t = eng.table[h]
    sel = t[t["evaluation_status"].isin(["validation", "held_out_test"])]
    if ward_id:
        _ward(eng, ward_id)
        sel = sel[sel["ward_id"] == ward_id]
    elif city:
        sel = sel[sel["city"] == city]
    lo, hi = _date(from_, "from"), _date(to, "to")
    if lo is not None:
        sel = sel[sel["target_date"] >= lo]
    if hi is not None:
        sel = sel[sel["target_date"] <= hi]
    g = sel.groupby(["target_date", "evaluation_status"]).agg(
        actual=("actual_cases", "sum"), predicted=("predicted_cases", "sum"),
        lower=("lower", "sum"), upper=("upper", "sum"), wards=("ward_id", "nunique")).reset_index()
    err = sel["predicted_cases"] - sel["actual_cases"]
    return {
        "horizon_weeks": h, "ward_id": ward_id, "city": city,
        "aggregation": "ward-level values summed per target week" if not ward_id else "single ward",
        "interval_note": "Summed per-ward interval bounds are a conservative envelope, not a calibrated interval for the total."
        if not ward_id else "Calibrated per-ward 90% prediction interval.",
        "metrics": {"mae": _f(np.mean(np.abs(err))), "rmse": _f(np.sqrt(np.mean(err ** 2))), "n": int(len(sel)),
                    "interval_coverage": _f(np.mean((sel.actual_cases >= sel.lower) & (sel.actual_cases <= sel.upper)))}
        if len(sel) else None,
        "series": [{"target_date": r.target_date.date().isoformat(), "split": r.evaluation_status,
                    "actual": _f(r.actual, 2), "predicted": _f(r.predicted, 2), "lower": _f(r.lower, 2),
                    "upper": _f(r.upper, 2), "wards": int(r.wards)} for r in g.itertuples()],
    }


# ---------------------------------------------------------------- auth
class LoginBody(BaseModel):
    email: str
    password: str


@app.get("/api/auth/config")
def auth_config():
    return {"accounts_configured": auth.accounts_configured(), "demo_mode": True}


@app.post("/api/auth/demo")
def auth_demo():
    return auth.demo_session()


@app.post("/api/auth/login")
def auth_login(body: LoginBody):
    if not auth.accounts_configured():
        raise ApiError(503, "no_accounts", "No officer accounts are configured on this server. Use demo mode.")
    if "@" not in body.email or len(body.password) < 8:
        raise ApiError(422, "invalid_input", "Enter a valid email and a password of at least 8 characters.")
    res = auth.verify(body.email, body.password)
    if not res:
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    return res


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(None)):
    s = auth.session((authorization or "").removeprefix("Bearer ").strip())
    if not s:
        raise ApiError(401, "no_session", "Not signed in")
    return s


@app.post("/api/auth/logout")
def auth_logout(authorization: str | None = Header(None)):
    auth.logout((authorization or "").removeprefix("Bearer ").strip())
    return {"ok": True}


@app.get("/api/{path:path}")
def api_404(path: str):
    raise ApiError(404, "not_found", f"No API route /api/{path}")


# ---------------------------------------------------------------- built frontend (single-port mode)
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
