"""
scripts/mat_to_pkl.py
---------------------
Convert a Severson batch .mat file (MIT-Stanford dataset) into a compact .pkl
that AMPERE's loader reads directly. No Jupyter needed.

USAGE:
    python -m scripts.mat_to_pkl <path/to/batch.mat> <batch_number>
    e.g.  python -m scripts.mat_to_pkl 2017-05-12_batchdata_updated_struct_errorcorrect.mat 1
          -> writes data/severson/batch1.pkl

INSPECT (if a field errors, run this to see the structure and send it over):
    python -m scripts.mat_to_pkl <file.mat> --inspect

Design: we only extract what the model needs — cycle_life, the per-cycle summary
fields, and cycles 10 & 100 (for the ΔQ(V) feature). So the .mat is read lazily
via h5py and the output .pkl is tiny and fast, even from a 3 GB source.
"""
from __future__ import annotations
import sys
import pickle
from pathlib import Path

import numpy as np
import h5py

NEEDED_CYCLES = (10, 100)
SUMMARY_FIELDS = ["IR", "QCharge", "QDischarge", "Tavg", "Tmin", "Tmax",
                  "chargetime", "cycle"]


def inspect(mat_path: str):
    with h5py.File(mat_path, "r") as f:
        print("top-level keys:", list(f.keys()))
        batch = f["batch"]
        print("batch keys:", list(batch.keys()))
        n = batch["summary"].shape[0]
        print("num cells:", n)
        s = f[batch["summary"][0, 0]]
        print("summary fields:", list(s.keys()))
        cyc = f[batch["cycles"][0, 0]]
        print("cycle fields:", list(cyc.keys()))


def convert(mat_path: str, batch_num: int, out_path: str):
    with h5py.File(mat_path, "r") as f:
        batch = f["batch"]
        n = batch["summary"].shape[0]
        bat, ok = {}, 0
        for i in range(n):
            try:
                cl = np.array(f[batch["cycle_life"][i, 0]]).flatten()
                cl = int(cl[0]) if cl.size else 0

                s = f[batch["summary"][i, 0]]
                summary = {fld: np.array(s[fld]).flatten()
                           for fld in SUMMARY_FIELDS if fld in s}

                cyc = f[batch["cycles"][i, 0]]
                qd_refs = cyc["Qdlin"]
                ncyc = qd_refs.shape[0]
                cycles = {}
                for j in NEEDED_CYCLES:
                    if j < ncyc:
                        Qdlin = np.array(f[qd_refs[j, 0]]).flatten()
                        cycles[str(j)] = {"Qdlin": Qdlin}

                bat[f"b{batch_num}c{i}"] = {
                    "cycle_life": cl, "summary": summary, "cycles": cycles}
                ok += 1
            except Exception as e:  # one bad cell shouldn't kill the batch
                print(f"  cell {i}: skipped ({e})")

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as g:
        pickle.dump(bat, g)
    print(f"wrote {out_path}: {ok}/{n} cells")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python -m scripts.mat_to_pkl <file.mat> <batch_num>")
        print("       python -m scripts.mat_to_pkl <file.mat> --inspect")
        sys.exit(1)
    mat = sys.argv[1]
    if len(sys.argv) >= 3 and sys.argv[2] == "--inspect":
        inspect(mat)
        sys.exit(0)
    if len(sys.argv) < 3:
        print("error: need a batch number (1/2/3), or --inspect")
        sys.exit(1)
    bn = int(sys.argv[2])
    out = sys.argv[3] if len(sys.argv) > 3 else f"data/severson/batch{bn}.pkl"
    convert(mat, bn, out)
