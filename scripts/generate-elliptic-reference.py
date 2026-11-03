"""Regenerate independent elliptic fixtures with scipy==1.17.1, numpy==2.4.6.

Optional development tool; neither Python nor these packages are needed by
Filterstudio or npm test. Run this script from any directory after installing
the two pinned packages in a Python virtual environment.
"""

import json
from pathlib import Path

import numpy as np
import scipy
from scipy.signal import ellipap, freqs_zpk

cases = []
for order in [9, 11, 13, 15, 17, 19]:
    for ripple, attenuation in [(0.1, 80), (0.5, 40), (3, 40)]:
        zeros, poles, gain = ellipap(order, ripple, attenuation)
        frequencies = np.array([
            0, .05, .2, .5, .8, .95, .99, .999, 1, 1.00001, 1.0001,
            1.001, 1.005, 1.01, 1.05, 1.1, 1.5, 2, 5, 10,
        ])
        _, response = freqs_zpk(zeros, poles, gain, frequencies)
        cases.append({
            "order": order, "ripple": ripple, "attenuation": attenuation,
            "samples": [
                {"frequency": float(w), "re": float(h.real), "im": float(h.imag)}
                for w, h in zip(frequencies, response)
            ],
        })

destination = Path(__file__).resolve().parents[1] / "src/lib/fixtures/elliptic-high-order.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps({
    "source": f"SciPy {scipy.__version__}: scipy.signal.ellipap and freqs_zpk, normalized angular cutoff 1 rad/s. Generated independently of Filterstudio; no Python needed to run these regression tests.",
    "cases": cases,
}, indent=2) + "\n")
