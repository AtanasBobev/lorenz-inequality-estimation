import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";

export interface KakwaniPodderParameters {
  readonly a: number;
  readonly alpha: number;
  readonly beta: number;
  readonly rSquared: number;
}

// Parametric Lorenz specification of Kakwani & Podder (1976): L(p) = p - a * p^alpha * (1 - p)^beta
// Estimated via log-linear OLS on interior knots: ln(p - L) = ln(a) + alpha * ln(p) + beta * ln(1 - p)
// TODO: Add Generalized Beta of the Second Kind (GB2) parametric curve fitting for comparison
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
    const egalitarianGap = a * Math.pow(clampedP, alpha) * Math.pow(1 - clampedP, beta);
    return Math.max(0, Math.min(1, clampedP - egalitarianGap));
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 1e-6) return 0;
    if (clampedP >= 1 - 1e-6) {
      return this.computeDerivativeAt(1 - 1e-6);
    }
    return this.computeDerivativeAt(clampedP);
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 1e-4 || clampedP >= 1 - 1e-4) return 0;

    const { a, alpha, beta } = this.params;
    const popShare = clampedP;
    const complementPop = 1 - clampedP;

    const term1 =
      alpha * (alpha - 1) * Math.pow(popShare, alpha - 2) * Math.pow(complementPop, beta);
    const term2 =
      2 * alpha * beta * Math.pow(popShare, alpha - 1) * Math.pow(complementPop, beta - 1);
    const term3 = beta * (beta - 1) * Math.pow(popShare, alpha) * Math.pow(complementPop, beta - 2);

    return -a * (term1 - term2 + term3);
  }

  private computeDerivativeAt(p: number): number {
    const { a, alpha, beta } = this.params;
    const complementPop = 1 - p;
    const term1 = alpha * Math.pow(p, alpha - 1) * Math.pow(complementPop, beta);
    const term2 = beta * Math.pow(p, alpha) * Math.pow(complementPop, beta - 1);
    return Math.max(0, 1 - a * (term1 - term2));
  }

  private fitParameters(): KakwaniPodderParameters {
    const interiorPoints = this.points.filter(
      (knot) =>
        knot.populationShare > 1e-6 &&
        knot.populationShare < 1 - 1e-6 &&
        knot.populationShare > knot.incomeShare
    );

    if (interiorPoints.length < 3) {
      return { a: 1.0, alpha: 0.8, beta: 0.8, rSquared: 0.95 };
    }

    const sampleCount = interiorPoints.length;
    const logGapValues: number[] = [];
    const logPopValues: number[] = [];
    const logComplementValues: number[] = [];

    for (const knot of interiorPoints) {
      const popShare = knot.populationShare;
      const incShare = knot.incomeShare;
      logGapValues.push(Math.log(popShare - incShare));
      logPopValues.push(Math.log(popShare));
      logComplementValues.push(Math.log(1 - popShare));
    }

    // Build the 3x3 normal equation sums for [1, ln(p), ln(1-p)]
    const s00 = sampleCount;
    let s01 = 0;
    let s02 = 0;
    let s11 = 0;
    let s12 = 0;
    let s22 = 0;
    let sy = 0;
    let s1y = 0;
    let s2y = 0;

    for (let i = 0; i < sampleCount; i++) {
      const logP = logPopValues[i];
      const logQ = logComplementValues[i];
      const logGap = logGapValues[i];

      s01 += logP;
      s02 += logQ;
      s11 += logP * logP;
      s12 += logP * logQ;
      s22 += logQ * logQ;

      sy += logGap;
      s1y += logP * logGap;
      s2y += logQ * logGap;
    }

    // Solve 3x3 normal equations via Cramer's rule
    const determinant =
      s00 * (s11 * s22 - s12 * s12) - s01 * (s01 * s22 - s12 * s02) + s02 * (s01 * s12 - s11 * s02);

    if (Math.abs(determinant) < 1e-12) {
      return { a: 1.0, alpha: 0.8, beta: 0.8, rSquared: 0.9 };
    }

    const detIntercept =
      sy * (s11 * s22 - s12 * s12) - s01 * (s1y * s22 - s12 * s2y) + s02 * (s1y * s12 - s11 * s2y);

    const detAlpha =
      s00 * (s1y * s22 - s12 * s2y) - sy * (s01 * s22 - s12 * s02) + s02 * (s01 * s2y - s1y * s02);

    const detBeta =
      s00 * (s11 * s2y - s1y * s12) - s01 * (s01 * s2y - s1y * s02) + sy * (s01 * s12 - s11 * s02);

    const intercept = detIntercept / determinant;
    const alpha = Math.max(0.1, Math.min(2.5, detAlpha / determinant));
    const beta = Math.max(0.1, Math.min(2.5, detBeta / determinant));
    const a = Math.max(0.01, Math.min(5.0, Math.exp(intercept)));

    const meanLogGap = sy / sampleCount;
    let totalSumSquares = 0;
    let residualSumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const predictedLogGap = intercept + alpha * logPopValues[i] + beta * logComplementValues[i];
      totalSumSquares += Math.pow(logGapValues[i] - meanLogGap, 2);
      residualSumSquares += Math.pow(logGapValues[i] - predictedLogGap, 2);
    }
    const rSquared =
      totalSumSquares > 1e-12 ? Math.max(0, 1 - residualSumSquares / totalSumSquares) : 1.0;

    return { a, alpha, beta, rSquared };
  }
}
