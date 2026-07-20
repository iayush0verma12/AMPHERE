"""
models/degradation_gpu.py  (STRETCH — Day 2 if time allows)
-----------------------------------------------------------
Physics-informed residual on top of the baseline degradation model.

Idea: the baseline (models/degradation.py) predicts cycle-life from early-cycle
features. Real battery aging follows known electrochemistry (SEI growth, Li
plating, capacity fade ~ a*sqrt(cycles) + b*cycles). A small neural net learns
only the RESIDUAL the physics prior can't explain — more accurate with less
data, and research-grade novel.

This file is a stub. Wire it only after the baseline metric is locked and the
demo works end-to-end. Keep the SAME interface (predict_life / asset_health) so
nothing downstream changes.

    physics_prior(cycles)      -> analytic SoH curve
    ResidualNet(features)      -> correction term
    life_hat = solve(prior + residual == SOH_EOL)

Requires torch (see requirements-gpu.txt). Runs on the GPU laptop.
"""
raise NotImplementedError(
    "Stretch goal — implement the physics-informed residual here on Day 2. "
    "The CPU baseline in models/degradation.py already produces the headline metric."
)
