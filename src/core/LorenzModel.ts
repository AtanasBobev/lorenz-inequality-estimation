import { QuantileDataset, QuantilePoint } from "./types.js";

export abstract class LorenzModel {
  protected readonly dataset: QuantileDataset;
  protected readonly points: readonly QuantilePoint[];

  constructor(dataset: QuantileDataset) {
    this.validateDataset(dataset);
    this.dataset = dataset;
    this.points = dataset.points;
  }

  public abstract evaluate(p: number): number;
  public abstract derivative(p: number): number;
  public abstract secondDerivative(p: number): number;

  public quantileIncome(p: number): number {
    const clampedP = this.clampPopulation(p);
    return this.dataset.meanIncome * this.derivative(clampedP);
  }

  public topShare(topFraction: number): number {
    if (topFraction <= 0 || topFraction >= 1) {
      throw new Error(`Top fraction must be in (0, 1), received ${topFraction}.`);
    }
    return 1 - this.evaluate(1 - topFraction);
  }

  public isMonotonic(sampleCount: number = 200, tolerance: number = 1e-8): boolean {
    const stepSize = 1 / sampleCount;
    for (let i = 0; i <= sampleCount; i++) {
      const percentile = i * stepSize;
      if (this.derivative(percentile) < -tolerance) {
        return false;
      }
    }
    return true;
  }

  public isConvex(sampleCount: number = 200, tolerance: number = 1e-8): boolean {
    const stepSize = 1 / sampleCount;
    for (let i = 0; i <= sampleCount; i++) {
      const percentile = i * stepSize;
      if (this.secondDerivative(percentile) < -tolerance) {
        return false;
      }
    }
    return true;
  }

  public findConvexityViolations(sampleCount: number = 200, tolerance: number = 1e-8): number[] {
    const violations: number[] = [];
    const stepSize = 1 / sampleCount;
    for (let i = 0; i <= sampleCount; i++) {
      const percentile = i * stepSize;
      if (this.secondDerivative(percentile) < -tolerance) {
        violations.push(percentile);
      }
    }
    return violations;
  }

  protected clampPopulation(p: number): number {
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  // Binary search for the knot bracket [p_i, p_{i+1}) containing p
  protected findKnotInterval(p: number): number {
    const knotCount = this.points.length;
    if (p <= this.points[0].populationShare) {
      return 0;
    }
    if (p >= this.points[knotCount - 1].populationShare) {
      return knotCount - 2;
    }

    let lowerIdx = 0;
    let upperIdx = knotCount - 2;

    while (lowerIdx < upperIdx) {
      const midIdx = Math.floor((lowerIdx + upperIdx) / 2);
      if (p < this.points[midIdx].populationShare) {
        upperIdx = midIdx - 1;
      } else if (p >= this.points[midIdx + 1].populationShare) {
        lowerIdx = midIdx + 1;
      } else {
        return midIdx;
      }
    }

    return lowerIdx;
  }

  public getDataset(): QuantileDataset {
    return this.dataset;
  }

  // Ensure knots are anchored at (0,0) and (1,1) with strictly increasing p and non-decreasing L
  // TODO: Allow negative L(p) coordinates in the lower tail so we can fit net wealth datasets with household debt
  private validateDataset(dataset: QuantileDataset): void {
    if (!dataset.points || dataset.points.length < 2) {
      throw new Error("Quantile dataset must contain at least 2 points.");
    }
    if (dataset.meanIncome <= 0) {
      throw new Error(`Mean income must be positive, received ${dataset.meanIncome}.`);
    }

    const firstKnot = dataset.points[0];
    const lastKnot = dataset.points[dataset.points.length - 1];

    if (Math.abs(firstKnot.populationShare) > 1e-9 || Math.abs(firstKnot.incomeShare) > 1e-9) {
      throw new Error(
        `First knot must start at (0, 0), received (${firstKnot.populationShare}, ${firstKnot.incomeShare}).`
      );
    }
    if (
      Math.abs(lastKnot.populationShare - 1) > 1e-9 ||
      Math.abs(lastKnot.incomeShare - 1) > 1e-9
    ) {
      throw new Error(
        `Last knot must end at (1, 1), received (${lastKnot.populationShare}, ${lastKnot.incomeShare}).`
      );
    }

    for (let i = 1; i < dataset.points.length; i++) {
      const prevKnot = dataset.points[i - 1];
      const currKnot = dataset.points[i];

      if (currKnot.populationShare <= prevKnot.populationShare) {
        throw new Error(
          `Population shares must be strictly increasing: knot ${i} (${currKnot.populationShare}) <= knot ${i - 1} (${prevKnot.populationShare}).`
        );
      }
      if (currKnot.incomeShare < prevKnot.incomeShare) {
        throw new Error(
          `Income shares must be non-decreasing: knot ${i} (${currKnot.incomeShare}) < knot ${i - 1} (${prevKnot.incomeShare}).`
        );
      }
    }
  }
}
