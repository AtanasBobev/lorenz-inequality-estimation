import { TridiagonalSystem } from "../core/types.js";

// O(N) Thomas algorithm (tridiagonal LU elimination without pivoting) for diagonally dominant spline systems
// TODO: Add cyclic tridiagonal support if periodic boundary splines are needed in future benchmarks
export class TridiagonalSolver {
  public solve(system: TridiagonalSystem): number[] {
    return this.solveVectors(system.lower, system.diag, system.upper, system.rhs);
  }

  public solveVectors(
    lower: readonly number[],
    diag: readonly number[],
    upper: readonly number[],
    rhs: readonly number[]
  ): number[] {
    const systemSize = diag.length;

    if (rhs.length !== systemSize) {
      throw new Error(`RHS length (${rhs.length}) must match diagonal length (${systemSize}).`);
    }
    if (systemSize === 0) {
      return [];
    }
    if (systemSize === 1) {
      if (Math.abs(diag[0]) < 1e-15) {
        throw new Error("Cannot solve 1x1 system with zero diagonal element.");
      }
      return [rhs[0] / diag[0]];
    }
    if (lower.length !== systemSize - 1) {
      throw new Error(`Lower diagonal length (${lower.length}) must be n - 1 (${systemSize - 1}).`);
    }
    if (upper.length !== systemSize - 1) {
      throw new Error(`Upper diagonal length (${upper.length}) must be n - 1 (${systemSize - 1}).`);
    }

    const modifiedSuperDiag = new Float64Array(systemSize - 1);
    const modifiedRhs = new Float64Array(systemSize);

    if (Math.abs(diag[0]) < 1e-15) {
      throw new Error("Zero pivot encountered at row 0.");
    }

    modifiedSuperDiag[0] = upper[0] / diag[0];
    modifiedRhs[0] = rhs[0] / diag[0];

    for (let i = 1; i < systemSize; i++) {
      const pivotDenom = diag[i] - lower[i - 1] * modifiedSuperDiag[i - 1];
      if (Math.abs(pivotDenom) < 1e-15) {
        throw new Error(`Zero pivot encountered at row ${i}.`);
      }

      if (i < systemSize - 1) {
        modifiedSuperDiag[i] = upper[i] / pivotDenom;
      }
      modifiedRhs[i] = (rhs[i] - lower[i - 1] * modifiedRhs[i - 1]) / pivotDenom;
    }

    const solution = new Array<number>(systemSize);
    solution[systemSize - 1] = modifiedRhs[systemSize - 1];

    for (let i = systemSize - 2; i >= 0; i--) {
      solution[i] = modifiedRhs[i] - modifiedSuperDiag[i] * solution[i + 1];
    }

    return solution;
  }
}
