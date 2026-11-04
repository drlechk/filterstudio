"""Regenerate Bessel/Legendre LC prototypes and independent response fixtures.

Optional development tool: numpy==2.4.6, scipy==1.17.1, mpmath==1.3.0.
Run from any directory; no Python dependency at runtime or during npm test/build.

All polynomial coefficients are ascending. Fraction arithmetic constructs the
reverse Bessel polynomial and Papoulis loss polynomial exactly. Spectral factors
and Cauer continued-fraction extraction use 120 decimal digits before rounding
the final LC values to binary64. No published component tables are copied.

Bessel normalization: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.besselap.html
Papoulis definition: https://www.radioeng.cz/fulltexts/2021/21_03_0569_0575.pdf
Element extraction: https://eng.libretexts.org/Courses/Fontys_University_of_Applied_Sciences/Telecommunications/04%3A_Filters/4.06%3A_Element_Extraction
"""

import json
from pathlib import Path
import numpy as np
import mpmath as mp
from fractions import Fraction as F
from math import factorial
from scipy.signal import besselap, freqs_zpk
from scipy.special import eval_legendre, roots_legendre
mp.mp.dps=120

def add(a,b): return [(a[i] if i<len(a) else 0)+(b[i] if i<len(b) else 0) for i in range(max(len(a),len(b)))]
def mul(a,b):
    c=[0]*(len(a)+len(b)-1)
    for i,v in enumerate(a):
        for j,w in enumerate(b): c[i+j]+=v*w
    return c

def legendre(n):
    """Integrate a squared Legendre sum; the even case uses weight (1+t).

    Odd n=2k+1: all P_i, weights 2i+1. Even n=2k+2: only i of
    the same parity as k. Substitute t=2*omega^2-1 and normalize L_n(1)=1.
    """
    k=(n-1)//2 if n%2 else (n-2)//2
    ps=[[F(1)],[F(0),F(1)]]
    for i in range(2,k+1): ps.append([v/i for v in add([0]+[v*(2*i-1) for v in ps[-1]],[-v*(i-1) for v in ps[-2]])])
    u=[F(0)]
    for i in range(k+1):
        if n%2 or i%2==k%2: u=add(u,[v*(2*i+1) for v in ps[i]])
    d=mul(u,u)
    if n%2==0: d=mul(d,[1,1])
    integral=[F(0)]+[v/(i+1) for i,v in enumerate(d)]
    # Substitute t=2x-1; subtract the value at -1.
    p=[F(0)]
    for v in integral[::-1]: p=add(mul(p,[-1,2]),[v])
    while p[-1]==0: p.pop()
    p[0]=0
    total=sum(p)
    return [v/total for v in p]

def roots(p):
    """Use binary64 seeds only; Aberth refinement and reconstruction verify them."""
    if len(p)==1:return []
    p=[mp.mpf(v) for v in p]
    initial=np.roots([float(v) for v in p[::-1]])
    deriv=[i*p[i] for i in range(1,len(p))]
    r=[mp.mpc(z) for z in initial]
    for iteration in range(100):
        new=[]
        for i,z in enumerate(r):
            delta=mp.polyval(p[::-1],z)/mp.polyval(deriv[::-1],z)
            delta/=1-delta*sum(1/(z-t) for j,t in enumerate(r) if i!=j)
            new.append(z-delta)
        error=max(abs(a-b) for a,b in zip(r,new));r=new
        if error<mp.mpf('1e-100'):break
    else: raise ValueError('root convergence')
    reconstructed=[mp.mpc(1)]
    for z in r: reconstructed=mul(reconstructed,[-z,1])
    assert max(abs(a/p[-1]-b) for a,b in zip(p,reconstructed)) / max(abs(a/p[-1]) for a in p)<mp.mpf('1e-85'), 'Root reconstruction failed'
    return r

def mpf(x):return mp.mpf(x.numerator)/x.denominator if isinstance(x,F) else mp.mpf(x)
def stable_roots(loss):
    # loss is a polynomial in omega^2: substitute -s^2 and keep Re(s)<0.
    r=[]
    for x in roots(loss):
        z=mp.sqrt(-x)
        r.append(-z if z.real>0 else z)
    return r

def poly_roots(r):
    p=[mp.mpc(1)]
    for z in r: p=mul(p,[-z,1])
    assert max(abs(v.imag) for v in p)<mp.mpf('1e-60')
    return [v.real for v in p]

def prototype(family,n):
    if family=='bessel':
        raw=[F(factorial(2*n-k),2**(n-k)*factorial(n-k)*factorial(k)) for k in range(n+1)]
        raw=[v/raw[0] for v in raw]
        energy=mul(raw,[v*(-1)**i for i,v in enumerate(raw)])
        loss=[mpf(v*(-1)**i) for i,v in enumerate(energy[::2])]; loss[0]=0
        D=list(map(mpf,raw))
        cutoff=mp.findroot(lambda w:mp.polyval(loss[::-1],w*w)-1,(mp.sqrt(n),mp.sqrt(n+1)))
        poles=roots(D)
    else:
        loss=list(map(mpf,legendre(n))); cutoff=mp.mpf(1)
        poles=stable_roots([1]+loss[1:])
        D=poly_roots(poles); D=[v/D[0] for v in D]
    multiplicity=next(i for i,x in enumerate(loss) if x)
    R=poly_roots([mp.mpc(0)]*multiplicity+stable_roots(loss[multiplicity:]))
    R=[v*D[-1] for v in R]
    product=mul(R,[v*(-1)**i for i,v in enumerate(R)])
    desired=[mp.mpf(0)]*(2*n+1)
    for i,v in enumerate(loss): desired[2*i]=v*(-1)**i
    assert max(abs(a-b) for a,b in zip(product,desired))<mp.mpf('1e-60')
    # Z_in=(D+R)/(D-R), R(s)R(-s)=D(s)D(-s)-1. Choosing the left-half-plane
    # reflection zeros gives a positive ladder starting with a series inductor.
    top=add(D,R); bottom=add(D,[-v for v in R]); bottom.pop()
    g=[]
    for i in range(n):
        value=top[-1]/bottom[-1]
        rest=add(top,[0]+[-value*v for v in bottom]);rest.pop()
        if i<n-1:
            # Each quotient is g*s with no constant term until the final load.
            assert abs(rest[-1])<mp.mpf("1e-55")
            rest.pop()
        top,bottom=bottom,rest
        g.append(value*cutoff)
    termination=top[0]/bottom[0]
    assert abs(termination-1)<mp.mpf('1e-55'),termination
    assert all(v>0 for v in g),g
    poles=sorted(poles,key=lambda z:(float(z.real),float(z.imag)))
    return dict(g=[float(v) for v in g],
                poles=[[float(z.real/cutoff),0 if abs(z.imag)<mp.mpf('1e-60') else float(z.imag/cutoff)] for z in poles],
                loss=[float(v*cutoff**(2*i)) for i,v in enumerate(loss)],alpha=float(cutoff))

def ladder_response(values, omega):
    a,b,c,d=1,0,0,1
    for i,value in enumerate(values):
        branch=1j*omega*value
        if i%2: a,c=a+b*branch,c+d*branch
        else: b,d=b+a*branch,d+c*branch
    return 2/(a+b+c+d)

def legendre_power(n, omega):
    """Independent evaluation: Gaussian quadrature of the defining integral.

    No expanded coefficients, extracted LC values or spectral roots are used.
    A 32-point rule integrates the degree <=19 integrand exactly in arithmetic.
    """
    k=(n-1)//2 if n%2 else (n-2)//2
    nodes,weights=roots_legendre(32)
    t=omega**2*(nodes+1)-1
    u=sum((2*i+1)*eval_legendre(i,t) for i in range(k+1) if n%2 or i%2==k%2)
    integrand=u*u if n%2 else (t+1)*u*u
    norm=2*(k+1)**2 if n%2 else (k+1)*(k+2)
    loss=omega**2*np.dot(weights,integrand)/norm
    return 1/(1+loss)

if __name__=='__main__':
    result={}
    cases=[]
    frequencies=np.array([0,.01,.1,.25,.5,.75,.9,.99,1,1.01,1.1,1.5,2,5,10,100])
    for family in ['bessel','legendre']:
        result[family]=[]
        for n in range(1,21):
            p=prototype(family,n)
            result[family].append(p)
            if family=='bessel':
                z,poles,k=besselap(n,norm='mag')
                _,response=freqs_zpk(z,poles,k,frequencies)
                samples=[dict(frequency=float(w),re=float(h.real),im=float(h.imag)) for w,h in zip(frequencies,response)]
            else:
                samples=[dict(frequency=float(w),power=float(legendre_power(n,w))) for w in frequencies]
            for sample in samples:
                actual=ladder_response(p['g'],sample['frequency'])
                if family=='bessel':
                    expected=complex(sample['re'],sample['im'])
                    assert abs(actual-expected)<1e-10
                else:
                    assert abs(abs(actual)**2-sample['power'])<1e-10
            cases.append(dict(family=family,order=n,samples=samples))
    root=Path(__file__).resolve().parents[1]/'src/lib'
    (root/'monotonic-prototypes.json').write_text(json.dumps(result,indent=2)+'\n')
    (root/'fixtures/monotonic-reference.json').write_text(json.dumps(dict(
        source='Bessel: SciPy 1.17.1 besselap(norm="mag") / freqs_zpk. Legendre: independent 32-point Gaussian quadrature of the defining squared-Legendre integral (scipy.special); no LC values or spectral factors used. Frequency normalized to half-power cutoff 1 rad/s.',
        cases=cases),indent=2)+'\n')
    print('Generated and verified 40 positive LC ladders and 640 independent response samples.')
