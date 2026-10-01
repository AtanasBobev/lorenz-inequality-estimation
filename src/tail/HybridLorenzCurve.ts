import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";
import { PchipLorenzCurve } from "../interpolation/PchipLorenzCurve.js";

export interface HybridOptions {
  readonly splicePoint?: number;
  readonly bodyModel?: LorenzModel;
  readonly tailAlpha?: number;
}

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

    const t = (1 - clampedP) / (1 - this.splicePoint);
    const exponent = 1 - 1 / this.tailAlpha;
    return 1 - (1 - this.lSplice) * Math.pow(t, exponent);
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= 0) {
      return this.bodyModel.derivative(0);
    }

    if (clampedP <= this.splicePoint) {
      return this.bodyModel.derivative(clampedP);
    }

    if (clampedP >= 1 - 1e-12) {
      const t = 1e-12 / (1 - this.splicePoint);
      const factor = ((1 - this.lSplice) / (1 - this.splicePoint)) * (1 - 1 / this.tailAlpha);
      return factor * Math.pow(t, -1 / this.tailAlpha);
    }

    const t = (1 - clampedP) / (1 - this.splicePoint);
    const factor = ((1 - this.lSplice) / (1 - this.splicePoint)) * (1 - 1 / this.tailAlpha);
    return factor * Math.pow(t, -1 / this.tailAlpha);
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    if (clampedP <= this.splicePoint) {
      return this.bodyModel.secondDerivative(clampedP);
    }

    const denom = Math.pow(1 - this.splicePoint, 2);
    const factor =
      ((1 - this.lSplice) / denom) * ((this.tailAlpha - 1) / (this.tailAlpha * this.tailAlpha));

    if (clampedP >= 1 - 1e-12) {
      const t = 1e-12 / (1 - this.splicePoint);
      return factor * Math.pow(t, -(this.tailAlpha + 1) / this.tailAlpha);
    }

    const t = (1 - clampedP) / (1 - this.splicePoint);
    return factor * Math.pow(t, -(this.tailAlpha + 1) / this.tailAlpha);
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
    const remainingP = 1 - this.splicePoint;
    const remainingL = 1 - this.lSplice;
    const factor = (this.tailAlpha * remainingL) / (2 * this.tailAlpha - 1);
    return remainingP * (1 - factor);
  }

  public analyticalTotalArea(bodySubintervals: number = 200): number {
    const n = bodySubintervals % 2 === 0 ? bodySubintervals : bodySubintervals + 1;
    const h = this.splicePoint / n;

    let bodySum = this.bodyModel.evaluate(0) + this.bodyModel.evaluate(this.splicePoint);
    for (let i = 1; i < n; i++) {
      const p = i * h;
      bodySum += (i % 2 === 1 ? 4 : 2) * this.bodyModel.evaluate(p);
    }
    const bodyArea = (bodySum * h) / 3;

    return bodyArea + this.analyticalTailArea();
  }

  public analyticalGini(bodySubintervals: number = 200): number {
    const area = this.analyticalTotalArea(bodySubintervals);
    return 1 - 2 * area;
  }

  private selectDefaultSplicePoint(): number {
    const n = this.points.length;
    if (n >= 4) {
      return this.points[n - 2].populationShare;
    }
    return 0.8;
  }

  private computeAnalyticalAlpha(pStar: number, lStar: number, dStar: number): number {
    const remainingP = 1 - pStar;
    const remainingL = 1 - lStar;

    if (remainingP <= 0 || remainingL <= 0) {
      return 2.0;
    }

    const secantSlope = remainingL / remainingP;
    const denominator = remainingL - remainingP * dStar;

    if (denominator <= 1e-7 || dStar >= secantSlope) {
      const targetDerivative = 0.92 * secantSlope;
      const safeDenominator = remainingL - remainingP * targetDerivative;
      return Math.max(1.05, remainingL / safeDenominator);
    }

    const alpha = remainingL / denominator;
    return Math.max(1.05, alpha);
  }
}
