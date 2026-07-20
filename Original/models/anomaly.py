"""
models/anomaly.py
-----------------
Lightweight thermal / degradation-rate outlier flag over the fleet.
IsolationForest on a few cell-behaviour features — deliberately simple.
Flags assets whose degradation signature or thermal-event count is abnormal,
which the agent treats as an extra risk signal.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from config import SEED

ANOMALY_FEATURES = ["slope_cap_fade", "internal_res", "temp_integral", "temp_events"]


class AnomalyDetector:
    def __init__(self):
        self.model = IsolationForest(
            n_estimators=150, contamination=0.15, random_state=SEED)
        self._fitted = False

    def fit(self, fleet: pd.DataFrame):
        self.model.fit(fleet[ANOMALY_FEATURES].values)
        self._fitted = True
        return self

    def flag(self, fleet: pd.DataFrame) -> pd.DataFrame:
        if not self._fitted:
            self.fit(fleet)
        X = fleet[ANOMALY_FEATURES].values
        raw = self.model.decision_function(X)          # higher = more normal
        fleet = fleet.copy()
        fleet["anomaly"] = self.model.predict(X) == -1  # True = anomalous
        fleet["anomaly_score"] = (-raw).round(4)        # higher = more anomalous
        return fleet

    def asset_flag(self, fleet: pd.DataFrame, asset_id: str) -> dict:
        f = self.flag(fleet)
        row = f[f.asset_id == asset_id].iloc[0]
        return {"anomalous": bool(row["anomaly"]),
                "score": float(row["anomaly_score"])}


if __name__ == "__main__":
    from data.fleet_sim import build_fleet
    fleet = build_fleet()
    det = AnomalyDetector().fit(fleet)
    out = det.flag(fleet)
    print(out[["asset_id", "temp_events", "anomaly", "anomaly_score"]]
          .sort_values("anomaly_score", ascending=False).to_string(index=False))
