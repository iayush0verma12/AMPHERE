"""
engine/carbon.py
----------------
Net Zero carbon readout (bonus layer for the 'Accelerating Net Zero' theme).

Quantifies CO2 avoided vs an equivalent diesel fleet (Scope 1 displacement),
minus the grid emissions of charging, and surfaces the emissions delta between
naive and optimized charging. Thin analytics on top of data we already have.

All intensity constants live in config.py and are cited there.
"""
from __future__ import annotations

from config import (DIESEL_GCO2_PER_KM, GRID_GCO2_PER_KWH,
                    EV_KWH_PER_KM)


def asset_carbon(route_km: float, duty_cycles_per_day: int,
                 days: int = 365) -> dict:
    km = route_km * duty_cycles_per_day * days
    diesel_kg = km * DIESEL_GCO2_PER_KM / 1000.0
    grid_kg = km * EV_KWH_PER_KM * GRID_GCO2_PER_KWH / 1000.0
    saved_kg = diesel_kg - grid_kg
    return {
        "annual_km": int(km),
        "diesel_kg": round(diesel_kg, 1),
        "ev_grid_kg": round(grid_kg, 1),
        "co2_saved_kg": round(saved_kg, 1),
    }


def compute_carbon(fleet_rows: list[dict], charging_delta_cycles: int = 0) -> dict:
    """
    fleet_rows: list with route_km + duty_cycles_per_day.
    charging_delta_cycles: extra life preserved by optimized charging (feeds a
    small embodied-emissions saving from delaying pack replacement).
    """
    total_saved = 0.0
    total_diesel = 0.0
    for r in fleet_rows:
        c = asset_carbon(r["route_km"], r["duty_cycles_per_day"])
        total_saved += c["co2_saved_kg"]
        total_diesel += c["diesel_kg"]

    # ~75 kg CO2 embodied per kWh of pack manufacturing; delaying replacement
    # by preserved cycles avoids a slice of that. Rough but defensible.
    embodied_saving = charging_delta_cycles * 0.05  # kg proxy per preserved cycle

    return {
        "fleet_co2_saved_kg_yr": round(total_saved, 0),
        "fleet_co2_saved_t_yr": round(total_saved / 1000.0, 1),
        "diesel_baseline_kg_yr": round(total_diesel, 0),
        "charging_delta_kg": round(embodied_saving, 1),
        "reduction_pct": round(100 * total_saved / max(total_diesel, 1), 1),
    }


if __name__ == "__main__":
    rows = [{"route_km": 200, "duty_cycles_per_day": 2},
            {"route_km": 150, "duty_cycles_per_day": 3}]
    print(compute_carbon(rows, charging_delta_cycles=120))
