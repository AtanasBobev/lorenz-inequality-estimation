import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";

export class ParetoLorenzCurve extends LorenzModel {
  private readonly alpha: number;

  constructor(dataset: QuantileDataset, alpha?: number) {
    super(dataset);

    if (alpha !== undefined) {
      if (alpha <= 1) {
        throw new Error(
          `Pareto alpha parameter must be strictly greater than 1, received ${alpha}.`
        );
      }
      this.alpha = alpha;
    } else {
      this.alpha = this.estimateAlphaFromDataset(dataset);
    }
  }

  public evaluate(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) return 0;
    if (clampedP >= 1) return 1;

    const exponent = 1 - 1 / this.alpha;
    return 1 - Math.pow(1 - clampedP, exponent);
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) {
      return 1 - 1 / this.alpha;
    }
    if (clampedP >= 1 - 1e-12) {
      return (1 - 1 / this.alpha) * Math.pow(1e-12, -1 / this.alpha);
    }

    const factor = 1 - 1 / this.alpha;
    return factor * Math.pow(1 - clampedP, -1 / this.alpha);
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP >= 1 - 1e-12) {
      const factor = (this.alpha - 1) / (this.alpha * this.alpha);
      return factor * Math.pow(1e-12, -(this.alpha + 1) / this.alpha);
    }

    const factor = (this.alpha - 1) / (this.alpha * this.alpha);
    return factor * Math.pow(1 - clampedP, -(this.alpha + 1) / this.alpha);
  }

  public getAlpha(): number {
    return this.alpha;
  }

  public analyticalGini(): number {
    return 1 / (2 * this.alpha - 1);
  }

  public analyticalAreaUnderCurve(): number {
    return (this.alpha - 1) / (2 * this.alpha - 1);
  }

  private estimateAlphaFromDataset(dataset: QuantileDataset): number {
    const n = dataset.points.length;
    const refIndex = Math.max(1, Math.min(n - 2, Math.floor(n * 0.8)));
    const pt = dataset.points[refIndex];

    const p = pt.populationShare;
    const l = pt.incomeShare;

    if (p <= 0 || p >= 1 || l <= 0 || l >= 1) {
      return 2.0;
    }

    const logP = Math.log(1 - p);
    const logL = Math.log(1 - l);
    const ratio = logL / logP;

    if (ratio <= 0 || ratio >= 1) {
      return 2.0;
    }

    const alphaEst = 1 / (1 - ratio);
    return Math.max(1.05, alphaEst);
  }
}
