"""
State-of-Health (SOH) regression + Remaining-Useful-Life (RUL) projection.

Paper mapping: section 4.2 (SOH prediction: regression/probabilistic models) and
section 4.7 (RUL: machine-learning + time-series projection, end-of-life
convention of 80% SOH). We use Gradient Boosting here (ensemble learning, as
called out in the paper) rather than an LSTM so the prototype trains in
milliseconds with no GPU/deep-learning stack -- the feature/label interface is
identical if you later swap in an LSTM/CNN over raw voltage-current-temperature
sequences instead of these summary features.
"""

from __future__ import annotations

import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

FEATURES = ["cycle_count", "avg_dod", "avg_c_rate", "avg_temp", "calendar_age_days"]
EOL_SOH_THRESHOLD = 80.0  # end-of-life convention used in the reference paper

ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "..", "artifacts", "soh_model.pkl")


def train_soh_model(training_df: pd.DataFrame):
    X = training_df[FEATURES]
    y = training_df["soh"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=1)

    model = GradientBoostingRegressor(
        n_estimators=250, max_depth=3, learning_rate=0.05, random_state=1
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)

    os.makedirs(os.path.dirname(ARTIFACT_PATH), exist_ok=True)
    joblib.dump(model, ARTIFACT_PATH)
    return model, mae


def load_soh_model():
    return joblib.load(ARTIFACT_PATH)


def predict_soh(model, cycle_count, avg_dod, avg_c_rate, avg_temp, calendar_age_days):
    row = pd.DataFrame(
        [[cycle_count, avg_dod, avg_c_rate, avg_temp, calendar_age_days]], columns=FEATURES
    )
    return float(model.predict(row)[0])


def estimate_rul(
    model,
    cycle_count,
    avg_dod,
    avg_c_rate,
    avg_temp,
    calendar_age_days,
    cycles_per_day,
    max_horizon_cycles=3000,
    step=10,
):
    """Project the fitted SOH curve forward until it crosses the EOL threshold.

    Returns (rul_cycles, rul_days, projected_eol_soh_curve) where the curve is a
    small list of (cycle, soh) points useful for plotting the projection.
    """
    horizon = np.arange(cycle_count, cycle_count + max_horizon_cycles, step)
    added_age = (horizon - cycle_count) * (calendar_age_days / max(cycle_count, 1) if cycle_count > 0 else 1)

    rows = pd.DataFrame(
        {
            "cycle_count": horizon,
            "avg_dod": avg_dod,
            "avg_c_rate": avg_c_rate,
            "avg_temp": avg_temp,
            "calendar_age_days": calendar_age_days + added_age,
        }
    )[FEATURES]

    projected_soh = model.predict(rows)
    curve = list(zip(horizon.tolist(), projected_soh.tolist()))

    below = np.where(projected_soh <= EOL_SOH_THRESHOLD)[0]
    if len(below) == 0:
        rul_cycles = float(max_horizon_cycles)
    else:
        rul_cycles = float(horizon[below[0]] - cycle_count)

    cycles_per_day = max(cycles_per_day, 0.05)
    rul_days = rul_cycles / cycles_per_day

    return rul_cycles, rul_days, curve[::20]  # thin the curve for API payload size
