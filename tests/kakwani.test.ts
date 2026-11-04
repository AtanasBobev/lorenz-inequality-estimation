import { describe, it, expect } from "vitest";
import { KakwaniPodderCurve, QuantileDataset, SimpsonsIntegrator } from "../src/index.js";

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
});
