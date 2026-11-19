import { describe, it, expect } from "vitest";
import {
  TridiagonalSolver,
  BisectionSolver,
  NewtonRaphsonSolver,
  LorenzModel,
  QuantileDataset
} from "../src/index.js";

class MockLorenzModel extends LorenzModel {
  constructor() {
    const dummyDataset: QuantileDataset = {
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 1, incomeShare: 1 }
      ],
      meanIncome: 50000
    };
    super(dummyDataset);
  }

  public evaluate(p: number): number {
    // Monotonic convex test curve: L(p) = p^2
    return p * p;
  }

  public derivative(p: number): number {
    return 2 * p;
  }

  public secondDerivative(_p: number): number {
    return 2;
  }

  public isMonotonic(): boolean {
    return true;
  }

  public isConvex(): boolean {
    return true;
  }
}

describe("TridiagonalSolver (Thomas Algorithm)", () => {
  const solver = new TridiagonalSolver();

  it("solves a symmetric 3x3 tridiagonal system", () => {
    const lower = [-1, -1];
    const diag = [2, 2, 2];
    const upper = [-1, -1];
    const rhs = [1, 0, 1];

    const x = solver.solveVectors(lower, diag, upper, rhs);

    expect(x).toHaveLength(3);
    expect(x[0]).toBeCloseTo(1.0, 10);
    expect(x[1]).toBeCloseTo(1.0, 10);
    expect(x[2]).toBeCloseTo(1.0, 10);
  });

  it("solves a 4x4 diagonally dominant system", () => {
    const system = {
      lower: [1, 1, 1],
      diag: [4, 4, 4, 4],
      upper: [1, 1, 1],
      rhs: [5, 6, 6, 5]
    };

    const x = solver.solve(system);

    expect(x).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(x[i]).toBeCloseTo(1.0, 10);
    }
  });

  it("handles 1x1 scalar base cases", () => {
    const x = solver.solveVectors([], [4], [], [12]);
    expect(x).toEqual([3]);
  });

  it("handles empty systems", () => {
    const x = solver.solveVectors([], [], [], []);
    expect(x).toEqual([]);
  });

  it("throws on dimension mismatch", () => {
    expect(() => solver.solveVectors([1], [2, 2], [1, 1], [1, 1])).toThrow();
    expect(() => solver.solveVectors([1], [2, 2], [1], [1])).toThrow();
  });

  it("accurately solves a 100-node tridiagonal system within tolerance", () => {
    const n = 100;
    const lower = new Array(n - 1).fill(-1);
    const diag = new Array(n).fill(2.05); // strictly diagonally dominant
    const upper = new Array(n - 1).fill(-1);
    const rhs = new Array(n).fill(0);
    rhs[0] = 1;
    rhs[n - 1] = 1;

    const x = solver.solveVectors(lower, diag, upper, rhs);
    expect(x).toHaveLength(n);

    // Verify residual A*x - rhs is near zero for all rows
    const r0 = diag[0] * x[0] + upper[0] * x[1] - rhs[0];
    expect(Math.abs(r0)).toBeLessThan(1e-10);

    for (let i = 1; i < n - 1; i++) {
      const ri = lower[i - 1] * x[i - 1] + diag[i] * x[i] + upper[i] * x[i + 1] - rhs[i];
      expect(Math.abs(ri)).toBeLessThan(1e-10);
    }

    const rn = lower[n - 2] * x[n - 2] + diag[n - 1] * x[n - 1] - rhs[n - 1];
    expect(Math.abs(rn)).toBeLessThan(1e-10);
  });
});

describe("BisectionSolver", () => {
  const bisection = new BisectionSolver();

  it("solves sqrt(2) on [1, 2]", () => {
    const result = bisection.solve((x) => x * x - 2, 1, 2, 1e-9);

    expect(result.converged).toBe(true);
    expect(result.root).toBeCloseTo(Math.SQRT2, 8);
    expect(result.finalError).toBeLessThan(1e-8);
  });

  it("throws when root is not bracketed", () => {
    expect(() => bisection.solve((x) => x * x + 1, 1, 2)).toThrow(/not bracketed/);
  });

  it("inverts a Lorenz model to find median income percentile", () => {
    const model = new MockLorenzModel();
    // L(p) = p^2 = 0.25 -> p = 0.5
    const result = bisection.findRoot(model, 0.25, 0, 1, 1e-8);

    expect(result.converged).toBe(true);
    expect(result.populationPercentile).toBeCloseTo(0.5, 7);
  });
});

describe("NewtonRaphsonSolver", () => {
  const newton = new NewtonRaphsonSolver();

  it("solves sqrt(2) with quadratic convergence", () => {
    const result = newton.solve(
      (x) => x * x - 2,
      (x) => 2 * x,
      1.5,
      1,
      2,
      1e-10
    );

    expect(result.converged).toBe(true);
    expect(result.root).toBeCloseTo(Math.SQRT2, 9);
    expect(result.iterations).toBeLessThan(6);
  });

  it("inverts a Lorenz model to find target percentile", () => {
    const model = new MockLorenzModel();
    // L(p) = p^2 = 0.49 -> p = 0.7
    const result = newton.findRoot(model, 0.49, 0, 1, 1e-8);

    expect(result.converged).toBe(true);
    expect(result.populationPercentile).toBeCloseTo(0.7, 7);
  });

  it("handles endpoint roots, zero pivots, damped steps, and iteration limits across all solvers", () => {
    const tridiag = new TridiagonalSolver();
    expect(() => tridiag.solveVectors([], [0], [], [5])).toThrow(/1x1 system with zero diagonal/);
    expect(() => tridiag.solveVectors([1, 1], [2, 2], [1], [1, 1])).toThrow(/Lower diagonal/);
    expect(() => tridiag.solveVectors([1], [2, 2], [1, 1], [1, 1])).toThrow(/Upper diagonal/);
    expect(() => tridiag.solveVectors([1], [0, 2], [1], [1, 1])).toThrow(/row 0/);
    expect(() => tridiag.solveVectors([1], [1, 1], [1], [1, 1])).toThrow(/row 1/);

    const bisection = new BisectionSolver();
    const leftExact = bisection.solve((x) => x - 1, 1, 2);
    expect(leftExact.iterations).toBe(0);
    expect(leftExact.root).toBe(1);

    const rightExact = bisection.solve((x) => x - 2, 1, 2);
    expect(rightExact.iterations).toBe(0);
    expect(rightExact.root).toBe(2);

    const bisectionUnconverged = bisection.solve((x) => x - 1.333333333333, 1, 2, 1e-15, 2);
    expect(bisectionUnconverged.converged).toBe(false);

    // Newton-Raphson with zero derivative and finite bounds -> resets to midpoint
    let callCount = 0;
    const resMidpoint = newton.solve(
      (x) => x - 0.5,
      () => (callCount++ === 0 ? 0 : 1),
      0.1,
      0,
      1
    );
    expect(resMidpoint.converged).toBe(true);

    // Newton-Raphson with zero derivative and infinite bounds -> throws
    expect(() =>
      newton.solve(
        (x) => x - 1,
        () => 0,
        0.1
      )
    ).toThrow(/Derivative too close to zero/);

    // Newton-Raphson step leaving [lowerBound, upperBound] gets damped, and non-convergence after maxIterations
    const dampedUnconverged = newton.solve(
      (x) => x * x - 0.25,
      () => 0.01,
      0.9,
      0,
      1,
      1e-12,
      2
    );
    expect(dampedUnconverged.converged).toBe(false);

    // Converges on step size (Math.abs(nextX - currentX) <= tolerance && Math.abs(fn(nextX)) <= tolerance)
    const stepConverged = newton.solve(
      (x) => (x === 0.5 ? 2e-8 : 0),
      () => 1e8,
      0.5,
      0,
      1,
      1e-8,
      10
    );
    expect(stepConverged.converged).toBe(true);

    // Small step where Math.abs(nextX - currentX) <= tolerance but Math.abs(fn(nextX)) > tolerance
    const tinyStepNotRoot = newton.solve(
      () => 1.0,
      () => 1e9,
      0.5,
      0,
      1,
      1e-8,
      2
    );
    expect(tinyStepNotRoot.converged).toBe(false);
  });
});
