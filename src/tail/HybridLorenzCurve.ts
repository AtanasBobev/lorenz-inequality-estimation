import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";
import { PchipLorenzCurve } from "../interpolation/PchipLorenzCurve.js";

export interface HybridOptions {
  readonly splicePoint?: number;
  readonly bodyModel?: LorenzModel;
  readonly tailAlpha?: number;
}

// Splice a non-parametric spline body on [0, p*] onto an analytical Pareto power-law tail on (p*, 1]
// Calibrate tail exponent alpha in closed form so both level L(p*) and marginal income L'(p*) match at p*
// TODO: Support Generalized Pareto Curves (GPC) where tail exponent alpha(p) varies across the top decile
export class HybridLorenzCurve extends LorenzModel {
  private readonly bodyModel: LorenzModel;
  private readonly splicePoint: number;
  private readonly tailAlpha: number;
  private readonly lSplice: number;
  private readonly dSplice: number;

  constructor(dataset: QuantileDataset, options: HybridOptions = {}) {
    super(dataset);

    this.bodyModel = options.bodyModel ?? new PchipLorenzCurve(dataset);

    const defaultSplice = this.selectDefaultSplicePoint();
    const candidateSplice = options.splicePoint ?? defaultSplice;

    if (candidateSplice <= 0 || candidateSplice >= 1) {
      throw new Error(
        `Splice point must be strictly between 0 and 1, received ${candidateSplice}.`
      );
    }
    this.splicePoint = candidateSplice;

    this.lSplice = this.bodyModel.evaluate(this.splicePoint);
    this.dSplice = this.bodyModel.derivative(this.splicePoint);

    if (options.tailAlpha !== undefined) {
      if (options.tailAlpha <= 1) {
        throw new Error(
          `Tail alpha must be strictly greater than 1, received ${options.tailAlpha}.`
        );
      }
      this.tailAlpha = options.tailAlpha;
    } else {
      this.tailAlpha = this.computeAnalyticalAlpha(this.splicePoint, this.lSplice, this.dSplice);
    }
  }

  public evaluate(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) return 0;
    if (clampedP >= 1) return 1;

    if (clampedP <= this.splicePoint) {
      return this.bodyModel.evaluate(clampedP);
    }

    const tailRatio = (1 - clampedP) / (1 - this.splicePoint);
    const tailExponent = 1 - 1 / this.tailAlpha;
    return 1 - (1 - this.lSplice) * Math.pow(tailRatio, tailExponent);
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) {
      return this.bodyModel.derivative(0);
    }

    if (clampedP <= this.splicePoint) {
      return this.bodyModel.derivative(clampedP);
    }

    const safeRemainingPop = Math.max(1e-12, 1 - clampedP);
    const tailRatio = safeRemainingPop / (1 - this.splicePoint);
    const scaleFactor = ((1 - this.lSplice) / (1 - this.splicePoint)) * (1 - 1 / this.tailAlpha);
    return scaleFactor * Math.pow(tailRatio, -1 / this.tailAlpha);
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= this.splicePoint) {
      return this.bodyModel.secondDerivative(clampedP);
    }

    const tailWidthSquared = Math.pow(1 - this.splicePoint, 2);
    const scaleFactor =
      ((1 - this.lSplice) / tailWidthSquared) *
      ((this.tailAlpha - 1) / (this.tailAlpha * this.tailAlpha));

    const safeRemainingPop = Math.max(1e-12, 1 - clampedP);
    const tailRatio = safeRemainingPop / (1 - this.splicePoint);
    return scaleFactor * Math.pow(tailRatio, -(this.tailAlpha + 1) / this.tailAlpha);
  }

  public getSplicePoint(): number {
    return this.splicePoint;
  }

  public getTailAlpha(): number {
    return this.tailAlpha;
  }

  public getBodyModel(): LorenzModel {
    return this.bodyModel;
  }

  public analyticalTailArea(): number {
    const remainingPop = 1 - this.splicePoint;
    const remainingIncome = 1 - this.lSplice;
    const paretoAreaFactor = (this.tailAlpha * remainingIncome) / (2 * this.tailAlpha - 1);
    return remainingPop * (1 - paretoAreaFactor);
  }

  public analyticalTotalArea(bodySubintervals: number = 200): number {
    const subintervalCount = bodySubintervals % 2 === 0 ? bodySubintervals : bodySubintervals + 1;
    const stepWidth = this.splicePoint / subintervalCount;

    let bodySum = this.bodyModel.evaluate(0) + this.bodyModel.evaluate(this.splicePoint);
    for (let i = 1; i < subintervalCount; i++) {
      const percentile = i * stepWidth;
      bodySum += (i % 2 === 1 ? 4 : 2) * this.bodyModel.evaluate(percentile);
    }
    const bodyArea = (bodySum * stepWidth) / 3;

    return bodyArea + this.analyticalTailArea();
  }

  public analyticalGini(bodySubintervals: number = 200): number {
    const totalArea = this.analyticalTotalArea(bodySubintervals);
    return 1 - 2 * totalArea;
  }

  private selectDefaultSplicePoint(): number {
    const knotCount = this.points.length;
    if (knotCount >= 4) {
      return this.points[knotCount - 2].populationShare;
    }
    return 0.8;
  }

  // Solve (1 - L*) / (1 - p*) * (1 - 1/alpha) = L'(p*) for alpha, clamping if L'(p*) >= secant slope
  private computeAnalyticalAlpha(pStar: number, lStar: number, dStar: number): number {
    const remainingPop = 1 - pStar;
    const remainingIncome = 1 - lStar;

    if (remainingIncome <= 0) {
      return 2.0;
    }

    const tailSecantSlope = remainingIncome / remainingPop;
    const alphaDenominator = remainingIncome - remainingPop * dStar;

    if (alphaDenominator <= 1e-7 || dStar >= tailSecantSlope) {
      const clampedDerivative = 0.92 * tailSecantSlope;
      const safeDenominator = remainingIncome - remainingPop * clampedDerivative;
      return Math.max(1.05, remainingIncome / safeDenominator);
    }

    const calibratedAlpha = remainingIncome / alphaDenominator;
    return Math.max(1.05, calibratedAlpha);
  }
}
