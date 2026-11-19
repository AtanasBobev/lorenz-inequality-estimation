import { LorenzModel } from "../core/LorenzModel.js";
import { QuantileDataset } from "../core/types.js";
import { TridiagonalSolver } from "../solvers/TridiagonalSolver.js";

export type SplineBoundaryType = "natural" | "clamped";

export interface SplineOptions {
  readonly boundaryType?: SplineBoundaryType;
  readonly clampStartSlope?: number;
  readonly clampEndSlope?: number;
}

// Classical C^2 cubic spline solved via the O(k) Thomas tridiagonal algorithm
// Note: Can oscillate (Runge's phenomenon) on steeply skewed deciles; use PchipLorenzCurve for shape preservation
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

    const knotCount = this.points.length;
    const intervalWidths = new Float64Array(knotCount - 1);
    const secantSlopes = new Float64Array(knotCount - 1);

    for (let i = 0; i < knotCount - 1; i++) {
      intervalWidths[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
      secantSlopes[i] =
        (this.points[i + 1].incomeShare - this.points[i].incomeShare) / intervalWidths[i];
    }

    const solver = new TridiagonalSolver();
    const curvatures = new Float64Array(knotCount);

    if (this.boundaryType === "natural") {
      curvatures[0] = 0;
      curvatures[knotCount - 1] = 0;

      if (knotCount > 2) {
        const interiorCount = knotCount - 2;
        const subDiagonal = new Float64Array(interiorCount - 1);
        const mainDiagonal = new Float64Array(interiorCount);
        const superDiagonal = new Float64Array(interiorCount - 1);
        const rhsVector = new Float64Array(interiorCount);

        for (let i = 0; i < interiorCount; i++) {
          const knotIdx = i + 1;
          mainDiagonal[i] = 2 * (intervalWidths[knotIdx - 1] + intervalWidths[knotIdx]);
          rhsVector[i] = 6 * (secantSlopes[knotIdx] - secantSlopes[knotIdx - 1]);

          if (i > 0) {
            subDiagonal[i - 1] = intervalWidths[knotIdx - 1];
          }
          if (i < interiorCount - 1) {
            superDiagonal[i] = intervalWidths[knotIdx];
          }
        }

        const interiorCurvatures = solver.solveVectors(
          Array.from(subDiagonal),
          Array.from(mainDiagonal),
          Array.from(superDiagonal),
          Array.from(rhsVector)
        );

        for (let i = 0; i < interiorCount; i++) {
          curvatures[i + 1] = interiorCurvatures[i];
        }
      }
    } else {
      const startSlope = options.clampStartSlope ?? 0;
      const endSlope = options.clampEndSlope ?? secantSlopes[knotCount - 2];

      const subDiagonal = new Float64Array(knotCount - 1);
      const mainDiagonal = new Float64Array(knotCount);
      const superDiagonal = new Float64Array(knotCount - 1);
      const rhsVector = new Float64Array(knotCount);

      mainDiagonal[0] = 2 * intervalWidths[0];
      superDiagonal[0] = intervalWidths[0];
      rhsVector[0] = 6 * (secantSlopes[0] - startSlope);

      for (let i = 1; i < knotCount - 1; i++) {
        subDiagonal[i - 1] = intervalWidths[i - 1];
        mainDiagonal[i] = 2 * (intervalWidths[i - 1] + intervalWidths[i]);
        superDiagonal[i] = intervalWidths[i];
        rhsVector[i] = 6 * (secantSlopes[i] - secantSlopes[i - 1]);
      }

      subDiagonal[knotCount - 2] = intervalWidths[knotCount - 2];
      mainDiagonal[knotCount - 1] = 2 * intervalWidths[knotCount - 2];
      rhsVector[knotCount - 1] = 6 * (endSlope - secantSlopes[knotCount - 2]);

      const solvedCurvatures = solver.solveVectors(
        Array.from(subDiagonal),
        Array.from(mainDiagonal),
        Array.from(superDiagonal),
        Array.from(rhsVector)
      );

      for (let i = 0; i < knotCount; i++) {
        curvatures[i] = solvedCurvatures[i];
      }
    }

    this.secondDerivatives = Array.from(curvatures);
    this.aCoeffs = new Array(knotCount - 1);
    this.bCoeffs = new Array(knotCount - 1);
    this.cCoeffs = new Array(knotCount - 1);
    this.dCoeffs = new Array(knotCount - 1);

    for (let i = 0; i < knotCount - 1; i++) {
      this.aCoeffs[i] = this.points[i].incomeShare;
      this.cCoeffs[i] = curvatures[i] / 2;
      this.dCoeffs[i] = (curvatures[i + 1] - curvatures[i]) / (6 * intervalWidths[i]);
      this.bCoeffs[i] =
        secantSlopes[i] - ((2 * curvatures[i] + curvatures[i + 1]) * intervalWidths[i]) / 6;
    }
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

  public getBoundaryType(): SplineBoundaryType {
    return this.boundaryType;
  }

  public getSecondDerivatives(): readonly number[] {
    return this.secondDerivatives;
  }
}
