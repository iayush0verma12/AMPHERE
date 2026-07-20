"""
data/fleet_sim.py
-----------------
Generates a synthetic industrial EV fleet. Each vehicle is bound to a real/
synthetic battery cell (from load_severson), which gives it a genuine
degradation trajectory. Operational attributes (routes, payloads, shift
deadlines, chargers) drive the availability side of the problem.

This is the ONE clearly-simulated layer — the battery physics underneath comes
from the cell dataset, which can be the real Severson data.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from config import FLEET_SIZE, SEED, SOH_EOL
from data.load_severson import load_cells

VEHICLE_TYPES = ["e-truck", "e-truck", "e-bus", "intra-plant-hauler", "e-tipper"]
SHIFTS = ["06:00", "06:00", "14:00", "22:00"]   # start-of-shift ready-by times


def soh_from_cycles(cycles_done: int, cycle_life: int) -> float:
    """
    Capacity fade curve. SoH = 1.0 at cycle 0, hits SOH_EOL (0.80) at cycle_life.
    Slightly convex (knee near end of life), which is realistic for LFP.
    """
    frac = np.clip(cycles_done / max(cycle_life, 1), 0, 1.15)
    soh = 1.0 - (1.0 - SOH_EOL) * (frac ** 1.15)
    return float(np.clip(soh, 0.55, 1.0))


def build_fleet(size: int = FLEET_SIZE, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    cells, _ = load_cells()
    chosen = cells.sample(size, random_state=seed).reset_index(drop=True)

    rows = []
    for i, cell in chosen.iterrows():
        life = int(cell.cycle_life)
        # place each vehicle somewhere along its life (10%–95% used)
        used_frac = rng.uniform(0.10, 0.95)
        cycles_done = int(used_frac * life)
        soh = soh_from_cycles(cycles_done, life)

        rows.append({
            "asset_id": f"EV-{i+1:03d}",
            "vehicle_type": VEHICLE_TYPES[i % len(VEHICLE_TYPES)],
            "cell_id": cell.cell_id,
            "route_km": int(rng.uniform(80, 320)),
            "payload_t": round(float(rng.uniform(4, 18)), 1),
            "duty_cycles_per_day": int(rng.choice([1, 2, 2, 3])),
            "shift_ready_by": SHIFTS[i % len(SHIFTS)],
            "charger_kw": int(rng.choice([30, 60, 60, 120])),
            "cycle_life": life,
            "cycles_done": cycles_done,
            "soh": round(soh, 4),
            "rul_true": max(life - cycles_done, 0),
            "temp_events": int(rng.poisson(2)),
            # carry the cell features so the model can predict per-asset
            **{c: float(cell[c]) for c in
               ["log_var_dQ", "slope_cap_fade", "min_dQ",
                "avg_charge_time", "internal_res", "temp_integral"]},
        })

    return pd.DataFrame(rows)


def fast_forward(fleet: pd.DataFrame, asset_id: str, extra_cycles: int) -> pd.DataFrame:
    """Age one asset for the demo (push it toward the SoH warning threshold)."""
    fleet = fleet.copy()
    m = fleet.asset_id == asset_id
    fleet.loc[m, "cycles_done"] += extra_cycles
    for idx in fleet[m].index:
        life = int(fleet.at[idx, "cycle_life"])
        cd = int(fleet.at[idx, "cycles_done"])
        fleet.at[idx, "soh"] = round(soh_from_cycles(cd, life), 4)
        fleet.at[idx, "rul_true"] = max(life - cd, 0)
    return fleet


if __name__ == "__main__":
    f = build_fleet()
    print(f[["asset_id", "vehicle_type", "cycles_done", "soh", "rul_true",
             "shift_ready_by", "charger_kw"]].to_string(index=False))
