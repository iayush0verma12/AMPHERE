"""
AMPERE — central configuration.
Everything tunable lives here so the rest of the code stays clean.
"""
import os
from pathlib import Path

# ---------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
SEVERSON_DIR = DATA_DIR / "severson"          # drop the real .mat/.csv files here
ARTIFACT_DIR = ROOT / "artifacts"             # trained models cached here
ARTIFACT_DIR.mkdir(exist_ok=True)
MODEL_PATH = ARTIFACT_DIR / "degradation.joblib"


# ---------------------------------------------------------------- .env loader
def _load_dotenv():
    """Minimal, dependency-free .env reader. Lets you switch LLM_PROVIDER etc.
    by editing a .env file instead of exporting shell vars."""
    envf = ROOT / ".env"
    if not envf.exists():
        return
    for line in envf.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.split("#", 1)[0]          # strip trailing inline comment
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

# ---------------------------------------------------------------- reproducibility
SEED = 42

# ---------------------------------------------------------------- battery / fleet
N_CELLS = 124            # matches the Severson dataset size for the synthetic fallback
FLEET_SIZE = 15          # synthetic industrial EV fleet
SOH_EOL = 0.80           # end-of-life: 80% of rated capacity (industry standard)
SOH_WARN = 0.85          # health warning threshold shown on the fleet map

# ---------------------------------------------------------------- charging model
#   strategy -> (charge power multiplier, extra degradation per session in SoH pts)
CHARGING_STRATEGIES = {
    "gentle":   {"kw_mult": 0.5, "life_factor": 1.00, "label": "Gentle (C/2)"},
    "balanced": {"kw_mult": 1.0, "life_factor": 0.88, "label": "Balanced (1C)"},
    "fast":     {"kw_mult": 2.0, "life_factor": 0.72, "label": "Fast (2C)"},
}
PACK_KWH = 200.0            # commercial e-truck pack size (kWh)
PACK_COST_INR = 1_000_000  # ~Rs 10 lakh pack — used for TCO / business-impact numbers
# ---------------------------------------------------------------- maintenance
WORKSHOP_BAYS = 3        # parallel maintenance slots per day
MAINT_HOURS = 4          # hours a bay is occupied per service

# ---------------------------------------------------------------- carbon
DIESEL_GCO2_PER_KM = 900       # heavy diesel truck, gCO2/km (well-to-wheel, approx)
GRID_GCO2_PER_KWH = 710        # India grid intensity, gCO2/kWh (CEA approx)
EV_KWH_PER_KM = 1.1            # e-truck consumption

# ---------------------------------------------------------------- LLM
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock")   # mock | ollama | anthropic | openai
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
AGENT_MAX_STEPS = 8