"""
engine/scheduler.py
-------------------
Maintenance Operations Optimiser (PS bullet 2).

Given per-asset RUL, workshop bay capacity, and shift patterns, produce a
maintenance plan that services the most-at-risk assets first without exceeding
daily bay capacity, flags conflicts where demand outstrips capacity, AND slots
each service into that asset's own idle window before its next shift — the
same overnight window it would otherwise use for charging. This is what makes
the plan genuinely "charging/shift aligned" rather than just day-and-bay.

Baseline: greedy by urgency (urgency = 1 / RUL, boosted by anomaly flag).
STRETCH: replace `_greedy` with an OR-Tools CP-SAT model that also respects
technician skills. The interface stays identical.
"""
from __future__ import annotations

from config import WORKSHOP_BAYS, MAINT_HOURS


def _urgency(asset_health: dict, anomalous: bool) -> float:
    rul = max(asset_health["rul_cycles"], 1)
    u = 1000.0 / rul
    if anomalous:
        u *= 1.5
    if asset_health["soh"] <= asset_health.get("eol_soh", 0.80) + 0.05:
        u *= 1.4
    return round(u, 3)


def _maintenance_window(shift_ready_by: str | None, duration_hrs: float = MAINT_HOURS) -> dict:
    """
    Place the service so it FINISHES right when the asset's next shift starts —
    the same idle window used for overnight charging, not competing with it.
    Falls back to a generic overnight window if no shift time is known.
    """
    if not shift_ready_by:
        return {"window_start": "22:00", "window_end": f"{int(22 + duration_hrs) % 24:02d}:00"}
    h, m = map(int, shift_ready_by.split(":"))
    end_h = h + m / 60.0
    start_h = (end_h - duration_hrs) % 24
    return {
        "window_start": f"{int(start_h):02d}:{int((start_h % 1) * 60):02d}",
        "window_end": shift_ready_by,
    }


def schedule_maintenance(fleet_health: list[dict],
                         bays: int = WORKSHOP_BAYS,
                         horizon_days: int = 5) -> dict:
    """
    fleet_health: list of dicts, each with
        asset_id, rul_cycles, soh, eol_soh, anomalous (bool), shift_ready_by (optional)
    """
    ranked = sorted(
        fleet_health,
        key=lambda a: _urgency(a, a.get("anomalous", False)),
        reverse=True,
    )

    slots_per_day = bays
    plan, day, used = [], 1, 0
    conflicts = []

    for a in ranked:
        # only schedule assets that actually need service soon
        needs_service = a["rul_cycles"] < 250 or a.get("anomalous", False) \
            or a["soh"] <= a.get("eol_soh", 0.80) + 0.06
        if not needs_service:
            continue
        if used >= slots_per_day:
            day += 1
            used = 0
        if day > horizon_days:
            conflicts.append(a["asset_id"])
            continue
        window = _maintenance_window(a.get("shift_ready_by"))
        plan.append({
            "asset_id": a["asset_id"],
            "day": day,
            "slot": used + 1,
            "window_start": window["window_start"],
            "window_end": window["window_end"],
            "reason": ("anomaly + low RUL" if a.get("anomalous")
                       else f"RUL {a['rul_cycles']} cycles"),
            "urgency": _urgency(a, a.get("anomalous", False)),
        })
        used += 1

    downtime_hours = len(plan) * MAINT_HOURS
    return {
        "plan": plan,
        "scheduled": len(plan),
        "downtime_hours": downtime_hours,
        "bays": bays,
        "horizon_days": horizon_days,
        "conflicts": conflicts,
    }


if __name__ == "__main__":
    demo = [
        {"asset_id": "EV-001", "rul_cycles": 90, "soh": 0.83, "eol_soh": 0.80,
         "anomalous": True, "shift_ready_by": "06:00"},
        {"asset_id": "EV-002", "rul_cycles": 180, "soh": 0.86, "eol_soh": 0.80,
         "anomalous": False, "shift_ready_by": "14:00"},
        {"asset_id": "EV-003", "rul_cycles": 700, "soh": 0.94, "eol_soh": 0.80,
         "anomalous": False, "shift_ready_by": "22:00"},
    ]
    print(schedule_maintenance(demo))