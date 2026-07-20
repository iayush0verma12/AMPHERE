#!/usr/bin/env bash
set -e
python -m scripts.train          # trains + caches the degradation model
streamlit run app/streamlit_app.py
