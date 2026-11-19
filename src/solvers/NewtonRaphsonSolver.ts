import { LorenzModel } from "../core/LorenzModel.js";
import { RootFinder } from "../core/RootFinder.js";
import { RootResult } from "../core/types.js";

// Safeguarded Newton-Raphson solver that damps steps when they leave [lowerBound, upperBound]
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
    let currentX = initialGuess;

    for (let iter = 1; iter <= maxIterations; iter++) {
      const fVal = fn(currentX);
      const derivativeVal = dfn(currentX);

      if (Math.abs(fVal) <= tolerance) {
        return {
          root: currentX,
          populationPercentile: currentX,
          iterations: iter,
          converged: true,
          finalError: Math.abs(fVal)
        };
      }

      if (Math.abs(derivativeVal) < 1e-15) {
        if (Number.isFinite(lowerBound) && Number.isFinite(upperBound)) {
          currentX = (lowerBound + upperBound) / 2;
          continue;
        }
        throw new Error(`Derivative too close to zero at x = ${currentX} (df = ${derivativeVal}).`);
      }

      const newtonStep = fVal / derivativeVal;
      let nextX = currentX - newtonStep;

      if (nextX < lowerBound || nextX > upperBound) {
        nextX = Math.max(lowerBound, Math.min(upperBound, currentX - 0.5 * newtonStep));
      }

      if (Math.abs(nextX - currentX) <= tolerance && Math.abs(fn(nextX)) <= tolerance) {
        return {
          root: nextX,
          populationPercentile: nextX,
          iterations: iter,
          converged: true,
          finalError: Math.abs(fn(nextX))
        };
      }

      currentX = nextX;
    }

    return {
      root: currentX,
      populationPercentile: currentX,
      iterations: maxIterations,
      converged: false,
      finalError: Math.abs(fn(currentX))
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
