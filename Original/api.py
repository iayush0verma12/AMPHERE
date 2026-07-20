"""
api.py — AMPERE bridge API.
Exposes the agent + models + engine (unchanged) to the React frontend over HTTP.
Run from this directory:  uvicorn api:app --port 8010
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import SOH_WARN, SOH_EOL, LLM_PROVIDER
from data.fleet_sim import build_fleet, fast_forward
from models.degradation import get_model
from models.anomaly import AnomalyDetector
from agent.tools import ToolContext
from agent.orchestrator import run_agent

app = FastAPI(title="AMPERE bridge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Without this, an unhandled exception (e.g. Ollama timing out) escapes
    # past CORSMiddleware and the browser reports an opaque "Failed to fetch"
    # instead of the real error. Returning a normal JSONResponse here keeps
    # it inside the middleware chain so CORS headers still get attached.
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})


_model = get_model()
_base_fleet = build_fleet()
_detector = AnomalyDetector().fit(_base_fleet)


def _status(soh: float) -> str:
    if soh <= SOH_EOL + 0.03:
        return "CRITICAL"
    if soh <= SOH_WARN:
        return "WARNING"
    return "HEALTHY"


@app.get("/api/health")
def health():
    return {"status": "ok", "provider": LLM_PROVIDER, "fleet_size": len(_base_fleet)}


@app.get("/api/metric")
def metric():
    m = _model.metrics
    return {
        "y_true": m["y_true"],
        "y_pred": m["y_pred"],
        "mape": m["mape"],
        "mae_cycles": m["mae_cycles"],
        "data": m["data"],
    }


@app.get("/api/fleet")
def fleet():
    flagged = _detector.flag(_base_fleet)
    out = []
    for _, row in flagged.iterrows():
        h = _model.asset_health(row.to_dict())
        out.append({
            "asset_id": row["asset_id"],
            "vehicle_type": row["vehicle_type"],
            "soh": h["soh"],
            "cycles_done": int(row["cycles_done"]),
            "rul_cycles": h["rul_cycles"],
            "confidence": h["confidence"],
            "anomaly": bool(row["anomaly"]),
            "status": _status(h["soh"]),
            "route_km": float(row["route_km"]),
            "duty_cycles_per_day": int(row["duty_cycles_per_day"]),
        })
    return out


@app.post("/api/agent/{asset_id}")
def agent(asset_id: str, fast_forward_cycles: int = 0):
    fleet_df = (fast_forward(_base_fleet, asset_id, fast_forward_cycles)
                if fast_forward_cycles else _base_fleet)
    if asset_id not in fleet_df.asset_id.tolist():
        raise HTTPException(status_code=404, detail=f"unknown asset_id '{asset_id}'")
    ctx = ToolContext(_model, _detector, fleet_df)
    return run_agent(ctx, asset_id)
