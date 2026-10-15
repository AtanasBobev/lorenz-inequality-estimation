// Error function erf(x) via rational approximation.
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return sign * y;
}

// Standard normal cumulative distribution function Phi(x).
export function standardNormalCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

// Inverse normal cumulative distribution function Phi^{-1}(p).
export function inverseNormalCdf(p: number): number {
  if (p <= 0.0) return -Infinity;
  if (p >= 1.0) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
    );
  }
}

// Log-gamma function via Lanczos approximation.
export function logGamma(z: number): number {
  const c = [
    57.15623566586292, -59.59796035547549, 14.136097974741746, -0.4919138160976202,
    0.00003399464998481189, 0.00004652362892704858, -0.00009837447530487956, 0.00015808870322437947,
    -0.00021013412297399777, 0.08333333333333333, 0.5772156649015329
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  const x = z - 1.0;
  let sum = c[10];
  for (let i = 0; i < 9; i++) {
    sum += c[i] / (x + i + 1);
  }

  const t = x + 4.65;
  return (x + 0.5) * Math.log(t) - t + 0.5 * Math.log(2 * Math.PI) + Math.log(sum);
}

export function gamma(z: number): number {
  return Math.exp(logGamma(z));
}

// Regularized incomplete beta function I_x(a, b) via Lentz continued fractions.
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;

  if (x > (a + 1.0) / (a + b + 2.0)) {
    return 1.0 - regularizedIncompleteBeta(b, a, 1.0 - x);
  }

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1.0 - x) * b - lbeta) / a;

  let f = 1.0;
  let c = 1.0;
  let d = 0.0;
  const tiny = 1e-30;

  for (let m = 1; m <= 200; m++) {
    let numerator: number;
    if (m % 2 === 0) {
      const k = m / 2;
      numerator = (k * (b - k) * x) / ((a + 2 * k - 1) * (a + 2 * k));
    } else {
      const k = (m - 1) / 2;
      numerator = -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1));
    }

    d = 1.0 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1.0 / d;

    c = 1.0 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;

    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1.0) < 1e-12) {
      break;
    }
  }

  return Math.min(1.0, Math.max(0.0, front * (1.0 / f)));
}
