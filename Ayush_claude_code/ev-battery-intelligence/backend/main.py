"""
FastAPI backend for the Industrial EV Battery Intelligence prototype.

Run: uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ml.soh_rul_model import load_soh_model, predict_soh, estimate_rul
from ml.fault_detection import load_anomaly_model
from ml.data_generator import FAULT_TYPES
from simulation import FleetSimulator

app = FastAPI(title="EV Battery Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

soh_model = load_soh_model()
anomaly_model = load_anomaly_model()

simulator = FleetSimulator()
simulator.set_anomaly_model(anomaly_model)
simulator.start_background_thread()


def _status_from_faults(faults: list[dict]) -> str:
    severities = {f["severity"] for f in faults}
    if "CRITICAL" in severities:
        return "CRITICAL"
    if "WARNING" in severities:
        return "WARNING"
    return "HEALTHY"


def _vehicle_prediction(vstate):
    latest = vstate.history.iloc[-1]
    profile = vstate.profile
    cycle_count = float(latest["cycle_count"])
    calendar_age_days = float(profile.get("calendar_age_days", cycle_count))
    cycles_per_day = cycle_count / max(calendar_age_days, 1e-6)

    soh_pred = predict_soh(
        soh_model, cycle_count, profile["avg_dod"], profile["avg_c_rate"], profile["avg_temp"], calendar_age_days
    )
    rul_cycles, rul_days, curve = estimate_rul(
        soh_model,
        cycle_count,
        profile["avg_dod"],
        profile["avg_c_rate"],
        profile["avg_temp"],
        calendar_age_days,
        cycles_per_day,
    )
    return soh_pred, rul_cycles, rul_days, curve


@app.get("/api/health")
def health():
    return {"status": "ok", "fleet_size": len(simulator.vehicles)}


@app.get("/api/fleet")
def get_fleet():
    out = []
    for vid, vstate in simulator.vehicles.items():
        latest = vstate.history.iloc[-1]
        faults = simulator.latest_faults(vid)
        soh_pred, rul_cycles, rul_days, _ = _vehicle_prediction(vstate)
        out.append(
            {
                "vehicle_id": vid,
                "model": vstate.profile["model"],
                "soc": round(float(latest["soc"]), 1),
                "soh": round(soh_pred, 1),
                "rul_days": round(rul_days, 0),
                "status": _status_from_faults(faults),
                "active_faults": faults,
                "last_updated": str(latest["timestamp"]),
            }
        )
    out.sort(key=lambda v: {"CRITICAL": 0, "WARNING": 1, "HEALTHY": 2}[v["status"]])
    return out


@app.get("/api/battery/{vehicle_id}")
def get_battery(vehicle_id: str):
    vstate = simulator.vehicles.get(vehicle_id)
    if vstate is None:
        raise HTTPException(status_code=404, detail="vehicle not found")

    latest = vstate.history.iloc[-1]
    faults = simulator.latest_faults(vehicle_id)
    soh_pred, rul_cycles, rul_days, curve = _vehicle_prediction(vstate)

    cell_voltages = [float(latest[f"cell_{i+1}_v"]) for i in range(12)]

    return {
        "vehicle_id": vehicle_id,
        "profile": vstate.profile,
        "latest": {
            "timestamp": str(latest["timestamp"]),
            "soc": round(float(latest["soc"]), 1),
            "pack_voltage": round(float(latest["pack_voltage"]), 2),
            "pack_current": round(float(latest["pack_current"]), 1),
            "pack_temp": round(float(latest["pack_temp"]), 1),
            "cell_voltages": [round(v, 3) for v in cell_voltages],
        },
        "soh_predicted": round(soh_pred, 2),
        "rul_cycles": round(rul_cycles, 0),
        "rul_days": round(rul_days, 0),
        "soh_projection": [{"cycle": c, "soh": round(s, 1)} for c, s in curve],
        "status": _status_from_faults(faults),
        "active_faults": faults,
    }


@app.get("/api/battery/{vehicle_id}/history")
def get_battery_history(vehicle_id: str, limit: int = 100):
    vstate = simulator.vehicles.get(vehicle_id)
    if vstate is None:
        raise HTTPException(status_code=404, detail="vehicle not found")

    df = vstate.history.tail(limit)
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "timestamp": str(row["timestamp"]),
                "soc": round(float(row["soc"]), 1),
                "soh": round(float(row["soh"]), 2),
                "pack_voltage": round(float(row["pack_voltage"]), 2),
                "pack_current": round(float(row["pack_current"]), 1),
                "pack_temp": round(float(row["pack_temp"]), 1),
                "fault_label": row["fault_label"],
            }
        )
    return records


@app.get("/api/alerts")
def get_alerts():
    alerts = []
    for vid, vstate in simulator.vehicles.items():
        for f in simulator.latest_faults(vid):
            alerts.append(
                {
                    "vehicle_id": vid,
                    "model": vstate.profile["model"],
                    "timestamp": str(vstate.history.iloc[-1]["timestamp"]),
                    **f,
                }
            )
    severity_order = {"CRITICAL": 0, "WARNING": 1}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 2))
    return alerts


@app.get("/api/fault-types")
def get_fault_types():
    return FAULT_TYPES


class InjectFaultRequest(BaseModel):
    fault_type: Optional[str] = None  # None clears the injected fault


@app.post("/api/battery/{vehicle_id}/inject-fault")
def inject_fault(vehicle_id: str, req: InjectFaultRequest):
    if vehicle_id not in simulator.vehicles:
        raise HTTPException(status_code=404, detail="vehicle not found")
    if req.fault_type is not None and req.fault_type not in FAULT_TYPES:
        raise HTTPException(status_code=400, detail=f"unknown fault_type, expected one of {FAULT_TYPES}")
    simulator.inject_fault(vehicle_id, req.fault_type)
    return {"vehicle_id": vehicle_id, "active_fault": req.fault_type}
