import { TridiagonalSystem } from "../core/types.js";

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
    const n = diag.length;

    if (rhs.length !== n) {
      throw new Error(`RHS length (${rhs.length}) must match diagonal length (${n}).`);
    }
    if (n === 0) {
      return [];
    }
    if (n === 1) {
      if (Math.abs(diag[0]) < 1e-15) {
        throw new Error("Cannot solve 1x1 system with zero diagonal element.");
      }
      return [rhs[0] / diag[0]];
    }
    if (lower.length !== n - 1) {
      throw new Error(`Lower diagonal length (${lower.length}) must be n - 1 (${n - 1}).`);
    }
    if (upper.length !== n - 1) {
      throw new Error(`Upper diagonal length (${upper.length}) must be n - 1 (${n - 1}).`);
    }

    const cPrime = new Float64Array(n - 1);
    const dPrime = new Float64Array(n);

    if (Math.abs(diag[0]) < 1e-15) {
      throw new Error("Zero pivot encountered at row 0.");
    }

    cPrime[0] = upper[0] / diag[0];
    dPrime[0] = rhs[0] / diag[0];

    for (let i = 1; i < n; i++) {
      const denom = diag[i] - lower[i - 1] * cPrime[i - 1];
      if (Math.abs(denom) < 1e-15) {
        throw new Error(`Zero pivot encountered at row ${i}.`);
      }

      if (i < n - 1) {
        cPrime[i] = upper[i] / denom;
      }
      dPrime[i] = (rhs[i] - lower[i - 1] * dPrime[i - 1]) / denom;
    }

    const solution = new Array<number>(n);
    solution[n - 1] = dPrime[n - 1];

    for (let i = n - 2; i >= 0; i--) {
      solution[i] = dPrime[i] - cPrime[i] * solution[i + 1];
    }

    return solution;
  }
}
