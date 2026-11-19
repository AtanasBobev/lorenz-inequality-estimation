import { LorenzModel } from "../core/LorenzModel.js";
import { NumericalIntegrator } from "../core/NumericalIntegrator.js";
import { GiniResult } from "../core/types.js";

// Second-order composite trapezoidal quadrature (equivalent to linear chord integration when stepCount matches knots)
export class TrapezoidalIntegrator implements NumericalIntegrator {
  public readonly name = "Composite Trapezoidal Rule";

  public integrate(
    model: LorenzModel,
    lowerLimit: number = 0,
    upperLimit: number = 1,
    stepCount: number = 100
  ): GiniResult {
    if (stepCount < 1) {
      throw new Error(`stepCount must be at least 1, received ${stepCount}.`);
    }
    if (lowerLimit >= upperLimit) {
      throw new Error(
        `Lower bound a (${lowerLimit}) must be strictly less than upper bound b (${upperLimit}).`
      );
    }

    const stepWidth = (upperLimit - lowerLimit) / stepCount;
    let chordSum = 0.5 * (model.evaluate(lowerLimit) + model.evaluate(upperLimit));

    for (let i = 1; i < stepCount; i++) {
      const percentile = lowerLimit + i * stepWidth;
      chordSum += model.evaluate(percentile);
    }

    const areaUnderCurve = chordSum * stepWidth;
    const giniIndex = 1 - 2 * areaUnderCurve;

    return {
      giniIndex,
      areaUnderCurve,
      methodUsed: this.name
    };
  }
}
