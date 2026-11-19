import { LorenzModel } from "../core/LorenzModel.js";
import { RootFinder } from "../core/RootFinder.js";
import { RootResult } from "../core/types.js";

// Bracketing bisection root finder with guaranteed linear convergence on continuous intervals
export class BisectionSolver implements RootFinder {
  public readonly name = "Bisection Method";

  public solve(
    fn: (x: number) => number,
    lowerBound: number,
    upperBound: number,
    tolerance: number = 1e-8,
    maxIterations: number = 100
  ): RootResult {
    let leftBound = lowerBound;
    let rightBound = upperBound;
    let fLeft = fn(leftBound);
    const fRight = fn(rightBound);

    if (Math.abs(fLeft) <= tolerance) {
      return {
        root: leftBound,
        populationPercentile: leftBound,
        iterations: 0,
        converged: true,
        finalError: Math.abs(fLeft)
      };
    }
    if (Math.abs(fRight) <= tolerance) {
      return {
        root: rightBound,
        populationPercentile: rightBound,
        iterations: 0,
        converged: true,
        finalError: Math.abs(fRight)
      };
    }

    if (fLeft * fRight > 0) {
      throw new Error(
        `Root is not bracketed: f(${leftBound})=${fLeft} and f(${rightBound})=${fRight} have the same sign.`
      );
    }

    let midpoint = leftBound;
    let fMid = fLeft;

    for (let iter = 1; iter <= maxIterations; iter++) {
      midpoint = leftBound + (rightBound - leftBound) / 2;
      fMid = fn(midpoint);

      const halfInterval = (rightBound - leftBound) / 2;
      if (Math.abs(fMid) <= tolerance || halfInterval <= tolerance) {
        return {
          root: midpoint,
          populationPercentile: midpoint,
          iterations: iter,
          converged: true,
          finalError: Math.abs(fMid)
        };
      }

      if (fLeft * fMid < 0) {
        rightBound = midpoint;
      } else {
        leftBound = midpoint;
        fLeft = fMid;
      }
    }

    return {
      root: midpoint,
      populationPercentile: midpoint,
      iterations: maxIterations,
      converged: false,
      finalError: Math.abs(fMid)
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
    return this.solve(
      (p) => model.evaluate(p) - targetIncomeShare,
      lowerBound,
      upperBound,
      tolerance,
      maxIterations
    );
  }
}
