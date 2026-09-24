import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";

export interface PchipOptions {
  readonly enforceConvexity?: boolean;
}

export class PchipLorenzCurve extends LorenzModel {
  private readonly knotSlopes: number[];
  private readonly aCoeffs: number[];
  private readonly bCoeffs: number[];
  private readonly cCoeffs: number[];
  private readonly dCoeffs: number[];
  private readonly wasConvexityRepaired: boolean;

  constructor(dataset: QuantileDataset, options: PchipOptions = {}) {
    super(dataset);
    const shouldEnforceConvexity = options.enforceConvexity ?? true;

    const n = this.points.length;
    const h = new Float64Array(n - 1);
    const delta = new Float64Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
      h[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
      delta[i] = (this.points[i + 1].incomeShare - this.points[i].incomeShare) / h[i];
    }

    const d = new Float64Array(n);

    // Initial Fritsch-Carlson harmonic mean slopes
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) {
        d[i] = 0;
      } else {
        d[i] = (2 * delta[i - 1] * delta[i]) / (delta[i - 1] + delta[i]);
      }
    }

    // Endpoint slopes: one-sided shape-preserving derivatives
    d[0] = Math.max(0, 1.5 * delta[0] - 0.5 * d[1]);
    d[n - 1] = Math.max(0, 1.5 * delta[n - 2] - 0.5 * d[n - 2]);

    let repaired = false;

    // Convexity verification and repair step
    // A cubic segment is convex iff 2*d_i + d_{i+1} <= 3*Delta_i AND d_i + 2*d_{i+1} >= 3*Delta_i
    if (shouldEnforceConvexity) {
      repaired = this.repairConvexity(d, delta, n);
    }

    this.knotSlopes = Array.from(d);
    this.wasConvexityRepaired = repaired;

    this.aCoeffs = new Array(n - 1);
    this.bCoeffs = new Array(n - 1);
    this.cCoeffs = new Array(n - 1);
    this.dCoeffs = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
      this.aCoeffs[i] = this.points[i].incomeShare;
      this.bCoeffs[i] = d[i];
      this.cCoeffs[i] = (3 * delta[i] - 2 * d[i] - d[i + 1]) / h[i];
      this.dCoeffs[i] = (d[i] + d[i + 1] - 2 * delta[i]) / (h[i] * h[i]);
    }
  }

  private repairConvexity(d: Float64Array, delta: Float64Array, n: number): boolean {
    let anyRepaired = false;
    const maxPasses = 5;

    for (let pass = 0; pass < maxPasses; pass++) {
      let passRepaired = false;

      for (let i = 0; i < n - 1; i++) {
        const secant = delta[i];

        // 1. Initial slope too fast -> decelerates -> concave violation at left
        if (2 * d[i] + d[i + 1] > 3 * secant) {
          const maxAllowedD = Math.max(0, (3 * secant - d[i + 1]) / 2);
          if (maxAllowedD < d[i]) {
            d[i] = maxAllowedD;
            passRepaired = true;
          }
        }

        // 2. Final slope too slow -> concave violation at right
        if (d[i] + 2 * d[i + 1] < 3 * secant) {
          const minAllowedDNext = (3 * secant - d[i]) / 2;
          if (minAllowedDNext > d[i + 1]) {
            d[i + 1] = minAllowedDNext;
            passRepaired = true;
          }
        }

        // Maintain ascending ordering of marginal incomes (y(p) / mu)
        if (d[i] > secant) {
          d[i] = secant;
          passRepaired = true;
        }
        if (d[i + 1] < secant) {
          d[i + 1] = secant;
          passRepaired = true;
        }
      }

      if (passRepaired) {
        anyRepaired = true;
      } else {
        break;
      }
    }

    return anyRepaired;
  }

  public evaluate(p: number): number {
    const clampedP = this.clampPopulation(p);
    const i = this.findKnotInterval(clampedP);
    const dx = clampedP - this.points[i].populationShare;
    return (
      this.aCoeffs[i] +
      this.bCoeffs[i] * dx +
      this.cCoeffs[i] * dx * dx +
      this.dCoeffs[i] * dx * dx * dx
    );
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    const i = this.findKnotInterval(clampedP);
    const dx = clampedP - this.points[i].populationShare;
    return this.bCoeffs[i] + 2 * this.cCoeffs[i] * dx + 3 * this.dCoeffs[i] * dx * dx;
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    const i = this.findKnotInterval(clampedP);
    const dx = clampedP - this.points[i].populationShare;
    return 2 * this.cCoeffs[i] + 6 * this.dCoeffs[i] * dx;
  }

  public getKnotSlopes(): readonly number[] {
    return this.knotSlopes;
  }

  public wasRepaired(): boolean {
    return this.wasConvexityRepaired;
  }
}
