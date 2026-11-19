// Error function erf(x) via rational approximation
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

// Standard normal cumulative distribution function Phi(x)
export function standardNormalCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

// Inverse normal cumulative distribution function Phi^{-1}(p)
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

// Log-gamma function via standard Lanczos approximation (g = 7, N = 9)
export function logGamma(z: number): number {
  if (z <= 0.0) {
    throw new Error(`Gamma function undefined for non-positive numbers (received ${z}).`);
  }

  const p = [
    0.9999999999998099, 676.5203681218851, -1259.139216722403, 771.3234287776531,
    -176.6150291621406, 12.50734327868691, -0.138571095836526, 9.984369578019572e-6,
    1.505632735149312e-7
  ];
  const g = 7;

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1.0 - z);
  }

  const x = z - 1.0;
  let aSum = p[0];
  for (let i = 1; i < p.length; i++) {
    aSum += p[i] / (x + i);
  }

  const t = x + g + 0.5;
  return 0.5 * Math.log(2.0 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(aSum);
}

export function gamma(z: number): number {
  return Math.exp(logGamma(z));
}

// Prevents division by zero in continued-fraction recurrences
export function clampTinyDenominator(value: number, minMagnitude: number = 1e-30): number {
  return Math.abs(value) < minMagnitude ? minMagnitude : value;
}

// Evaluate the continued fraction factor for the incomplete beta function (Lentz's method)
function betacf(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const convergenceTol = 1e-12;
  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;

  let cFactor = 1.0;
  let dFactor = 1.0 / clampTinyDenominator(1.0 - (qab * x) / qap);
  let fractionValue = dFactor;

  for (let m = 1; m <= maxIterations; m++) {
    const twoM = 2 * m;
    const evenCoeff = (m * (b - m) * x) / ((qam + twoM) * (a + twoM));
    dFactor = 1.0 / clampTinyDenominator(1.0 + evenCoeff * dFactor);
    cFactor = clampTinyDenominator(1.0 + evenCoeff / cFactor);
    fractionValue *= dFactor * cFactor;

    const oddCoeff = -((a + m) * (qab + m) * x) / ((a + twoM) * (qap + twoM));
    dFactor = 1.0 / clampTinyDenominator(1.0 + oddCoeff * dFactor);
    cFactor = clampTinyDenominator(1.0 + oddCoeff / cFactor);
    const stepDelta = dFactor * cFactor;
    fractionValue *= stepDelta;

    if (Math.abs(stepDelta - 1.0) < convergenceTol) {
      break;
    }
  }

  return fractionValue;
}

// Regularized incomplete beta function I_x(a, b)
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;

  // Use symmetry relation if x > (a + 1) / (a + b + 2)
  if (x > (a + 1.0) / (a + b + 2.0)) {
    return 1.0 - regularizedIncompleteBeta(b, a, 1.0 - x);
  }

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1.0 - x) * b - lbeta) / a;
  return Math.min(1.0, Math.max(0.0, front * betacf(a, b, x)));
}
