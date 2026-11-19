import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";

// Global Type-I Pareto Lorenz curve: L(p) = 1 - (1 - p)^(1 - 1/alpha) for alpha > 1
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

    const tailExponent = 1 - 1 / this.alpha;
    return 1 - Math.pow(1 - clampedP, tailExponent);
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) {
      return 1 - 1 / this.alpha;
    }
    const safeRemainingPop = Math.max(1e-12, 1 - clampedP);
    const scaleFactor = 1 - 1 / this.alpha;
    return scaleFactor * Math.pow(safeRemainingPop, -1 / this.alpha);
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    const safeRemainingPop = Math.max(1e-12, 1 - clampedP);
    const scaleFactor = (this.alpha - 1) / (this.alpha * this.alpha);
    return scaleFactor * Math.pow(safeRemainingPop, -(this.alpha + 1) / this.alpha);
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

  // Estimates alpha from the upper interior knot via log(1 - L) / log(1 - p) = 1 - 1/alpha
  private estimateAlphaFromDataset(dataset: QuantileDataset): number {
    const knotCount = dataset.points.length;
    const refIndex = Math.max(1, Math.min(knotCount - 2, Math.floor(knotCount * 0.8)));
    const referenceKnot = dataset.points[refIndex];

    const popShare = referenceKnot.populationShare;
    const incShare = referenceKnot.incomeShare;

    if (incShare <= 0 || incShare >= 1) {
      return 2.0;
    }

    const logRemainingPop = Math.log(1 - popShare);
    const logRemainingInc = Math.log(1 - incShare);
    const logRatio = logRemainingInc / logRemainingPop;

    if (logRatio <= 0 || logRatio >= 1) {
      return 2.0;
    }

    const alphaEstimate = 1 / (1 - logRatio);
    return Math.max(1.05, alphaEstimate);
  }
}
