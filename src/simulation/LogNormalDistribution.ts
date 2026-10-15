import { QuantileDataset, QuantilePoint } from "../core/types.js";
import { SyntheticDistribution } from "./SyntheticDistribution.js";
import { erf, inverseNormalCdf, standardNormalCdf } from "./specialFunctions.js";

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
