"""Independent even-order class-B fixtures (SciPy 1.17.1 / NumPy 2.4.6).

Classical SciPy ellipap -> class B frequency transformation, normalized at Ωp=1.
DC attenuation is preserved; the largest transmission zero moves to infinity.
Neither Python nor SciPy is needed to run the app or its regression tests.
"""
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.signal import ellipap, freqs_zpk
from scipy.signal._filter_design import _ellipdeg

cases = []
for order in range(2, 19, 2):
    for ripple, attenuation in [(0.1, 80), (0.5, 40), (3, 40)]:
        zeros, poles, _ = ellipap(order, ripple, attenuation)
        m1 = np.expm1(ripple * np.log(10) / 10) / np.expm1(attenuation * np.log(10) / 10)
        m = _ellipdeg(order, m1)
        a2 = 0
        zmax2 = max(abs(zeros)) ** 2
        c = (1 - a2) / (zmax2 - 1)
        b = zmax2 * c
        transformed_poles = np.sqrt((poles ** 2 + a2) / (b + c * poles ** 2))
        transformed_poles = np.where(transformed_poles.real > 0, -transformed_poles, transformed_poles)
        finite = zeros[abs(zeros) < np.sqrt(zmax2) * (1 - 1e-12)]
        transformed_zeros = 1j * np.sign(finite.imag) * np.sqrt((abs(finite) ** 2 - a2) / (b - c * abs(finite) ** 2))
        gain = 10 ** (-ripple / 20) * np.real(np.prod(-transformed_poles) / np.prod(-transformed_zeros))
        stopband = np.sqrt((1 / m - a2) / (b - c / m))
        frequencies = np.array([0, .05, .2, .5, .8, .95, .99, .999, 1, 1.0001, 1.001, 1.01, 1.1, 1.5, 2, 5, 10, stopband])
        _, response = freqs_zpk(transformed_zeros, transformed_poles, gain, frequencies)
        cases.append({"order": order, "ripple": ripple, "attenuation": attenuation,
                      "stopbandRatio": float(stopband),
                      "samples": [{"frequency": float(w), "re": float(h.real), "im": float(h.imag)} for w, h in zip(frequencies, response)]})

destination = Path(__file__).resolve().parents[1] / "src/lib/fixtures/elliptic-b-reference.json"
destination.write_text(json.dumps({"source": f"SciPy {scipy.__version__} ellipap, transformed to unequal-termination class B; freqs_zpk complex reference. Normalized Ωp=1.", "cases": cases}, indent=2) + "\n")
