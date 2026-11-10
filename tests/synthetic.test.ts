import { describe, it, expect } from "vitest";
import {
  LogNormalDistribution,
  SinghMaddalaDistribution,
  DagumDistribution,
  PchipLorenzCurve,
  HybridLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  InequalityEngine
} from "../src/index.js";
import { validateQuantilePoints } from "../demo/src/validation.js";

describe("Synthetic Distribution Ground Truth and Convergence", () => {
  it("computes exact theoretical Gini for Log-Normal distribution", () => {
    const logNorm = new LogNormalDistribution(0.8);
    // erf(0.4) ~ 0.428392
    expect(logNorm.theoreticalGini).toBeCloseTo(0.428392, 4);

    const logNormLow = new LogNormalDistribution(0.5);
    // erf(0.25) ~ 0.276326
    expect(logNormLow.theoreticalGini).toBeCloseTo(0.276326, 4);
  });

  it("exhibits error decay as quantile resolution increases (k = 5, 10, 20, 100)", () => {
    const logNorm = new LogNormalDistribution(0.7);
    const gStar = logNorm.theoreticalGini;

    const resolutions = [5, 10, 20, 100];
    const errors: number[] = [];

    for (const k of resolutions) {
      const sample = logNorm.sampleQuantiles(k);
      const pchip = new PchipLorenzCurve(sample);
      const engine = new InequalityEngine(pchip, new SimpsonsIntegrator(), new BisectionSolver());
      const gEst = engine.computeGini(400).giniIndex;
      const err = Math.abs(gEst - gStar);
      errors.push(err);
    }

    // Verify monotonic decay of estimation error with respect to grid refinement
    expect(errors[1]).toBeLessThan(errors[0]); // k=10 vs k=5
    expect(errors[2]).toBeLessThan(errors[1]); // k=20 vs k=10
    expect(errors[3]).toBeLessThan(errors[2]); // k=100 vs k=20
    expect(errors[3]).toBeLessThan(0.001); // High precision at k=100
  });

  it("validates Singh-Maddala analytical Gini against numerical evaluation", () => {
    const sm = new SinghMaddalaDistribution(2.8, 1.7);
    expect(sm.theoreticalGini).toBeGreaterThan(0.25);
    expect(sm.theoreticalGini).toBeLessThan(0.55);

    const sample = sm.sampleQuantiles(20);
    const pchip = new PchipLorenzCurve(sample);
    const engine = new InequalityEngine(pchip, new SimpsonsIntegrator(), new BisectionSolver());
    const gEst = engine.computeGini(400).giniIndex;

    expect(Math.abs(gEst - sm.theoreticalGini)).toBeLessThan(0.02);
  });

  it("validates Dagum analytical Gini against numerical evaluation", () => {
    const dagum = new DagumDistribution(3.5, 0.7);
    expect(dagum.theoreticalGini).toBeGreaterThan(0.2);
    expect(dagum.theoreticalGini).toBeLessThan(0.5);

    const sample = dagum.sampleQuantiles(20);
    const pchip = new PchipLorenzCurve(sample);
    const engine = new InequalityEngine(pchip, new SimpsonsIntegrator(), new BisectionSolver());
    const gEst = engine.computeGini(400).giniIndex;

    expect(Math.abs(gEst - dagum.theoreticalGini)).toBeLessThan(0.05);
  });

  it("ensures 10 deciles of Singh-Maddala and Dagum strictly obey sub-diagonal property with no validation errors", () => {
    const sm = new SinghMaddalaDistribution(2.8, 1.7);
    const smSample = sm.sampleQuantiles(10, 24000);
    const smVal = validateQuantilePoints(smSample.points);
    expect(smVal.isValid).toBe(true);
    expect(smVal.errors).toHaveLength(0);

    for (const pt of smSample.points) {
      expect(pt.incomeShare).toBeLessThanOrEqual(pt.populationShare + 1e-9);
    }

    const dagum = new DagumDistribution(3.5, 0.7);
    const dagumSample = dagum.sampleQuantiles(10, 26000);
    const dagumVal = validateQuantilePoints(dagumSample.points);
    expect(dagumVal.isValid).toBe(true);
    expect(dagumVal.errors).toHaveLength(0);

    for (const pt of dagumSample.points) {
      expect(pt.incomeShare).toBeLessThanOrEqual(pt.populationShare + 1e-9);
    }
  });

  it("demonstrates Hybrid model achieves lower Gini estimation error than pure PCHIP on heavy-tailed distributions", () => {
    const logNorm = new LogNormalDistribution(0.7);
    const sample = logNorm.sampleQuantiles(10, 25000);
    const pchip = new PchipLorenzCurve(sample);
    const hybrid = new HybridLorenzCurve(sample, { bodyModel: pchip, splicePoint: 0.9 });

    const enginePchip = new InequalityEngine(
      pchip,
      new SimpsonsIntegrator(),
      new BisectionSolver()
    );
    const engineHybrid = new InequalityEngine(
      hybrid,
      new SimpsonsIntegrator(),
      new BisectionSolver()
    );

    const errPchip = Math.abs(enginePchip.computeGini(400).giniIndex - logNorm.theoreticalGini);
    const errHybrid = Math.abs(engineHybrid.computeGini(400).giniIndex - logNorm.theoreticalGini);

    expect(errHybrid).toBeLessThan(errPchip);
    expect(errPchip / errHybrid).toBeGreaterThan(2.0); // At least 2x better accuracy
  });
});
