import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";

export interface KakwaniPodderParameters {
  readonly a: number;
  readonly alpha: number;
  readonly beta: number;
  readonly rSquared: number;
}

// Classical parametric Lorenz curve model proposed by Kakwani & Podder (1976):
// L(p) = p - a * p^alpha * (1 - p)^beta
// Solved via OLS in log-linear coordinate space:
// ln(p - L) = ln(a) + alpha * ln(p) + beta * ln(1 - p)
export class KakwaniPodderCurve extends LorenzModel {
  public readonly params: KakwaniPodderParameters;

  constructor(dataset: QuantileDataset) {
    super(dataset);
    this.params = this.fitParameters();
  }

  public evaluate(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) return 0;
    if (clampedP >= 1) return 1;

    const { a, alpha, beta } = this.params;
    const deviation = a * Math.pow(clampedP, alpha) * Math.pow(1 - clampedP, beta);
    return Math.max(0, Math.min(1, clampedP - deviation));
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 1e-6) return 0;
    if (clampedP >= 1 - 1e-6) {
      // Near p=1, polynomial decay limits derivative
      const pNear = 1 - 1e-6;
      return this.computeDerivativeAt(pNear);
    }
    return this.computeDerivativeAt(clampedP);
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 1e-4 || clampedP >= 1 - 1e-4) return 0;

    const { a, alpha, beta } = this.params;
    const pVal = clampedP;
    const qVal = 1 - clampedP;

    // L''(p) = -a * [ alpha*(alpha-1)*p^(alpha-2)*q^beta - 2*alpha*beta*p^(alpha-1)*q^(beta-1) + beta*(beta-1)*p^alpha*q^(beta-2) ]
    const term1 = alpha * (alpha - 1) * Math.pow(pVal, alpha - 2) * Math.pow(qVal, beta);
    const term2 = 2 * alpha * beta * Math.pow(pVal, alpha - 1) * Math.pow(qVal, beta - 1);
    const term3 = beta * (beta - 1) * Math.pow(pVal, alpha) * Math.pow(qVal, beta - 2);

    return -a * (term1 - term2 + term3);
  }

  private computeDerivativeAt(p: number): number {
    const { a, alpha, beta } = this.params;
    const q = 1 - p;
    // L'(p) = 1 - a * [ alpha * p^(alpha-1) * q^beta - beta * p^alpha * q^(beta-1) ]
    const term1 = alpha * Math.pow(p, alpha - 1) * Math.pow(q, beta);
    const term2 = beta * Math.pow(p, alpha) * Math.pow(q, beta - 1);
    return Math.max(0, 1 - a * (term1 - term2));
  }

  private fitParameters(): KakwaniPodderParameters {
    // Collect interior points with p > 0, p < 1, and p > L
    const validPoints = this.points.filter(
      (pt) =>
        pt.populationShare > 1e-6 &&
        pt.populationShare < 1 - 1e-6 &&
        pt.populationShare > pt.incomeShare
    );

    if (validPoints.length < 3) {
      // Fallback default parameters if insufficient interior points
      return { a: 1.0, alpha: 0.8, beta: 0.8, rSquared: 0.95 };
    }

    const n = validPoints.length;
    // Model: y = b0 + b1*x1 + b2*x2
    // y = ln(p - L), x1 = ln(p), x2 = ln(1 - p)
    const Y: number[] = [];
    const X1: number[] = [];
    const X2: number[] = [];

    for (const pt of validPoints) {
      const p = pt.populationShare;
      const L = pt.incomeShare;
      Y.push(Math.log(p - L));
      X1.push(Math.log(p));
      X2.push(Math.log(1 - p));
    }

    // Normal equations matrix 3x3
    const s00 = n;
    let s01 = 0,
      s02 = 0;
    let s11 = 0,
      s12 = 0,
      s22 = 0;
    let sy = 0,
      s1y = 0,
      s2y = 0;

    for (let i = 0; i < n; i++) {
      const x1 = X1[i];
      const x2 = X2[i];
      const y = Y[i];

      s01 += x1;
      s02 += x2;
      s11 += x1 * x1;
      s12 += x1 * x2;
      s22 += x2 * x2;

      sy += y;
      s1y += x1 * y;
      s2y += x2 * y;
    }

    // Solve 3x3 linear system A * b = rhs using Cramer's rule
    const det =
      s00 * (s11 * s22 - s12 * s12) - s01 * (s01 * s22 - s12 * s02) + s02 * (s01 * s12 - s11 * s02);

    if (Math.abs(det) < 1e-12) {
      return { a: 1.0, alpha: 0.8, beta: 0.8, rSquared: 0.9 };
    }

    const det0 =
      sy * (s11 * s22 - s12 * s12) - s01 * (s1y * s22 - s12 * s2y) + s02 * (s1y * s12 - s11 * s2y);

    const det1 =
      s00 * (s1y * s22 - s12 * s2y) - sy * (s01 * s22 - s12 * s02) + s02 * (s01 * s2y - s1y * s02);

    const det2 =
      s00 * (s11 * s2y - s1y * s12) - s01 * (s01 * s2y - s1y * s02) + sy * (s01 * s12 - s11 * s02);

    const b0 = det0 / det;
    const alpha = Math.max(0.1, Math.min(2.5, det1 / det));
    const beta = Math.max(0.1, Math.min(2.5, det2 / det));
    const a = Math.max(0.01, Math.min(5.0, Math.exp(b0)));

    // Compute R-squared
    const yMean = sy / n;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const yPred = b0 + alpha * X1[i] + beta * X2[i];
      ssTot += Math.pow(Y[i] - yMean, 2);
      ssRes += Math.pow(Y[i] - yPred, 2);
    }
    const rSquared = ssTot > 1e-12 ? Math.max(0, 1 - ssRes / ssTot) : 1.0;

    return { a, alpha, beta, rSquared };
  }
}
