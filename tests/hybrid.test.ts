import { describe, it, expect } from "vitest";
import {
  ParetoLorenzCurve,
  HybridLorenzCurve,
  PchipLorenzCurve,
  QuantileDataset,
  SimpsonsIntegrator
} from "../src/index.js";

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
  meanIncome: 42000
};

describe("ParetoLorenzCurve", () => {
  it("evaluates endpoints exactly", () => {
    const pareto = new ParetoLorenzCurve(decileDataset, 2.0);
    expect(pareto.evaluate(0)).toBe(0);
    expect(pareto.evaluate(1)).toBe(1);
  });

  it("satisfies monotonicity and convexity for alpha > 1", () => {
    const pareto = new ParetoLorenzCurve(decileDataset, 2.5);
    expect(pareto.isMonotonic(100)).toBe(true);
    expect(pareto.isConvex(100)).toBe(true);
  });

  it("matches analytical Gini index with numerical quadrature", () => {
    const alpha = 2.0;
    const pareto = new ParetoLorenzCurve(decileDataset, alpha);
    const expectedGini = 1 / (2 * alpha - 1); // 1 / 3 = 0.3333333333

    expect(pareto.analyticalGini()).toBeCloseTo(expectedGini, 10);

    const simpson = new SimpsonsIntegrator();
    const numGini = simpson.integrate(pareto, 0, 1, 200).giniIndex;
    expect(numGini).toBeCloseTo(expectedGini, 3);
  });

  it("throws error for alpha <= 1", () => {
    expect(() => new ParetoLorenzCurve(decileDataset, 1.0)).toThrow();
    expect(() => new ParetoLorenzCurve(decileDataset, 0.5)).toThrow();
  });
});

describe("HybridLorenzCurve", () => {
  it("preserves C0 continuity at the splice point", () => {
    const pStar = 0.8;
    const pchip = new PchipLorenzCurve(decileDataset);
    const hybrid = new HybridLorenzCurve(decileDataset, {
      bodyModel: pchip,
      splicePoint: pStar
    });

    const lBody = pchip.evaluate(pStar);
    const lHybrid = hybrid.evaluate(pStar);
    const lJustBefore = hybrid.evaluate(pStar - 1e-6);
    const lJustAfter = hybrid.evaluate(pStar + 1e-6);

    expect(lHybrid).toBeCloseTo(lBody, 9);
    expect(lJustBefore).toBeLessThan(lHybrid);
    expect(lHybrid).toBeLessThan(lJustAfter);
  });

  it("preserves C1 continuity across the splice point", () => {
    const pStar = 0.8;
    const pchip = new PchipLorenzCurve(decileDataset);
    const hybrid = new HybridLorenzCurve(decileDataset, {
      bodyModel: pchip,
      splicePoint: pStar
    });

    const dBody = pchip.derivative(pStar);
    const dTail = hybrid.derivative(pStar + 1e-7);

    expect(dTail).toBeCloseTo(dBody, 3);
  });

  it("maintains strict monotonicity and convexity", () => {
    const hybrid = new HybridLorenzCurve(decileDataset, { splicePoint: 0.8 });
    expect(hybrid.isMonotonic(150)).toBe(true);
    expect(hybrid.isConvex(150)).toBe(true);
  });

  it("matches analytical hybrid area with composite Simpson integration", () => {
    const hybrid = new HybridLorenzCurve(decileDataset, { splicePoint: 0.8 });
    const analyticalArea = hybrid.analyticalTotalArea(200);

    const simpson = new SimpsonsIntegrator();
    const numericalArea = simpson.integrate(hybrid, 0, 1, 200).areaUnderCurve;

    expect(analyticalArea).toBeCloseTo(numericalArea, 3);
  });

  it("evaluates quantile incomes correctly in both regimes", () => {
    const hybrid = new HybridLorenzCurve(decileDataset, { splicePoint: 0.8 });
    const incMedian = hybrid.quantileIncome(0.5);
    const incTop5 = hybrid.quantileIncome(0.95);

    expect(incMedian).toBeGreaterThan(0);
    expect(incTop5).toBeGreaterThan(incMedian);
  });

  it("covers ParetoLorenzCurve and HybridLorenzCurve getters, analytical integrals, and edge cases", () => {
    // ParetoLorenzCurve with automatic alpha estimation from dataset
    const autoPareto = new ParetoLorenzCurve(decileDataset);
    expect(autoPareto.getAlpha()).toBeGreaterThan(1.0);
    expect(autoPareto.derivative(0)).toBeCloseTo(1 - 1 / autoPareto.getAlpha(), 8);
    expect(autoPareto.secondDerivative(0.5)).toBeGreaterThan(0);
    expect(autoPareto.analyticalAreaUnderCurve()).toBeCloseTo(
      (1 - autoPareto.analyticalGini()) / 2,
      8
    );

    // ParetoLorenzCurve fallback when reference knot has 0 income share or diagonal ratio
    const zeroRefDataset: QuantileDataset = {
      meanIncome: 10000,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.8, incomeShare: 0 },
        { populationShare: 1, incomeShare: 1 }
      ]
    };
    expect(new ParetoLorenzCurve(zeroRefDataset).getAlpha()).toBe(2.0);

    const diagonalRefDataset: QuantileDataset = {
      meanIncome: 10000,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.8, incomeShare: 0.8 },
        { populationShare: 1, incomeShare: 1 }
      ]
    };
    expect(new ParetoLorenzCurve(diagonalRefDataset).getAlpha()).toBe(2.0);

    // HybridLorenzCurve getters, explicit tailAlpha, 3-knot default splice, and odd subinterval count
    const explicitHybrid = new HybridLorenzCurve(decileDataset, {
      splicePoint: 0.8,
      tailAlpha: 2.2
    });
    expect(explicitHybrid.getSplicePoint()).toBe(0.8);
    expect(explicitHybrid.getTailAlpha()).toBe(2.2);
    expect(explicitHybrid.getBodyModel()).toBeDefined();
    expect(explicitHybrid.analyticalGini(201)).toBeGreaterThan(0.2);

    expect(() => new HybridLorenzCurve(decileDataset, { splicePoint: 0 })).toThrow(/Splice point/);
    expect(() => new HybridLorenzCurve(decileDataset, { splicePoint: 1 })).toThrow(/Splice point/);
    expect(() => new HybridLorenzCurve(decileDataset, { tailAlpha: 0.9 })).toThrow(/Tail alpha/);

    const threeKnotDataset: QuantileDataset = {
      meanIncome: 10000,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.8, incomeShare: 1.0 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const flatTopHybrid = new HybridLorenzCurve(threeKnotDataset);
    expect(flatTopHybrid.getSplicePoint()).toBe(0.8);
    expect(flatTopHybrid.getTailAlpha()).toBe(2.0);

    // Dataset where spline derivative at p* exceeds tail secant slope -> triggers clamped derivative
    const steepMidDataset: QuantileDataset = {
      meanIncome: 10000,
      points: [
        { populationShare: 0.0, incomeShare: 0.0 },
        { populationShare: 0.4, incomeShare: 0.01 },
        { populationShare: 0.8, incomeShare: 0.79 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const clampedHybrid = new HybridLorenzCurve(steepMidDataset, { splicePoint: 0.8 });
    expect(clampedHybrid.getTailAlpha()).toBeGreaterThan(1.05);
  });
});
