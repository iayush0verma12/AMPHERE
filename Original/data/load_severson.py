"""
data/load_severson.py
----------------------
Loads the MIT-Stanford (Severson et al., Nature Energy 2019) LFP cell dataset
and extracts the early-cycle features used to predict total cycle life.

REAL DATA:
    Download the dataset and drop the processed files in  data/severson/ .
    Then implement `_load_real()` to read them. The rest of the pipeline is
    already wired to whatever this module returns.

SYNTHETIC FALLBACK (default):
    If no real files are present, we generate a Severson-LIKE dataset of N_CELLS
    cells: each with early-cycle features and a true cycle-life that depends on
    them (dominant feature = log-variance of dQ(V), the paper's hero feature).
    This lets the whole pipeline train and report a real accuracy number on
    day zero, before the real data is downloaded.

Every cell row: features... + `cycle_life` (cycles to reach 80% SoH).
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from config import N_CELLS, SEED, SEVERSON_DIR

# The features we predict cycle-life from. `log_var_dQ` is the Severson hero feature.
FEATURE_COLS = [
    "log_var_dQ",        # log variance of dQ(V) between cycle 100 and 10  (dominant)
    "slope_cap_fade",    # linear slope of capacity fade, cycles 2-100
    "min_dQ",            # minimum of dQ(V) curve
    "avg_charge_time",   # average charge time, first 5 cycles
    "internal_res",      # internal resistance at cycle 2
    "temp_integral",     # integral of cell temperature over early cycles
]


def _real_files_present() -> bool:
    return SEVERSON_DIR.exists() and any(SEVERSON_DIR.glob("*.pkl"))


def _get_cycle(cell: dict, n: int):
    """Fetch within-cycle data for cycle n; keys may be str or int."""
    cyc = cell.get("cycles", {})
    for key in (str(n), n, float(n)):
        if key in cyc:
            return cyc[key]
    return None


def _featurize_cell(cell: dict) -> dict | None:
    """
    Extract the Severson early-cycle features from ONE cell's pkl entry.
    Hero feature: log10(var(Qdlin_100(V) - Qdlin_10(V))).
    """
    c10, c100 = _get_cycle(cell, 10), _get_cycle(cell, 100)
    if c10 is None or c100 is None:
        return None
    try:
        q10 = np.asarray(c10["Qdlin"], dtype=float)
        q100 = np.asarray(c100["Qdlin"], dtype=float)
    except (KeyError, TypeError):
        return None
    m = min(len(q10), len(q100))
    if m < 10:
        return None
    dQ = q100[:m] - q10[:m]
    var = np.var(dQ)
    if not np.isfinite(var) or var <= 0:
        return None

    summ = cell.get("summary", {})

    def s(key, default=0.0):
        arr = np.asarray(summ.get(key, []), dtype=float)
        return arr if arr.size else np.array([default])

    qd = s("QDischarge")
    ir = s("IR")
    tavg = s("Tavg")
    ct = s("chargetime")

    # capacity-fade slope over cycles 2..100 (or as far as available)
    hi = min(100, len(qd))
    if hi > 5:
        x = np.arange(2, hi)
        slope = float(np.polyfit(x, qd[2:hi], 1)[0]) * 1000  # scale for the model
    else:
        slope = 0.0

    life = cell.get("cycle_life")
    life = np.asarray(life).flatten()
    life = int(life[0]) if life.size else int(len(qd))

    return {
        "log_var_dQ": float(np.log10(var)),
        "slope_cap_fade": slope,
        "min_dQ": float(np.min(dQ)),
        "avg_charge_time": float(np.mean(ct[1:6])) if ct.size > 1 else float(ct.mean()),
        "internal_res": float(ir[1]) if ir.size > 1 else float(ir.mean()),
        "temp_integral": float(np.mean(tavg[2:hi])) if hi > 5 else float(tavg.mean()),
        "cycle_life": life,
    }


def _load_real() -> pd.DataFrame:
    """
    Parse the braatz .pkl batch files in data/severson/ into the feature table.
    Works with batch1.pkl / batch2.pkl / batch3.pkl (or any *.pkl of that format,
    or a single combined pkl). Each pkl is {cell_key: {descriptors, summary, cycles}}.
    """
    import pickle

    pkls = sorted(SEVERSON_DIR.glob("*.pkl"))
    if not pkls:
        raise NotImplementedError("No .pkl files in data/severson/ — using synthetic.")

    rows = []
    for p in pkls:
        with open(p, "rb") as f:
            bat = pickle.load(f)
        # some combined pkls nest as {'batchN': {cells}}; flatten one level if so
        cells = {}
        for k, v in bat.items():
            if isinstance(v, dict) and "cycles" in v:
                cells[f"{p.stem}:{k}"] = v
            elif isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(vv, dict) and "cycles" in vv:
                        cells[f"{p.stem}:{k}:{kk}"] = vv
        for cid, cell in cells.items():
            feat = _featurize_cell(cell)
            if feat:
                feat["cell_id"] = cid
                rows.append(feat)

    if not rows:
        raise NotImplementedError("Pkl files found but no cells featurized — using synthetic.")

    df = pd.DataFrame(rows)
    return df[["cell_id"] + FEATURE_COLS + ["cycle_life"]]


def _make_synthetic(n: int = N_CELLS, seed: int = SEED) -> pd.DataFrame:
    """Severson-like synthetic cells with a learnable feature->life relationship."""
    rng = np.random.default_rng(seed)

    # standardized latent features
    log_var_dQ   = rng.normal(-1.2, 0.55, n)     # dominant
    slope        = rng.normal(0.0, 1.0, n)
    min_dQ       = rng.normal(0.0, 1.0, n)
    charge_time  = rng.normal(0.0, 1.0, n)
    int_res      = rng.normal(0.0, 1.0, n)
    temp_int     = rng.normal(0.0, 1.0, n)

    # true cycle-life: strongly driven by log_var_dQ (as in the paper), plus others
    life = (
        1150
        - 620 * (log_var_dQ + 1.2)      # lower variance -> longer life
        - 70 * slope
        - 40 * int_res
        - 25 * temp_int
        + 30 * min_dQ
        + rng.normal(0, 55, n)          # irreducible noise
    )
    life = np.clip(life, 300, 2300).round().astype(int)

    return pd.DataFrame({
        "cell_id": [f"cell_{i:03d}" for i in range(n)],
        "log_var_dQ": log_var_dQ,
        "slope_cap_fade": slope,
        "min_dQ": min_dQ,
        "avg_charge_time": charge_time,
        "internal_res": int_res,
        "temp_integral": temp_int,
        "cycle_life": life,
    })


def load_cells() -> tuple[pd.DataFrame, bool]:
    """
    Returns (cells_df, is_real).
    cells_df has cell_id + FEATURE_COLS + cycle_life.
    Auto-uses real Severson pkls in data/severson/ if present and parseable;
    otherwise falls back to synthetic so the pipeline always runs.
    """
    if _real_files_present():
        try:
            df = _load_real()
            if len(df) >= 10:                      # sanity: enough cells to train
                print(f"[load_severson] using REAL data: {len(df)} cells")
                return df, True
            print(f"[load_severson] only {len(df)} real cells parsed — "
                  "falling back to synthetic")
        except Exception as e:                     # malformed pkl, missing keys, etc.
            print(f"[load_severson] real load failed ({e}) — using synthetic")
    return _make_synthetic(), False


if __name__ == "__main__":
    df, is_real = load_cells()
    print(f"Loaded {len(df)} cells ({'REAL' if is_real else 'SYNTHETIC'})")
    print(df.head())
    print("cycle_life range:", df.cycle_life.min(), "-", df.cycle_life.max())