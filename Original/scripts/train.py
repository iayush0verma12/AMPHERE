"""
scripts/train.py — train + cache the degradation model, print the headline metric.
Run once after cloning (or whenever the data changes):  python -m scripts.train
"""
from models.degradation import get_model

if __name__ == "__main__":
    m = get_model(force_retrain=True)
    print(f"[AMPERE] degradation model trained on {m.metrics['data']} data")
    print(f"         test MAPE = {m.metrics['mape']}%  |  "
          f"MAE = {m.metrics['mae_cycles']} cycles  |  "
          f"n_test = {m.metrics['n_test']}")
