"""
models/degradation.py
---------------------
Predicts total battery cycle-life from early-cycle features (Severson approach),
then derives per-asset State-of-Health and Remaining-Useful-Life WITH an
uncertainty band. The uncertainty band is not optional — a maintenance decision
without a confidence interval is a toy.

Baseline (here): Gradient Boosting + Quantile Gradient Boosting for the band.
Runs fine on CPU. The GPU stretch is a physics-informed NN residual on top —
see models/degradation_gpu.py (stub) for where that plugs in.

Headline metric: MAPE of predicted vs. observed cycle-life on a held-out split.
Target: match or beat the paper's ~9–15% test error.
"""
from __future__ import annotations
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_percentage_error, mean_absolute_error

from config import MODEL_PATH, SEED, SOH_EOL
from data.load_severson import load_cells, FEATURE_COLS
from data.fleet_sim import soh_from_cycles


class DegradationModel:
    def __init__(self):
        self.point = GradientBoostingRegressor(
            n_estimators=350, max_depth=3, learning_rate=0.04,
            subsample=0.85, random_state=SEED)
        self.lo = GradientBoostingRegressor(
            loss="quantile", alpha=0.1, n_estimators=300, max_depth=3,
            learning_rate=0.05, random_state=SEED)
        self.hi = GradientBoostingRegressor(
            loss="quantile", alpha=0.9, n_estimators=300, max_depth=3,
            learning_rate=0.05, random_state=SEED)
        self.metrics: dict = {}

    # ---------------------------------------------------------------- train
    def fit(self):
        cells, is_real = load_cells()
        X = cells[FEATURE_COLS].values
        y = cells["cycle_life"].values
        Xtr, Xte, ytr, yte = train_test_split(
            X, y, test_size=0.25, random_state=SEED)

        self.point.fit(Xtr, ytr)
        self.lo.fit(Xtr, ytr)
        self.hi.fit(Xtr, ytr)

        pred = self.point.predict(Xte)
        self.metrics = {
            "data": "real" if is_real else "synthetic",
            "n_train": len(Xtr), "n_test": len(Xte),
            "mape": round(float(mean_absolute_percentage_error(yte, pred)) * 100, 2),
            "mae_cycles": round(float(mean_absolute_error(yte, pred)), 1),
            # keep held-out points for the "predicted vs observed" demo chart
            "y_true": yte.tolist(), "y_pred": pred.round().tolist(),
        }
        return self

    # ---------------------------------------------------------------- predict
    def predict_life(self, feats: np.ndarray) -> dict:
        feats = feats.reshape(1, -1)
        life = float(self.point.predict(feats)[0])
        lo = float(self.lo.predict(feats)[0])
        hi = float(self.hi.predict(feats)[0])
        lo, hi = min(lo, life), max(hi, life)      # keep band coherent
        return {"life": life, "life_lo": lo, "life_hi": hi}

    def asset_health(self, asset: dict) -> dict:
        """SoH + RUL (cycles) + uncertainty band + confidence for one fleet asset."""
        feats = np.array([asset[c] for c in FEATURE_COLS], dtype=float)
        p = self.predict_life(feats)
        cd = asset["cycles_done"]
        rul = max(p["life"] - cd, 0)
        rul_lo = max(p["life_lo"] - cd, 0)
        rul_hi = max(p["life_hi"] - cd, 0)
        soh = soh_from_cycles(cd, int(round(p["life"])))
        # confidence: tighter band => higher confidence
        span = max(p["life_hi"] - p["life_lo"], 1)
        conf = float(np.clip(1 - span / max(p["life"], 1), 0.35, 0.97))
        return {
            "soh": round(soh, 4),
            "cycles_done": cd,
            "rul_cycles": int(round(rul)),
            "rul_low": int(round(rul_lo)),
            "rul_high": int(round(rul_hi)),
            "confidence": round(conf, 3),
            "eol_soh": SOH_EOL,
        }

    # ---------------------------------------------------------------- persist
    def save(self, path=MODEL_PATH):
        joblib.dump(self, path)

    @staticmethod
    def load(path=MODEL_PATH) -> "DegradationModel":
        return joblib.load(path)


def get_model(force_retrain: bool = False) -> DegradationModel:
    """Load cached model, or train + cache if missing/incompatible.
    Load failures self-heal by retraining so a demo can never break."""
    if MODEL_PATH.exists() and not force_retrain:
        try:
            return DegradationModel.load()
        except Exception:
            pass  # stale/incompatible cache -> retrain below
    m = DegradationModel().fit()
    m.save()
    return m


if __name__ == "__main__":
    m = get_model(force_retrain=True)
    print("Trained on", m.metrics["data"], "data")
    print(f"Test MAPE : {m.metrics['mape']}%   (target: beat ~9-15%)")
    print(f"Test MAE  : {m.metrics['mae_cycles']} cycles")
