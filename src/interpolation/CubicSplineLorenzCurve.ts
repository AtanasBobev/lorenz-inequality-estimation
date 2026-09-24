import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";
import { TridiagonalSolver } from "../solvers/TridiagonalSolver.js";

export type SplineBoundaryType = "natural" | "clamped";

export interface SplineOptions {
  readonly boundaryType?: SplineBoundaryType;
  readonly clampStartSlope?: number;
  readonly clampEndSlope?: number;
}

export class CubicSplineLorenzCurve extends LorenzModel {
  private readonly aCoeffs: number[];
  private readonly bCoeffs: number[];
  private readonly cCoeffs: number[];
  private readonly dCoeffs: number[];
  private readonly secondDerivatives: number[];
  private readonly boundaryType: SplineBoundaryType;

  constructor(dataset: QuantileDataset, options: SplineOptions = {}) {
    super(dataset);
    this.boundaryType = options.boundaryType ?? "natural";

    const n = this.points.length;
    const h = new Float64Array(n - 1);
    const delta = new Float64Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
      h[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
      delta[i] = (this.points[i + 1].incomeShare - this.points[i].incomeShare) / h[i];
    }

    const solver = new TridiagonalSolver();
    const M = new Float64Array(n);

    if (this.boundaryType === "natural") {
      M[0] = 0;
      M[n - 1] = 0;

      if (n > 2) {
        const numInterior = n - 2;
        const lower = new Float64Array(numInterior - 1);
        const diag = new Float64Array(numInterior);
        const upper = new Float64Array(numInterior - 1);
        const rhs = new Float64Array(numInterior);

        for (let i = 0; i < numInterior; i++) {
          const knotIdx = i + 1;
          diag[i] = 2 * (h[knotIdx - 1] + h[knotIdx]);
          rhs[i] = 6 * (delta[knotIdx] - delta[knotIdx - 1]);

          if (i > 0) {
            lower[i - 1] = h[knotIdx - 1];
          }
          if (i < numInterior - 1) {
            upper[i] = h[knotIdx];
          }
        }

        const interiorM = solver.solveVectors(
          Array.from(lower),
          Array.from(diag),
          Array.from(upper),
          Array.from(rhs)
        );

        for (let i = 0; i < numInterior; i++) {
          M[i + 1] = interiorM[i];
        }
      }
    } else {
      const fPrime0 = options.clampStartSlope ?? 0;
      const fPrimeN = options.clampEndSlope ?? delta[n - 2];

      const lower = new Float64Array(n - 1);
      const diag = new Float64Array(n);
      const upper = new Float64Array(n - 1);
      const rhs = new Float64Array(n);

      diag[0] = 2 * h[0];
      upper[0] = h[0];
      rhs[0] = 6 * (delta[0] - fPrime0);

      for (let i = 1; i < n - 1; i++) {
        lower[i - 1] = h[i - 1];
        diag[i] = 2 * (h[i - 1] + h[i]);
        upper[i] = h[i];
        rhs[i] = 6 * (delta[i] - delta[i - 1]);
      }

      lower[n - 2] = h[n - 2];
      diag[n - 1] = 2 * h[n - 2];
      rhs[n - 1] = 6 * (fPrimeN - delta[n - 2]);

      const solvedM = solver.solveVectors(
        Array.from(lower),
        Array.from(diag),
        Array.from(upper),
        Array.from(rhs)
      );

      for (let i = 0; i < n; i++) {
        M[i] = solvedM[i];
      }
    }

    this.secondDerivatives = Array.from(M);
    this.aCoeffs = new Array(n - 1);
    this.bCoeffs = new Array(n - 1);
    this.cCoeffs = new Array(n - 1);
    this.dCoeffs = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
      this.aCoeffs[i] = this.points[i].incomeShare;
      this.cCoeffs[i] = M[i] / 2;
      this.dCoeffs[i] = (M[i + 1] - M[i]) / (6 * h[i]);
      this.bCoeffs[i] = delta[i] - ((2 * M[i] + M[i + 1]) * h[i]) / 6;
    }
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
    return (
      this.bCoeffs[i] +
      2 * this.cCoeffs[i] * dx +
      3 * this.dCoeffs[i] * dx * dx
    );
  }

  public secondDerivative(p: number): number {
    const clampedP = this.clampPopulation(p);
    const i = this.findKnotInterval(clampedP);
    const dx = clampedP - this.points[i].populationShare;
    return 2 * this.cCoeffs[i] + 6 * this.dCoeffs[i] * dx;
  }

  public getBoundaryType(): SplineBoundaryType {
    return this.boundaryType;
  }

  public getSecondDerivatives(): readonly number[] {
    return this.secondDerivatives;
  }
}
