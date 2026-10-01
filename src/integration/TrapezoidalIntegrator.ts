import { LorenzModel } from "../core/LorenzModel.js";
import { NumericalIntegrator } from "../core/NumericalIntegrator.js";
import { GiniResult } from "../core/types.js";

export class TrapezoidalIntegrator implements NumericalIntegrator {
  public readonly name = "Composite Trapezoidal Rule";

  public integrate(
    model: LorenzModel,
    a: number = 0,
    b: number = 1,
    stepCount: number = 100
  ): GiniResult {
    if (stepCount < 1) {
      throw new Error(`stepCount must be at least 1, received ${stepCount}.`);
    }
    if (a >= b) {
      throw new Error(`Lower bound a (${a}) must be strictly less than upper bound b (${b}).`);
    }

    const h = (b - a) / stepCount;
    let sum = 0.5 * (model.evaluate(a) + model.evaluate(b));

    for (let i = 1; i < stepCount; i++) {
      const p = a + i * h;
      sum += model.evaluate(p);
    }

    const areaUnderCurve = sum * h;
    const giniIndex = 1 - 2 * areaUnderCurve;

    return {
      giniIndex,
      areaUnderCurve,
      methodUsed: this.name
    };
  }
}
