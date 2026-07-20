"""
Hybrid fault detection: rule-based control limits + an IsolationForest anomaly
detector layered on top.

Paper mapping: section 3.2 (battery-related issues: overcharge, over-discharge,
thermal runaway, cell imbalance) and section 3.2/6 ("ensemble learning and hybrid
models which combine statistical methods with machine learning have proven
effective"). Rules catch the well-understood, explainable failure modes (a
quality/safety engineer can read the threshold); the anomaly model catches
multivariate drift that no single threshold would trip -- e.g. a slightly-off
combination of temperature, current and voltage that is individually in-range.
"""

from __future__ import annotations

import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .data_generator import (
    N_CELLS,
    OVERVOLTAGE_THRESHOLD,
    UNDERVOLTAGE_THRESHOLD,
    OVERTEMP_THRESHOLD,
    THERMAL_RUNAWAY_THRESHOLD,
    CELL_IMBALANCE_THRESHOLD_V,
)

ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "..", "artifacts", "anomaly_model.pkl")

ANOMALY_FEATURES = ["pack_voltage", "pack_current", "pack_temp", "soc", "cell_voltage_spread"]


def _with_derived_columns(df: pd.DataFrame) -> pd.DataFrame:
    cell_cols = [f"cell_{i+1}_v" for i in range(N_CELLS)]
    df = df.copy()
    live_cells = df[cell_cols].replace(0, np.nan)
    df["cell_voltage_spread"] = (live_cells.max(axis=1) - live_cells.min(axis=1)).fillna(0)
    df["cell_voltage_min"] = live_cells.min(axis=1).fillna(0)
    df["cell_voltage_max"] = live_cells.max(axis=1).fillna(0)
    df["dropout_cells"] = (df[cell_cols] == 0).sum(axis=1)
    return df


def train_anomaly_model(all_histories: dict):
    """Fit IsolationForest on rows with no injected fault label (i.e. 'normal')."""
    frames = []
    for df in all_histories.values():
        d = _with_derived_columns(df)
        frames.append(d[d["fault_label"] == ""])
    normal = pd.concat(frames, ignore_index=True)

    model = IsolationForest(n_estimators=200, contamination=0.03, random_state=1)
    model.fit(normal[ANOMALY_FEATURES])

    os.makedirs(os.path.dirname(ARTIFACT_PATH), exist_ok=True)
    joblib.dump(model, ARTIFACT_PATH)
    return model


def load_anomaly_model():
    return joblib.load(ARTIFACT_PATH)


def evaluate_row(row: pd.Series, anomaly_model) -> list[dict]:
    """Run rule checks + anomaly model on a single telemetry row (already has
    derived columns from _with_derived_columns). Returns list of fault dicts.
    """
    faults = []

    if row["dropout_cells"] > 0:
        faults.append(
            {
                "type": "SENSOR_DROPOUT",
                "severity": "WARNING",
                "message": f"{int(row['dropout_cells'])} cell voltage sensor(s) reporting implausible 0V reading.",
            }
        )

    if row["cell_voltage_max"] >= OVERVOLTAGE_THRESHOLD:
        faults.append(
            {
                "type": "OVERVOLTAGE",
                "severity": "CRITICAL",
                "message": f"Cell voltage {row['cell_voltage_max']:.2f}V exceeds safe limit ({OVERVOLTAGE_THRESHOLD}V).",
            }
        )

    if 0 < row["cell_voltage_min"] < UNDERVOLTAGE_THRESHOLD:
        faults.append(
            {
                "type": "UNDERVOLTAGE",
                "severity": "CRITICAL",
                "message": f"Cell voltage {row['cell_voltage_min']:.2f}V below safe limit ({UNDERVOLTAGE_THRESHOLD}V).",
            }
        )

    if row["cell_voltage_spread"] >= CELL_IMBALANCE_THRESHOLD_V:
        faults.append(
            {
                "type": "CELL_IMBALANCE",
                "severity": "WARNING",
                "message": f"Cell voltage spread {row['cell_voltage_spread']*1000:.0f}mV exceeds balancing limit ({CELL_IMBALANCE_THRESHOLD_V*1000:.0f}mV).",
            }
        )

    if row["pack_temp"] >= THERMAL_RUNAWAY_THRESHOLD:
        faults.append(
            {
                "type": "THERMAL_RUNAWAY_RISK",
                "severity": "CRITICAL",
                "message": f"Pack temperature {row['pack_temp']:.1f}C in thermal-runaway risk zone (>{THERMAL_RUNAWAY_THRESHOLD}C).",
            }
        )
    elif row["pack_temp"] >= OVERTEMP_THRESHOLD:
        faults.append(
            {
                "type": "OVERTEMP",
                "severity": "WARNING",
                "message": f"Pack temperature {row['pack_temp']:.1f}C above nominal operating limit ({OVERTEMP_THRESHOLD}C).",
            }
        )

    if anomaly_model is not None:
        features = row[ANOMALY_FEATURES].to_frame().T
        is_anomaly = anomaly_model.predict(features)[0] == -1
        if is_anomaly and not faults:
            score = anomaly_model.decision_function(features)[0]
            faults.append(
                {
                    "type": "ANOMALY_DETECTED",
                    "severity": "WARNING",
                    "message": f"Multivariate anomaly detected (isolation score {score:.3f}) not matching a known rule -- flagged for review.",
                }
            )

    return faults


def evaluate_latest(df: pd.DataFrame, anomaly_model) -> list[dict]:
    d = _with_derived_columns(df.tail(1))
    return evaluate_row(d.iloc[0], anomaly_model)


def evaluate_history(df: pd.DataFrame, anomaly_model) -> pd.DataFrame:
    """Adds a `detected_faults` column (list of fault dicts) to every row."""
    d = _with_derived_columns(df)
    d["detected_faults"] = d.apply(lambda r: evaluate_row(r, anomaly_model), axis=1)
    return d
