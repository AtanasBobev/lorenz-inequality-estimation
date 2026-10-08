import { describe, it, expect } from "vitest";
import {
  PchipLorenzCurve,
  HybridLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  InequalityEngine,
  CENSUS_BENCHMARK_CATALOG,
  BULGARIAN_NSI_2022,
  EUROSTAT_EU27_2022,
  US_CENSUS_CPS_2022
} from "../src/index.js";

describe("Empirical Census Dataset Reconstruction", () => {
  it("preserves strict monotonicity and convexity on all benchmark datasets", () => {
    for (const entry of CENSUS_BENCHMARK_CATALOG) {
      const pchip = new PchipLorenzCurve(entry.dataset);
      expect(pchip.isMonotonic(200)).toBe(true);
      expect(pchip.isConvex(200)).toBe(true);
    }
  });

  it("reconstructs Bulgarian NSI 2022 Gini coefficient matching official statistical releases", () => {
    const pchip = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
    const engine = new InequalityEngine(pchip, new SimpsonsIntegrator(), new BisectionSolver());

    const gini = engine.computeGini(200).giniIndex;
    const official = BULGARIAN_NSI_2022.metadata.officialGini;

    // Grouped 10-decile reconstruction approximates microdata within Gastwirth error envelope (+/- 0.035)
    expect(Math.abs(gini - official)).toBeLessThan(0.035);
    const cert = engine.certifyGastwirthBounds(gini);
    expect(cert.isCertified).toBe(true);
  });

  it("reconstructs Eurostat EU-27 2022 Gini coefficient matching published figures", () => {
    const pchip = new PchipLorenzCurve(EUROSTAT_EU27_2022.dataset);
    const engine = new InequalityEngine(pchip, new SimpsonsIntegrator(), new BisectionSolver());

    const gini = engine.computeGini(200).giniIndex;
    const official = EUROSTAT_EU27_2022.metadata.officialGini;

    expect(Math.abs(gini - official)).toBeLessThan(0.035);
    const cert = engine.certifyGastwirthBounds(gini);
    expect(cert.isCertified).toBe(true);
  });

  it("reconstructs US Census CPS 2022 Gini coefficient matching official benchmarks", () => {
    const pchip = new PchipLorenzCurve(US_CENSUS_CPS_2022.dataset);
    const hybrid = new HybridLorenzCurve(US_CENSUS_CPS_2022.dataset);
    const engine = new InequalityEngine(pchip, new SimpsonsIntegrator(), new BisectionSolver());

    const giniPchip = engine.computeGini(200).giniIndex;
    const official = US_CENSUS_CPS_2022.metadata.officialGini;

    // US inequality is high with a heavy Pareto tail
    expect(Math.abs(giniPchip - official)).toBeLessThan(0.015);

    // Hybrid Pareto tail captures upper-tail skewness
    const tailAlpha = hybrid.getTailAlpha();
    expect(tailAlpha).toBeGreaterThan(1.0);
  });
});
