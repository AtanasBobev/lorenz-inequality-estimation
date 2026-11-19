import { ConsumptionResult } from "../core/types.js";

// Fits a linear Keynesian consumption function C = C_0 + c * Y via ordinary least squares (OLS)
// TODO: Support weighted least squares (WLS) when bracket sample sizes differ across deciles
export class ConsumptionRegressor {
  public fitLinear(income: number[], consumption: number[]): ConsumptionResult {
    const sampleCount = income.length;
    if (sampleCount !== consumption.length || sampleCount < 2) {
      throw new Error(
        "Income and consumption arrays must have identical lengths of at least 2 observations."
      );
    }

    let sumIncome = 0;
    let sumConsumption = 0;
    for (let i = 0; i < sampleCount; i++) {
      if (!Number.isFinite(income[i]) || !Number.isFinite(consumption[i])) {
        throw new Error(`Non-finite observation encountered at index ${i}.`);
      }
      sumIncome += income[i];
      sumConsumption += consumption[i];
    }

    const meanIncome = sumIncome / sampleCount;
    const meanConsumption = sumConsumption / sampleCount;

    let sumVarIncome = 0;
    let sumCovariance = 0;
    let sumVarConsumption = 0;
    for (let i = 0; i < sampleCount; i++) {
      const incomeDev = income[i] - meanIncome;
      const consumptionDev = consumption[i] - meanConsumption;
      sumVarIncome += incomeDev * incomeDev;
      sumCovariance += incomeDev * consumptionDev;
      sumVarConsumption += consumptionDev * consumptionDev;
    }

    if (sumVarIncome <= 1e-15) {
      throw new Error("Income observations have zero variance; OLS slope is undefined.");
    }

    const marginalPropensityToConsume = sumCovariance / sumVarIncome;
    const autonomousConsumption = meanConsumption - marginalPropensityToConsume * meanIncome;
    const rSquared =
      sumVarConsumption <= 1e-15
        ? 1.0
        : Math.max(
            0,
            Math.min(1, (sumCovariance * sumCovariance) / (sumVarIncome * sumVarConsumption))
          );

    return {
      autonomousConsumption,
      marginalPropensityToConsume,
      rSquared
    };
  }
}
