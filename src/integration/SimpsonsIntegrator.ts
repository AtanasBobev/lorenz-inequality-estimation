import { LorenzModel } from "../core/LorenzModel.js";
import { NumericalIntegrator } from "../core/NumericalIntegrator.js";
import { GiniResult } from "../core/types.js";

// Fourth-order composite Simpson's 1/3 quadrature for Lorenz curve area and Gini index
export class SimpsonsIntegrator implements NumericalIntegrator {
  public readonly name = "Composite Simpson's Rule";

  public integrate(
    model: LorenzModel,
    lowerLimit: number = 0,
    upperLimit: number = 1,
    stepCount: number = 100
  ): GiniResult {
    if (stepCount < 2) {
      throw new Error(`stepCount must be at least 2, received ${stepCount}.`);
    }
    if (lowerLimit >= upperLimit) {
      throw new Error(
        `Lower bound a (${lowerLimit}) must be strictly less than upper bound b (${upperLimit}).`
      );
    }

    // Simpson's 1/3 rule requires an even number of subintervals
    const subintervalCount = stepCount % 2 === 0 ? stepCount : stepCount + 1;
    const stepWidth = (upperLimit - lowerLimit) / subintervalCount;

    let weightedSum = model.evaluate(lowerLimit) + model.evaluate(upperLimit);

    for (let i = 1; i < subintervalCount; i++) {
      const percentile = lowerLimit + i * stepWidth;
      const curveValue = model.evaluate(percentile);
      weightedSum += (i % 2 === 1 ? 4 : 2) * curveValue;
    }

    const areaUnderCurve = (weightedSum * stepWidth) / 3;
    const giniIndex = 1 - 2 * areaUnderCurve;

    return {
      giniIndex,
      areaUnderCurve,
      methodUsed: this.name
    };
  }
}
