import { LorenzModel } from "../core/LorenzModel.js";
import { RootFinder } from "../core/RootFinder.js";
import { RootResult } from "../core/types.js";

export class NewtonRaphsonSolver implements RootFinder {
  public readonly name = "Newton-Raphson";

  public solve(
    fn: (x: number) => number,
    dfn: (x: number) => number,
    initialGuess: number,
    lowerBound: number = -Infinity,
    upperBound: number = Infinity,
    tolerance: number = 1e-8,
    maxIterations: number = 100
  ): RootResult {
    let x = initialGuess;

    for (let iter = 1; iter <= maxIterations; iter++) {
      const fx = fn(x);
      const dfx = dfn(x);

      if (Math.abs(fx) <= tolerance) {
        return {
          root: x,
          populationPercentile: x,
          iterations: iter,
          converged: true,
          finalError: Math.abs(fx)
        };
      }

      if (Math.abs(dfx) < 1e-15) {
        if (Number.isFinite(lowerBound) && Number.isFinite(upperBound)) {
          x = (lowerBound + upperBound) / 2;
          continue;
        }
        throw new Error(`Derivative too close to zero at x = ${x} (df = ${dfx}).`);
      }

      const step = fx / dfx;
      let nextX = x - step;

      if (nextX < lowerBound || nextX > upperBound) {
        nextX = Math.max(lowerBound, Math.min(upperBound, x - 0.5 * step));
      }

      if (Math.abs(nextX - x) <= tolerance && Math.abs(fn(nextX)) <= tolerance) {
        return {
          root: nextX,
          populationPercentile: nextX,
          iterations: iter,
          converged: true,
          finalError: Math.abs(fn(nextX))
        };
      }

      x = nextX;
    }

    return {
      root: x,
      populationPercentile: x,
      iterations: maxIterations,
      converged: false,
      finalError: Math.abs(fn(x))
    };
  }

  public findRoot(
    model: LorenzModel,
    targetIncomeShare: number,
    lowerBound: number = 0,
    upperBound: number = 1,
    tolerance: number = 1e-8,
    maxIterations: number = 100
  ): RootResult {
    const initialGuess = (lowerBound + upperBound) / 2;
    return this.solve(
      (p) => model.evaluate(p) - targetIncomeShare,
      (p) => model.derivative(p),
      initialGuess,
      lowerBound,
      upperBound,
      tolerance,
      maxIterations
    );
  }
}
