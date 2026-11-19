import { describe, it, expect } from "vitest";
import {
  InequalityEngine,
  LorenzModel,
  PchipLorenzCurve,
  CubicSplineLorenzCurve,
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

  it("handles getters, setters, Palma edge cases, and invalid share/income inputs", () => {
    const engine = new InequalityEngine(model, simpson, bisection);
    expect(engine.getModel()).toBe(model);
    expect(engine.getIntegrator()).toBe(simpson);
    expect(engine.getRootFinder()).toBe(bisection);

    const altModel = new CubicSplineLorenzCurve(dataset);
    engine.setModel(altModel);
    expect(engine.getModel()).toBe(altModel);

    const cert = engine.certifyGastwirthBounds();
    expect(cert.isCertified).toBe(true);

    expect(() => engine.findPercentileHoldingShare(-0.1)).toThrow();
    expect(() => engine.findPercentileHoldingShare(1.2)).toThrow();
    expect(() => engine.getPovertyHeadcount(1000, 0)).toThrow();
    expect(() => engine.computePovertyElasticities(1000, -50)).toThrow();

    // Dataset where bottom 40% holds 0 income share -> Palma ratio is Infinity
    const zeroBottomDataset: QuantileDataset = {
      meanIncome: 10000,
      points: [
        { populationShare: 0.0, incomeShare: 0.0 },
        { populationShare: 0.4, incomeShare: 0.0 },
        { populationShare: 0.8, incomeShare: 0.4 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const zeroBottomEngine = new InequalityEngine(
      new PchipLorenzCurve(zeroBottomDataset),
      simpson,
      bisection
    );
    expect(zeroBottomEngine.computePalmaRatio()).toBe(Infinity);
  });

  it("handles flat curvature and iteration limits in getPovertyHeadcount", () => {
    // Linear Lorenz curve L(p) = p^2 on [0, 0.5] and flat curvature L''(p) = 0 test model
    class PiecewiseLinearLorenz extends LorenzModel {
      public evaluate(p: number): number {
        return p <= 0.5 ? 0.5 * p : 0.25 + 1.5 * (p - 0.5);
      }
      public derivative(p: number): number {
        return p <= 0.5 ? 0.5 + 1e-4 * p : 1.5 + 1e-4 * p;
      }
      public secondDerivative(): number {
        return 0; // Forces bisection fallback inside getPovertyHeadcount
      }
    }

    const customModel = new PiecewiseLinearLorenz({
      meanIncome: 10000,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.5, incomeShare: 0.25 },
        { populationShare: 1, incomeShare: 1 }
      ]
    });
    const engine = new InequalityEngine(customModel, simpson, bisection);

    // Bracket width termination with large tolerance
    const hBracket = engine.getPovertyHeadcount(10000, 10000, 0.2, 60);
    expect(hBracket).toBeGreaterThan(0);

    // Max-iterations termination with tiny tolerance and 1 iteration
    const hMaxIter = engine.getPovertyHeadcount(10000, 10000, 1e-15, 1);
    expect(hMaxIter).toBeGreaterThan(0);
  });

  it("validates LorenzModel base invariants and detects monotonicity/convexity violations", () => {
    expect(() => model.topShare(0)).toThrow();
    expect(() => model.topShare(1)).toThrow();

    expect(
      () =>
        new PchipLorenzCurve({
          meanIncome: 10000,
          points: [{ populationShare: 0, incomeShare: 0 }]
        })
    ).toThrow(/at least 2 points/);

    expect(
      () =>
        new PchipLorenzCurve({
          meanIncome: 0,
          points: [
            { populationShare: 0, incomeShare: 0 },
            { populationShare: 1, incomeShare: 1 }
          ]
        })
    ).toThrow(/Mean income must be positive/);

    expect(
      () =>
        new PchipLorenzCurve({
          meanIncome: 10000,
          points: [
            { populationShare: 0.1, incomeShare: 0 },
            { populationShare: 1, incomeShare: 1 }
          ]
        })
    ).toThrow(/First knot must start at \(0, 0\)/);

    expect(
      () =>
        new PchipLorenzCurve({
          meanIncome: 10000,
          points: [
            { populationShare: 0, incomeShare: 0 },
            { populationShare: 0.9, incomeShare: 1 }
          ]
        })
    ).toThrow(/Last knot must end at \(1, 1\)/);

    expect(
      () =>
        new PchipLorenzCurve({
          meanIncome: 10000,
          points: [
            { populationShare: 0, incomeShare: 0 },
            { populationShare: 0.5, incomeShare: 0.2 },
            { populationShare: 0.5, incomeShare: 0.4 },
            { populationShare: 1, incomeShare: 1 }
          ]
        })
    ).toThrow(/strictly increasing/);

    expect(
      () =>
        new PchipLorenzCurve({
          meanIncome: 10000,
          points: [
            { populationShare: 0, incomeShare: 0 },
            { populationShare: 0.5, incomeShare: 0.4 },
            { populationShare: 0.8, incomeShare: 0.3 },
            { populationShare: 1, incomeShare: 1 }
          ]
        })
    ).toThrow(/non-decreasing/);

    // Steeply censored jump where natural cubic spline overshoots (violates monotonicity & convexity)
    const extremeJumpDataset: QuantileDataset = {
      meanIncome: 10000,
      points: [
        { populationShare: 0.0, incomeShare: 0.0 },
        { populationShare: 0.1, incomeShare: 0.0 },
        { populationShare: 0.9, incomeShare: 0.01 },
        { populationShare: 1.0, incomeShare: 1.0 }
      ]
    };
    const oscillatingSpline = new CubicSplineLorenzCurve(extremeJumpDataset);
    expect(oscillatingSpline.isMonotonic(200)).toBe(false);
    expect(oscillatingSpline.isConvex(200)).toBe(false);
    expect(oscillatingSpline.findConvexityViolations(200).length).toBeGreaterThan(0);
  });
});
