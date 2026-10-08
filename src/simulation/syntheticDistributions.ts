import { QuantileDataset, QuantilePoint } from "../core/types.js";

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

  // Use symmetry relation when x > (a + 1) / (a + b + 2) for rapid convergence
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

export interface SyntheticDistribution {
  readonly name: string;
  readonly theoreticalGini: number;
  evaluateLorenz(p: number): number;
  sampleQuantiles(k: number, meanIncome?: number): QuantileDataset;
}

// Log-normal distribution with analytical Lorenz curve and Gini index.
export class LogNormalDistribution implements SyntheticDistribution {
  public readonly name: string;
  public readonly sigma: number;
  public readonly mu: number;
  public readonly theoreticalGini: number;

  constructor(sigma: number = 0.8, mu: number = 10.0) {
    if (sigma <= 0) {
      throw new Error(`Scale parameter sigma must be positive, received ${sigma}.`);
    }
    this.sigma = sigma;
    this.mu = mu;
    this.name = `Log-Normal (sigma = ${sigma}, mu = ${mu})`;
    this.theoreticalGini = erf(sigma / 2);
  }

  public evaluateLorenz(p: number): number {
    if (p <= 0.0) return 0.0;
    if (p >= 1.0) return 1.0;
    const inv = inverseNormalCdf(p);
    return standardNormalCdf(inv - this.sigma);
  }

  public sampleQuantiles(k: number, meanIncome: number = 50000): QuantileDataset {
    if (k < 2) {
      throw new Error(`Subinterval count k must be at least 2, received ${k}.`);
    }

    const points: QuantilePoint[] = [{ populationShare: 0.0, incomeShare: 0.0 }];
    for (let i = 1; i < k; i++) {
      const p = i / k;
      const l = this.evaluateLorenz(p);
      points.push({ populationShare: p, incomeShare: l });
    }
    points.push({ populationShare: 1.0, incomeShare: 1.0 });

    return {
      meanIncome,
      points
    };
  }
}

// Singh-Maddala (Burr XII) distribution with analytical Lorenz curve.
export class SinghMaddalaDistribution implements SyntheticDistribution {
  public readonly name: string;
  public readonly a: number;
  public readonly q: number;
  public readonly theoreticalGini: number;

  constructor(a: number = 2.8, q: number = 1.7) {
    if (a * q <= 1.0) {
      throw new Error(`Product a * q must be strictly greater than 1, received ${a * q}.`);
    }
    this.a = a;
    this.q = q;
    this.name = `Singh-Maddala (a = ${a}, q = ${q})`;

    const numerator = Math.exp(logGamma(q) + logGamma(2 * q - 1 / a));
    const denominator = Math.exp(logGamma(q - 1 / a) + logGamma(2 * q));
    this.theoreticalGini = 1.0 - numerator / denominator;
  }

  public evaluateLorenz(p: number): number {
    if (p <= 0.0) return 0.0;
    if (p >= 1.0) return 1.0;

    const u = 1.0 - Math.pow(1.0 - p, 1.0 / this.q);
    return regularizedIncompleteBeta(1.0 + 1.0 / this.a, this.q - 1.0 / this.a, u);
  }

  public sampleQuantiles(k: number, meanIncome: number = 50000): QuantileDataset {
    const points: QuantilePoint[] = [{ populationShare: 0.0, incomeShare: 0.0 }];
    for (let i = 1; i < k; i++) {
      const p = i / k;
      points.push({ populationShare: p, incomeShare: this.evaluateLorenz(p) });
    }
    points.push({ populationShare: 1.0, incomeShare: 1.0 });

    return {
      meanIncome,
      points
    };
  }
}

// Dagum (Burr III) distribution with analytical Lorenz curve.
export class DagumDistribution implements SyntheticDistribution {
  public readonly name: string;
  public readonly a: number;
  public readonly p0: number;
  public readonly theoreticalGini: number;

  constructor(a: number = 3.5, p0: number = 0.7) {
    if (a <= 1.0) {
      throw new Error(`Parameter a must be strictly greater than 1, received ${a}.`);
    }
    this.a = a;
    this.p0 = p0;
    this.name = `Dagum (a = ${a}, p0 = ${p0})`;

    const numerator = Math.exp(logGamma(p0) + logGamma(2 * p0 + 1 / a));
    const denominator = Math.exp(logGamma(p0 + 1 / a) + logGamma(2 * p0));
    this.theoreticalGini = numerator / denominator - 1.0;
  }

  public evaluateLorenz(p: number): number {
    if (p <= 0.0) return 0.0;
    if (p >= 1.0) return 1.0;

    const u = Math.pow(p, 1.0 / this.p0);
    return regularizedIncompleteBeta(this.p0 + 1.0 / this.a, 1.0 - 1.0 / this.a, u);
  }

  public sampleQuantiles(k: number, meanIncome: number = 50000): QuantileDataset {
    const points: QuantilePoint[] = [{ populationShare: 0.0, incomeShare: 0.0 }];
    for (let i = 1; i < k; i++) {
      const p = i / k;
      points.push({ populationShare: p, incomeShare: this.evaluateLorenz(p) });
    }
    points.push({ populationShare: 1.0, incomeShare: 1.0 });

    return {
      meanIncome,
      points
    };
  }
}
