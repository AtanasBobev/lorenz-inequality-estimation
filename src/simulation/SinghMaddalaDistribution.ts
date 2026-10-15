import { QuantileDataset, QuantilePoint } from "../core/types.js";
import { SyntheticDistribution } from "./SyntheticDistribution.js";
import { logGamma, regularizedIncompleteBeta } from "./specialFunctions.js";

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
