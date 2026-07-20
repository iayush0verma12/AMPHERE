"""
Synthetic industrial EV battery telemetry generator.

There is no single public dataset that covers pack-level industrial EV telemetry
(voltage/current/temperature per cell, duty cycles, faults) at the fidelity this
prototype needs, so we generate physically-motivated synthetic data instead:

- Calendar + cycle aging model loosely based on the degradation drivers described
  in the reference paper (cycle count, depth-of-discharge, C-rate, temperature).
- A demo fleet of vehicles, a few of which have injected faults (thermal event,
  cell imbalance, sensor dropout, overvoltage/undervoltage) so the fault-detection
  pipeline has real signal to catch during the demo.

Swap this module for a real telemetry ingestion pipeline (CAN bus / BMS feed) when
scaling beyond the prototype -- everything downstream (feature extraction, models,
API schema) stays the same.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

N_CELLS = 12
NOMINAL_CELL_V = 3.7
OVERVOLTAGE_THRESHOLD = 4.25
UNDERVOLTAGE_THRESHOLD = 2.80
OVERTEMP_THRESHOLD = 55.0
THERMAL_RUNAWAY_THRESHOLD = 65.0
CELL_IMBALANCE_THRESHOLD_V = 0.08  # 80 mV spread across pack

VEHICLE_MODELS = ["e-Truck 9T", "e-LCV 3.5T", "e-Bus 12M", "e-Forklift 5T"]

FAULT_TYPES = [
    "THERMAL_EVENT",
    "CELL_IMBALANCE",
    "SENSOR_DROPOUT",
    "OVERVOLTAGE",
    "UNDERVOLTAGE",
]


def _rng(seed):
    return np.random.default_rng(seed)


def true_soh(cycles, dod, c_rate, avg_temp):
    """Ground-truth capacity-fade curve used to label synthetic training data.

    Fade accelerates with cycle count (sqrt term for calendar-like fade + linear
    cycling term), depth-of-discharge, C-rate, and temperature above 25C -- all
    called out as SOH drivers in the reference paper.
    """
    cycle_term = 0.018 * np.sqrt(cycles)
    dod_term = 0.010 * cycles * dod
    crate_term = 0.006 * cycles * np.maximum(0, c_rate - 0.5)
    temp_term = 0.004 * cycles * np.maximum(0, avg_temp - 25) / 10
    soh = 100 - cycle_term - dod_term - crate_term - temp_term
    return np.clip(soh, 55, 100)


def generate_training_population(n_samples=600, seed=7):
    """Wide synthetic population used only to fit the SOH regressor."""
    rng = _rng(seed)
    cycles = rng.uniform(0, 2200, n_samples)
    dod = rng.uniform(0.2, 1.0, n_samples)
    c_rate = rng.uniform(0.3, 2.5, n_samples)
    avg_temp = rng.uniform(15, 45, n_samples)
    calendar_age_days = cycles * rng.uniform(0.8, 1.6, n_samples)

    soh = true_soh(cycles, dod, c_rate, avg_temp)
    noise = rng.normal(0, 0.6, n_samples)
    soh_observed = np.clip(soh + noise, 50, 100)

    return pd.DataFrame(
        {
            "cycle_count": cycles,
            "avg_dod": dod,
            "avg_c_rate": c_rate,
            "avg_temp": avg_temp,
            "calendar_age_days": calendar_age_days,
            "soh": soh_observed,
        }
    )


def _vehicle_profiles(n_vehicles=14, seed=42):
    rng = _rng(seed)
    profiles = []
    fault_slots = rng.choice(n_vehicles, size=min(5, n_vehicles), replace=False)
    fault_assignment = {
        int(v): FAULT_TYPES[i % len(FAULT_TYPES)] for i, v in enumerate(fault_slots)
    }

    for i in range(n_vehicles):
        cycles = float(rng.uniform(80, 1800))
        dod = float(rng.uniform(0.3, 0.9))
        c_rate = float(rng.uniform(0.4, 2.0))
        avg_temp = float(rng.uniform(20, 40))
        profiles.append(
            {
                "vehicle_id": f"EV-{i+1:03d}",
                "model": VEHICLE_MODELS[i % len(VEHICLE_MODELS)],
                "cycle_count": cycles,
                "avg_dod": dod,
                "avg_c_rate": c_rate,
                "avg_temp": avg_temp,
                "calendar_age_days": cycles * float(rng.uniform(0.9, 1.4)),
                "fault_injection": fault_assignment.get(i),
            }
        )
    return profiles


def generate_fleet_history(n_vehicles=14, n_points=60, seed=42):
    """Per-vehicle time series telemetry for the live dashboard demo.

    Returns dict: vehicle_id -> DataFrame with one row per timestamp, including
    per-cell voltages, pack current/temp, SOC, ground-truth SOH, and a
    `fault_label` column (empty string when nominal) marking injected fault rows.
    """
    profiles = _vehicle_profiles(n_vehicles, seed)
    rng = _rng(seed + 1)
    histories = {}

    for profile in profiles:
        vid = profile["vehicle_id"]
        base_cycles = profile["cycle_count"]
        timestamps = pd.date_range(end=pd.Timestamp.utcnow(), periods=n_points, freq="6h")

        cycles_series = base_cycles + np.linspace(-2, 0, n_points)
        soh_series = true_soh(
            cycles_series, profile["avg_dod"], profile["avg_c_rate"], profile["avg_temp"]
        ) + rng.normal(0, 0.3, n_points)

        # SOC follows a repeating charge/discharge duty cycle
        soc_series = 50 + 45 * np.sin(np.linspace(0, 6 * np.pi, n_points))
        soc_series = np.clip(soc_series + rng.normal(0, 2, n_points), 5, 100)

        pack_current = np.where(
            np.diff(soc_series, prepend=soc_series[0]) >= 0,
            rng.uniform(20, 80, n_points),   # charging
            -rng.uniform(20, 120, n_points), # discharging
        )
        pack_temp = profile["avg_temp"] + rng.normal(0, 1.5, n_points) + np.abs(pack_current) * 0.03
        pack_voltage = N_CELLS * NOMINAL_CELL_V * (0.85 + 0.15 * soc_series / 100)

        cell_voltage_matrix = np.tile((pack_voltage / N_CELLS).reshape(-1, 1), (1, N_CELLS))
        cell_voltage_matrix += rng.normal(0, 0.01, (n_points, N_CELLS))

        fault_label = np.array([""] * n_points, dtype=object)
        fault_type = profile["fault_injection"]
        if fault_type:
            fault_start = n_points - rng.integers(6, 16)
            if fault_type == "THERMAL_EVENT":
                pack_temp[fault_start:] += np.linspace(5, 28, n_points - fault_start)
            elif fault_type == "CELL_IMBALANCE":
                weak_cell = rng.integers(0, N_CELLS)
                cell_voltage_matrix[fault_start:, weak_cell] -= np.linspace(
                    0.02, 0.15, n_points - fault_start
                )
            elif fault_type == "SENSOR_DROPOUT":
                dropout_cell = rng.integers(0, N_CELLS)
                cell_voltage_matrix[fault_start:, dropout_cell] = 0.0
            elif fault_type == "OVERVOLTAGE":
                cell_voltage_matrix[fault_start:, :] += np.linspace(
                    0.05, 0.45, n_points - fault_start
                ).reshape(-1, 1)
            elif fault_type == "UNDERVOLTAGE":
                cell_voltage_matrix[fault_start:, :] -= np.linspace(
                    0.05, 0.9, n_points - fault_start
                ).reshape(-1, 1)
            fault_label[fault_start:] = fault_type

        df = pd.DataFrame(
            {
                "timestamp": timestamps,
                "cycle_count": cycles_series,
                "soc": soc_series,
                "soh": np.clip(soh_series, 50, 100),
                "pack_voltage": cell_voltage_matrix.sum(axis=1),
                "pack_current": pack_current,
                "pack_temp": pack_temp,
                "fault_label": fault_label,
            }
        )
        for c in range(N_CELLS):
            df[f"cell_{c+1}_v"] = cell_voltage_matrix[:, c]

        df.attrs["profile"] = profile
        histories[vid] = df

    return histories
