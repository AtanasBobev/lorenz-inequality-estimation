import { LorenzModel } from "../core/LorenzModel.js";
import { NumericalIntegrator } from "../core/NumericalIntegrator.js";
import { GiniResult } from "../core/types.js";

export class SimpsonsIntegrator implements NumericalIntegrator {
  public readonly name = "Composite Simpson's Rule";

  public integrate(
    model: LorenzModel,
    a: number = 0,
    b: number = 1,
    stepCount: number = 100
  ): GiniResult {
    if (stepCount < 2) {
      throw new Error(`stepCount must be at least 2, received ${stepCount}.`);
    }
    if (a >= b) {
      throw new Error(`Lower bound a (${a}) must be strictly less than upper bound b (${b}).`);
    }

    const n = stepCount % 2 === 0 ? stepCount : stepCount + 1;
    const h = (b - a) / n;

    let sum = model.evaluate(a) + model.evaluate(b);

    for (let i = 1; i < n; i++) {
      const p = a + i * h;
      const val = model.evaluate(p);
      sum += (i % 2 === 1 ? 4 : 2) * val;
    }

    const areaUnderCurve = (sum * h) / 3;
    const giniIndex = 1 - 2 * areaUnderCurve;

    return {
      giniIndex,
      areaUnderCurve,
      methodUsed: this.name
    };
  }
}
