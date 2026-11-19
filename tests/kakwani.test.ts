import { describe, it, expect } from "vitest";
import {
  KakwaniPodderCurve,
  ConsumptionRegressor,
  QuantileDataset,
  SimpsonsIntegrator
} from "../src/index.js";

describe("KakwaniPodderCurve Parametric Benchmark", () => {
  const decileDataset: QuantileDataset = {
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.1, incomeShare: 0.031 },
      { populationShare: 0.2, incomeShare: 0.072 },
      { populationShare: 0.3, incomeShare: 0.121 },
      { populationShare: 0.4, incomeShare: 0.178 },
      { populationShare: 0.5, incomeShare: 0.244 },
      { populationShare: 0.6, incomeShare: 0.321 },
      { populationShare: 0.7, incomeShare: 0.412 },
      { populationShare: 0.8, incomeShare: 0.523 },
      { populationShare: 0.9, incomeShare: 0.672 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ],
    meanIncome: 45000
  };

  it("fits parameters a, alpha, beta with high R-squared", () => {
    const model = new KakwaniPodderCurve(decileDataset);
    expect(model.params.a).toBeGreaterThan(0);
    expect(model.params.alpha).toBeGreaterThan(0);
    expect(model.params.beta).toBeGreaterThan(0);
    expect(model.params.rSquared).toBeGreaterThan(0.95);
  });

  it("satisfies endpoint boundaries L(0) = 0 and L(1) = 1", () => {
    const model = new KakwaniPodderCurve(decileDataset);
    expect(model.evaluate(0)).toBe(0);
    expect(model.evaluate(1)).toBe(1);
  });

  it("preserves monotonicity across population domain", () => {
    const model = new KakwaniPodderCurve(decileDataset);
    expect(model.isMonotonic(100)).toBe(true);
  });

  it("evaluates Gini coefficient via numerical quadrature", () => {
    const model = new KakwaniPodderCurve(decileDataset);
    const integrator = new SimpsonsIntegrator();
    const result = integrator.integrate(model, 0, 1, 200);
    expect(result.giniIndex).toBeGreaterThan(0.25);
    expect(result.giniIndex).toBeLessThan(0.45);
  });

  it("handles second derivatives, sparse/collinear datasets, and ConsumptionRegressor edge cases", () => {
    const model = new KakwaniPodderCurve(decileDataset);
    expect(model.secondDerivative(0)).toBe(0);
    expect(model.secondDerivative(1)).toBe(0);
    expect(model.secondDerivative(0.5)).toBeGreaterThan(0);

    // Fewer than 3 valid interior points triggers fallback parameters
    const sparseDataset: QuantileDataset = {
      meanIncome: 20000,
      points: [
        { populationShare: 0.0, incomeShare: 0.0 },
        { populationShare: 0.5, incomeShare: 0.25 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const sparseModel = new KakwaniPodderCurve(sparseDataset);
    expect(sparseModel.params.alpha).toBe(0.8);

    // Near-collinear interior knots (spaced by 1e-6) trigger determinant < 1e-12 fallback
    const collinearDataset: QuantileDataset = {
      meanIncome: 20000,
      points: [
        { populationShare: 0.0, incomeShare: 0.0 },
        { populationShare: 0.5, incomeShare: 0.25 },
        { populationShare: 0.500001, incomeShare: 0.250001 },
        { populationShare: 0.500002, incomeShare: 0.250002 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const collinearModel = new KakwaniPodderCurve(collinearDataset);
    expect(collinearModel.params.rSquared).toBe(0.9);

    // Constant egalitarian gap (p_i - L_i = 0.1) gives totalSumSquares = 0 -> rSquared = 1.0
    const constantGapDataset: QuantileDataset = {
      meanIncome: 20000,
      points: [
        { populationShare: 0.0, incomeShare: 0.0 },
        { populationShare: 0.2, incomeShare: 0.1 },
        { populationShare: 0.5, incomeShare: 0.4 },
        { populationShare: 0.8, incomeShare: 0.7 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const constantGapModel = new KakwaniPodderCurve(constantGapDataset);
    expect(constantGapModel.params.rSquared).toBe(1.0);

    const regressor = new ConsumptionRegressor();
    expect(() => regressor.fitLinear([100], [80])).toThrow(/at least 2 observations/);
    expect(() => regressor.fitLinear([100, Number.NaN], [80, 90])).toThrow(/Non-finite/);
    expect(() => regressor.fitLinear([100, 100, 100], [80, 90, 100])).toThrow(/zero variance/);

    const flatConsumption = regressor.fitLinear([100, 200, 300], [50, 50, 50]);
    expect(flatConsumption.rSquared).toBe(1.0);
  });
});
