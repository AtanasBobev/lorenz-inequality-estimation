import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";

export interface PchipOptions {
  readonly enforceConvexity?: boolean;
}

// Shape-preserving cubic Hermite spline (Fritsch-Carlson) with iterative convexity cone projection
// TODO: Experiment with quadratic programming (QP) slope projection to minimize L2 slope perturbation
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

    const knotCount = this.points.length;
    const intervalWidths = new Float64Array(knotCount - 1);
    const secantSlopes = new Float64Array(knotCount - 1);

    for (let i = 0; i < knotCount - 1; i++) {
      intervalWidths[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
      secantSlopes[i] =
        (this.points[i + 1].incomeShare - this.points[i].incomeShare) / intervalWidths[i];
    }

    const slopes = new Float64Array(knotCount);

    // Interior tangents via Fritsch-Carlson harmonic mean of adjacent secant slopes
    for (let i = 1; i < knotCount - 1; i++) {
      if (secantSlopes[i - 1] * secantSlopes[i] <= 0) {
        slopes[i] = 0;
      } else {
        slopes[i] =
          (2 * secantSlopes[i - 1] * secantSlopes[i]) / (secantSlopes[i - 1] + secantSlopes[i]);
      }
    }

    // One-sided endpoint slopes clamped to stay non-negative
    slopes[0] = Math.max(0, 1.5 * secantSlopes[0] - 0.5 * slopes[1]);
    slopes[knotCount - 1] = Math.max(
      0,
      1.5 * secantSlopes[knotCount - 2] - 0.5 * slopes[knotCount - 2]
    );

    let repaired = false;

    // A cubic Hermite segment is convex on [p_i, p_{i+1}] iff:
    // 2*d_i + d_{i+1} <= 3*Delta_i  AND  d_i + 2*d_{i+1} >= 3*Delta_i
    if (shouldEnforceConvexity) {
      repaired = this.repairConvexity(slopes, secantSlopes, knotCount);
    }

    this.knotSlopes = Array.from(slopes);
    this.wasConvexityRepaired = repaired;

    this.aCoeffs = new Array(knotCount - 1);
    this.bCoeffs = new Array(knotCount - 1);
    this.cCoeffs = new Array(knotCount - 1);
    this.dCoeffs = new Array(knotCount - 1);

    for (let i = 0; i < knotCount - 1; i++) {
      this.aCoeffs[i] = this.points[i].incomeShare;
      this.bCoeffs[i] = slopes[i];
      this.cCoeffs[i] = (3 * secantSlopes[i] - 2 * slopes[i] - slopes[i + 1]) / intervalWidths[i];
      this.dCoeffs[i] =
        (slopes[i] + slopes[i + 1] - 2 * secantSlopes[i]) / (intervalWidths[i] * intervalWidths[i]);
    }
  }

  private repairConvexity(
    slopes: Float64Array,
    secantSlopes: Float64Array,
    knotCount: number
  ): boolean {
    let anyRepaired = false;
    const maxPasses = 5;

    for (let pass = 0; pass < maxPasses; pass++) {
      let passRepaired = false;

      for (let i = 0; i < knotCount - 1; i++) {
        const secant = secantSlopes[i];

        // Left endpoint slope is too steep, causing concave deceleration at the start of the bracket
        if (2 * slopes[i] + slopes[i + 1] > 3 * secant && slopes[i] > 0) {
          slopes[i] = Math.max(0, (3 * secant - slopes[i + 1]) / 2);
          passRepaired = true;
        }

        // Right endpoint slope is too flat, causing a concave inflection near the end of the bracket
        if (slopes[i] + 2 * slopes[i + 1] < 3 * secant) {
          slopes[i + 1] = (3 * secant - slopes[i]) / 2;
          passRepaired = true;
        }

        // Keep knot slopes bracketed by the interval secant slope so marginal income stays non-decreasing
        if (slopes[i] > secant) {
          slopes[i] = secant;
          passRepaired = true;
        }
        if (slopes[i + 1] < secant) {
          slopes[i + 1] = secant;
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
    const bracketIdx = this.findKnotInterval(clampedP);
    const localOffset = clampedP - this.points[bracketIdx].populationShare;
    return (
      this.aCoeffs[bracketIdx] +
      this.bCoeffs[bracketIdx] * localOffset +
      this.cCoeffs[bracketIdx] * localOffset * localOffset +
      this.dCoeffs[bracketIdx] * localOffset * localOffset * localOffset
    );
  }

  public derivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    const bracketIdx = this.findKnotInterval(clampedP);
    const localOffset = clampedP - this.points[bracketIdx].populationShare;
    return (
      this.bCoeffs[bracketIdx] +
      2 * this.cCoeffs[bracketIdx] * localOffset +
      3 * this.dCoeffs[bracketIdx] * localOffset * localOffset
    );
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    const bracketIdx = this.findKnotInterval(clampedP);
    const localOffset = clampedP - this.points[bracketIdx].populationShare;
    return 2 * this.cCoeffs[bracketIdx] + 6 * this.dCoeffs[bracketIdx] * localOffset;
  }

  public getKnotSlopes(): readonly number[] {
    return this.knotSlopes;
  }

  public wasRepaired(): boolean {
    return this.wasConvexityRepaired;
  }
}
