import { ConsumptionResult } from "../core/types.js";

// Fits Keynesian consumption functions: C = C_0 + c * Y
// Computes marginal propensity to consume (MPC = dC/dY = c) via ordinary least squares
export class ConsumptionRegressor {
  // Fits linear consumption model C = C_0 + c * Y
  public fitLinear(income: number[], consumption: number[]): ConsumptionResult {
    const n = income.length;
    if (n !== consumption.length || n < 2) {
      throw new Error(
        "Income and consumption arrays must have identical lengths of at least 2 observations."
      );
    }

    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(income[i]) || !Number.isFinite(consumption[i])) {
        throw new Error(`Non-finite observation encountered at index ${i}.`);
      }
      sumX += income[i];
      sumY += consumption[i];
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = income[i] - meanX;
      const dy = consumption[i] - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }

    if (sxx <= 1e-15) {
      throw new Error("Income observations have zero variance; OLS slope is undefined.");
    }

    const marginalPropensityToConsume = sxy / sxx;
    const autonomousConsumption = meanY - marginalPropensityToConsume * meanX;
    const rSquared = syy <= 1e-15 ? 1.0 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));

    return {
      autonomousConsumption,
      marginalPropensityToConsume,
      rSquared
    };
  }
}
