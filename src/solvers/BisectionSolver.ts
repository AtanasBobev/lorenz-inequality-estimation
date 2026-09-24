import { LorenzModel } from "../core/LorenzModel.js";
import { RootFinder } from "../core/RootFinder.js";
import { RootResult } from "../core/types.js";

export class BisectionSolver implements RootFinder {
  public readonly name = "Bisection Method";

  public solve(
    fn: (x: number) => number,
    lowerBound: number,
    upperBound: number,
    tolerance: number = 1e-8,
    maxIterations: number = 100
  ): RootResult {
    let a = lowerBound;
    let b = upperBound;
    let fa = fn(a);
    let fb = fn(b);

    if (Math.abs(fa) <= tolerance) {
      return {
        root: a,
        populationPercentile: a,
        iterations: 0,
        converged: true,
        finalError: Math.abs(fa)
      };
    }
    if (Math.abs(fb) <= tolerance) {
      return {
        root: b,
        populationPercentile: b,
        iterations: 0,
        converged: true,
        finalError: Math.abs(fb)
      };
    }

    if (fa * fb > 0) {
      throw new Error(`Root is not bracketed: f(${a})=${fa} and f(${b})=${fb} have the same sign.`);
    }

    let mid = a;
    let fmid = fa;

    for (let iter = 1; iter <= maxIterations; iter++) {
      mid = a + (b - a) / 2;
      fmid = fn(mid);

      const halfInterval = (b - a) / 2;
      if (Math.abs(fmid) <= tolerance || halfInterval <= tolerance) {
        return {
          root: mid,
          populationPercentile: mid,
          iterations: iter,
          converged: true,
          finalError: Math.abs(fmid)
        };
      }

      if (fa * fmid < 0) {
        b = mid;
        fb = fmid;
      } else {
        a = mid;
        fa = fmid;
      }
    }

    return {
      root: mid,
      populationPercentile: mid,
      iterations: maxIterations,
      converged: false,
      finalError: Math.abs(fmid)
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
