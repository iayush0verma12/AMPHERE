"""Run once (or whenever you want fresh synthetic data + retrained models)."""

import json
import os

from ml.data_generator import generate_fleet_history, generate_training_population
from ml.soh_rul_model import train_soh_model
from ml.fault_detection import train_anomaly_model

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")


def main():
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    print("Generating SOH training population...")
    training_df = generate_training_population(n_samples=600)
    model, mae = train_soh_model(training_df)
    print(f"  SOH model trained. Held-out MAE: {mae:.3f} SOH points")

    print("Generating demo fleet telemetry...")
    histories = generate_fleet_history(n_vehicles=14, n_points=60)
    print(f"  Fleet size: {len(histories)} vehicles")

    print("Training anomaly detector on nominal telemetry...")
    train_anomaly_model(histories)

    # Persist fleet histories as JSON so the API server can load them without
    # regenerating (and so "live" simulation continues from the same base).
    fleet_payload = {}
    for vid, df in histories.items():
        payload = df.to_dict(orient="records")
        for row in payload:
            row["timestamp"] = row["timestamp"].isoformat()
        fleet_payload[vid] = {
            "profile": df.attrs["profile"],
            "history": payload,
        }

    with open(os.path.join(ARTIFACT_DIR, "fleet_seed.json"), "w") as f:
        json.dump(fleet_payload, f)

    print("Done. Artifacts written to backend/artifacts/")


if __name__ == "__main__":
    main()
