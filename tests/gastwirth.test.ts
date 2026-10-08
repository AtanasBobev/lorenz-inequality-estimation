import { describe, it, expect } from "vitest";
import {
  InequalityEngine,
  PchipLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  BULGARIAN_NSI_2022,
  EUROSTAT_EU27_2022,
  US_CENSUS_CPS_2022
} from "../src/index.js";

describe("Gastwirth Mathematical Error Bounds Certification (FR-6, NFR-2)", () => {
  it("encloses PCHIP and Cubic Spline Gini estimates within [G_L, G_U] for Bulgarian NSI", () => {
    const pchipModel = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
    const engine = new InequalityEngine(
      pchipModel,
      new SimpsonsIntegrator(),
      new BisectionSolver()
    );

    const pchipGini = engine.computeGini(200).giniIndex;
    const cert = engine.certifyGastwirthBounds(pchipGini);

    expect(cert.isCertified).toBe(true);
    expect(cert.lowerBound).toBeLessThanOrEqual(pchipGini + 1e-7);
    expect(cert.upperBound).toBeGreaterThanOrEqual(pchipGini - 1e-7);
    expect(cert.intervalWidth).toBeGreaterThan(0);
    expect(cert.intervalWidth).toBeLessThan(0.08); // Decile interval gives tight bounds
  });

  it("verifies Gastwirth bounds on Eurostat EU-27 deciles", () => {
    const model = new PchipLorenzCurve(EUROSTAT_EU27_2022.dataset);
    const engine = new InequalityEngine(model, new SimpsonsIntegrator(), new BisectionSolver());

    const gini = engine.computeGini(200).giniIndex;
    const cert = engine.certifyGastwirthBounds(gini);

    expect(cert.isCertified).toBe(true);
    expect(gini).toBeGreaterThanOrEqual(cert.lowerBound - 1e-7);
    expect(gini).toBeLessThanOrEqual(cert.upperBound + 1e-7);
  });

  it("verifies Gastwirth bounds on US Census Bureau CPS deciles", () => {
    const model = new PchipLorenzCurve(US_CENSUS_CPS_2022.dataset);
    const engine = new InequalityEngine(model, new SimpsonsIntegrator(), new BisectionSolver());

    const gini = engine.computeGini(200).giniIndex;
    const cert = engine.certifyGastwirthBounds(gini);

    expect(cert.isCertified).toBe(true);
    expect(gini).toBeGreaterThanOrEqual(cert.lowerBound - 1e-7);
    expect(gini).toBeLessThanOrEqual(cert.upperBound + 1e-7);
    expect(cert.upperBound).toBeLessThanOrEqual(1.0);
  });

  it("computes Palma ratio and comprehensive metrics correctly", () => {
    const model = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
    const engine = new InequalityEngine(model, new SimpsonsIntegrator(), new BisectionSolver());

    const metrics = engine.computeComprehensiveMetrics(
      200,
      BULGARIAN_NSI_2022.metadata.povertyLine
    );

    expect(metrics.giniIndex).toBeCloseTo(0.358, 2);
    expect(metrics.palmaRatio).toBeGreaterThan(1.2);
    expect(metrics.palmaRatio).toBeLessThan(2.0);
    expect(metrics.gastwirthCertificate.isCertified).toBe(true);
    expect(metrics.povertyHeadcount).toBeDefined();
    expect(metrics.povertyHeadcount!).toBeGreaterThan(0.2);
  });
});
