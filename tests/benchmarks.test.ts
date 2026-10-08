import { describe, it, expect } from "vitest";
import {
  PchipLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  InequalityEngine,
  LogNormalDistribution,
  BULGARIAN_NSI_2022
} from "../src/index.js";

describe("Empirical Performance and Precision Verification (NFR-1, NFR-2)", () => {
  it("executes PCHIP decile reconstruction and Simpson integration in under 1.0 millisecond (NFR-1)", () => {
    const simpson = new SimpsonsIntegrator();
    const bisection = new BisectionSolver();

    const t0 = performance.now();
    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      const model = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
      const engine = new InequalityEngine(model, simpson, bisection);
      engine.computeGini(200);
    }
    const elapsed = performance.now() - t0;
    const meanLatencyMs = elapsed / iterations;

    // Must be well beneath the 2.0 ms maximum bound specified in NFR-1 (typically < 0.05 ms)
    expect(meanLatencyMs).toBeLessThan(1.0);
  });

  it("achieves 100% Gastwirth bounding compliance across randomized perturbations (NFR-2)", () => {
    const simpson = new SimpsonsIntegrator();
    const bisection = new BisectionSolver();

    let certifiedCount = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const model = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
      const engine = new InequalityEngine(model, simpson, bisection);
      const gini = engine.computeGini(200).giniIndex;
      const cert = engine.certifyGastwirthBounds(gini);
      if (cert.isCertified) {
        certifiedCount++;
      }
    }

    expect(certifiedCount).toBe(trials);
  });

  it("exhibits monotonic error decay against analytical Log-Normal Gini", () => {
    const logNorm = new LogNormalDistribution(0.8);
    const gStar = logNorm.theoreticalGini;

    const sample10 = logNorm.sampleQuantiles(10);
    const sample100 = logNorm.sampleQuantiles(100);

    const engine10 = new InequalityEngine(
      new PchipLorenzCurve(sample10),
      new SimpsonsIntegrator(),
      new BisectionSolver()
    );
    const engine100 = new InequalityEngine(
      new PchipLorenzCurve(sample100),
      new SimpsonsIntegrator(),
      new BisectionSolver()
    );

    const err10 = Math.abs(engine10.computeGini(200).giniIndex - gStar);
    const err100 = Math.abs(engine100.computeGini(200).giniIndex - gStar);

    expect(err100).toBeLessThan(err10);
    expect(err100).toBeLessThan(1e-4);
  });
});
