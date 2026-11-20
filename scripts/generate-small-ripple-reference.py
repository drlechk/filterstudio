"""Independent small-ripple Cauer references: SciPy ellipap and class B/C maps."""
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.signal import ellipap, freqs_zpk
from scipy.signal._filter_design import _ellipdeg
from scipy.special import ellipj, ellipk

cases = []
for order in [3, 5, 18, 19]:
    for ripple in [0.001, -10 * np.log1p(-.02 ** 2) / np.log(10), -10 * np.log1p(-.15 ** 2) / np.log(10)]:
        for variant in (['b', 'c'] if order % 2 == 0 else ['c']):
            attenuation = 40
            zeros, poles, gain = ellipap(order, ripple, attenuation)
            if order % 2 == 0:
                m = _ellipdeg(order, np.expm1(ripple * np.log(10) / 10) / np.expm1(attenuation * np.log(10) / 10))
                a2 = 0 if variant == 'b' else ellipj(ellipk(m) / order, m)[0] ** 2
                zmax2 = max(abs(zeros)) ** 2
                c = (1 - a2) / (zmax2 - 1)
                b = zmax2 * c
                poles = np.sqrt((poles ** 2 + a2) / (b + c * poles ** 2))
                poles = np.where(poles.real > 0, -poles, poles)
                finite = zeros[abs(zeros) < np.sqrt(zmax2) * (1 - 1e-12)]
                zeros = 1j * np.sign(finite.imag) * np.sqrt((abs(finite) ** 2 - a2) / (b - c * abs(finite) ** 2))
                gain = np.real(np.prod(-poles) / np.prod(-zeros)) * (10 ** (-ripple / 20) if variant == 'b' else 1)
            frequencies = np.array([0, .1, .3, .6, .9, .99, 1, 1.01, 1.1, 1.5, 2, 5])
            _, response = freqs_zpk(zeros, poles, gain, frequencies)
            cases.append(dict(order=order, ripple=float(ripple), attenuation=attenuation, cauerVariant=variant,
                              samples=[dict(frequency=float(w), re=float(h.real), im=float(h.imag)) for w, h in zip(frequencies, response)]))
path = Path(__file__).resolve().parents[1] / 'src/lib/fixtures/small-ripple-reference.json'
path.write_text(json.dumps(dict(source=f'SciPy {scipy.__version__}, independent ellipap/freqs_zpk references, normalized passband edge 1.', cases=cases), indent=2) + '\n')
