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
    const step = 1 / sampleCount;
    for (let i = 0; i <= sampleCount; i++) {
      const p = i * step;
      if (this.derivative(p) < -tolerance) {
        return false;
      }
    }
    return true;
  }

  public isConvex(sampleCount: number = 200, tolerance: number = 1e-8): boolean {
    const step = 1 / sampleCount;
    for (let i = 0; i <= sampleCount; i++) {
      const p = i * step;
      if (this.secondDerivative(p) < -tolerance) {
        return false;
      }
    }
    return true;
  }

  public findConvexityViolations(sampleCount: number = 200, tolerance: number = 1e-8): number[] {
    const violations: number[] = [];
    const step = 1 / sampleCount;
    for (let i = 0; i <= sampleCount; i++) {
      const p = i * step;
      if (this.secondDerivative(p) < -tolerance) {
        violations.push(p);
      }
    }
    return violations;
  }

  protected clampPopulation(p: number): number {
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  protected findKnotInterval(p: number): number {
    const n = this.points.length;
    if (p <= this.points[0].populationShare) {
      return 0;
    }
    if (p >= this.points[n - 1].populationShare) {
      return n - 2;
    }

    let low = 0;
    let high = n - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (p < this.points[mid].populationShare) {
        high = mid - 1;
      } else if (p >= this.points[mid + 1].populationShare) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return Math.max(0, Math.min(n - 2, low));
  }

  public getDataset(): QuantileDataset {
    return this.dataset;
  }

  private validateDataset(dataset: QuantileDataset): void {
    if (!dataset.points || dataset.points.length < 2) {
      throw new Error("Quantile dataset must contain at least 2 points.");
    }
    if (dataset.meanIncome <= 0) {
      throw new Error(`Mean income must be positive, received ${dataset.meanIncome}.`);
    }

    const first = dataset.points[0];
    const last = dataset.points[dataset.points.length - 1];

    if (Math.abs(first.populationShare) > 1e-9 || Math.abs(first.incomeShare) > 1e-9) {
      throw new Error(`First knot must start at (0, 0), received (${first.populationShare}, ${first.incomeShare}).`);
    }
    if (Math.abs(last.populationShare - 1) > 1e-9 || Math.abs(last.incomeShare - 1) > 1e-9) {
      throw new Error(`Last knot must end at (1, 1), received (${last.populationShare}, ${last.incomeShare}).`);
    }

    for (let i = 1; i < dataset.points.length; i++) {
      const prev = dataset.points[i - 1];
      const curr = dataset.points[i];

      if (curr.populationShare <= prev.populationShare) {
        throw new Error(
          `Population shares must be strictly increasing: knot ${i} (${curr.populationShare}) <= knot ${i - 1} (${prev.populationShare}).`
        );
      }
      if (curr.incomeShare < prev.incomeShare) {
        throw new Error(
          `Income shares must be non-decreasing: knot ${i} (${curr.incomeShare}) < knot ${i - 1} (${prev.incomeShare}).`
        );
      }
    }
  }
}

