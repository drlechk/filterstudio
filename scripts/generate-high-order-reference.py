"""Independent complex analog references for high-order LC synthesis tests.

Optional development tool; numpy==2.4.6 and scipy==1.17.1. No runtime dependency.
Use pole products (freqs_zpk), not ill-conditioned expanded denominators.
https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.buttap.html
https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.cheb1ap.html
"""
import json
from pathlib import Path
import numpy as np
from scipy.signal import buttap, cheb1ap, freqs_zpk

cases=[]
for family in ['butterworth','chebyshev']:
    for order in [21,50,99,100]:
        for ripple in ([.5] if family=='butterworth' else [.1,.5,3]):
            z,p,k=buttap(order) if family=='butterworth' else cheb1ap(order,ripple)
            # Include high-order ripple extrema and the sharp transition region.
            w=np.unique(np.concatenate(([0,.01,.1,.5,2,10], np.linspace(.9,1.1,21), np.cos(np.arange(order//2+1)*np.pi/order))))
            _,h=freqs_zpk(z,p,k,w)
            cases.append(dict(family=family,order=order,ripple=ripple,samples=[dict(frequency=float(f),re=float(v.real),im=float(v.imag)) for f,v in zip(w,h)]))
path=Path(__file__).resolve().parents[1]/'src/lib/fixtures/high-order-reference.json'
path.write_text(json.dumps(dict(source='SciPy 1.17.1 buttap / cheb1ap and freqs_zpk (analog pole products); normalized reference frequency 1 rad/s. Independent of the LC synthesis.', cases=cases),indent=2)+'\n')
print(f'Generated {len(cases)} independent high-order references.')
