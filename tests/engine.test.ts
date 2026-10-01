import { describe, it, expect } from "vitest";
import {
  InequalityEngine,
  PchipLorenzCurve,
  SimpsonsIntegrator,
  TrapezoidalIntegrator,
  BisectionSolver,
  NewtonRaphsonSolver,
  QuantileDataset
} from "../src/index.js";

const dataset: QuantileDataset = {
  points: [
    { populationShare: 0.0, incomeShare: 0.0 },
    { populationShare: 0.2, incomeShare: 0.06 },
    { populationShare: 0.4, incomeShare: 0.16 },
    { populationShare: 0.6, incomeShare: 0.32 },
    { populationShare: 0.8, incomeShare: 0.56 },
    { populationShare: 1.0, incomeShare: 1.0 }
  ],
  meanIncome: 50000
};

describe("InequalityEngine", () => {
  const model = new PchipLorenzCurve(dataset);
  const simpson = new SimpsonsIntegrator();
  const trapezoid = new TrapezoidalIntegrator();
  const bisection = new BisectionSolver();
  const newton = new NewtonRaphsonSolver();

  it("computes Gini index and area under curve", () => {
    const engine = new InequalityEngine(model, simpson, bisection);
    const gini = engine.computeGini(100);

    expect(gini.giniIndex).toBeGreaterThan(0);
    expect(gini.giniIndex).toBeLessThan(1);
    expect(gini.areaUnderCurve).toBeGreaterThan(0);
    expect(gini.areaUnderCurve).toBeLessThan(0.5);
  });

  it("computes Sen welfare index W = mu * (1 - G)", () => {
    const engine = new InequalityEngine(model, simpson, bisection);
    const welfare = engine.computeSenWelfare(100);

    expect(welfare.meanIncome).toBe(50000);
    expect(welfare.senWelfareIndex).toBeCloseTo(50000 * (1 - welfare.giniIndex), 6);
  });

  it("inverts Lorenz curve using root finder to locate population percentiles", () => {
    const engine = new InequalityEngine(model, simpson, bisection);

    // Finding percentile holding 16% share (should be 0.4)
    const p40 = engine.findPercentileHoldingShare(0.16);
    expect(p40).toBeCloseTo(0.4, 3);

    // Finding percentile holding 56% share (should be 0.8)
    const p80 = engine.findPercentileHoldingShare(0.56);
    expect(p80).toBeCloseTo(0.8, 3);
  });

  it("allows dynamic swapping of integrators and solvers", () => {
    const engine = new InequalityEngine(model, simpson, bisection);

    const giniSimpson = engine.computeGini(100).giniIndex;

    engine.setIntegrator(trapezoid);
    const giniTrapezoid = engine.computeGini(100).giniIndex;

    // Trapezoidal rule chords lie above the convex curve, resulting in lower Gini
    expect(giniTrapezoid).toBeLessThan(giniSimpson);

    engine.setRootFinder(newton);
    const pNewton = engine.findPercentileHoldingShare(0.32);
    expect(pNewton).toBeCloseTo(0.6, 3);
  });

  it("evaluates income at percentiles via quantile function", () => {
    const engine = new InequalityEngine(model, simpson, bisection);

    const incMedian = engine.getIncomeAtPercentile(0.5);
    const incTop = engine.getIncomeAtPercentile(0.9);

    expect(incMedian).toBeGreaterThan(0);
    expect(incTop).toBeGreaterThan(incMedian);
  });
});
