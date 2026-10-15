import { QuantileDataset, QuantilePoint } from "../core/types.js";
import { SyntheticDistribution } from "./SyntheticDistribution.js";
import { logGamma, regularizedIncompleteBeta } from "./specialFunctions.js";

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
