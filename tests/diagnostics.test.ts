import { describe, it, expect } from "vitest";
import {
  PchipLorenzCurve,
  HybridLorenzCurve,
  InequalityEngine,
  SimpsonsIntegrator,
  BisectionSolver,
  SensitivityAnalyzer,
  BULGARIAN_NSI_2022,
  US_CENSUS_CPS_2022,
  EUROSTAT_EU27_2022
} from "../src/index.js";

describe("Econometric Diagnostics & Sensitivity Analysis (Week 7)", () => {
  const integrator = new SimpsonsIntegrator();
  const solver = new BisectionSolver();

  describe("Top-Income Share Decomposition", () => {
    it("should calculate monotonically decreasing upper-tail wealth shares", () => {
      const pchip = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
      const engine = new InequalityEngine(pchip, integrator, solver);
      const shares = engine.computeTopIncomeShares();

      expect(shares.top10PercentShare).toBeGreaterThan(shares.top5PercentShare);
      expect(shares.top5PercentShare).toBeGreaterThan(shares.top1PercentShare);
      expect(shares.top1PercentShare).toBeGreaterThan(shares.top01PercentShare);
      expect(shares.top01PercentShare).toBeGreaterThan(shares.top001PercentShare);

      // Verify bounds [0, 1]
      expect(shares.top10PercentShare).toBeGreaterThan(0.2);
      expect(shares.top10PercentShare).toBeLessThan(0.5);
      expect(shares.bottom40PercentShare).toBeGreaterThan(0.1);
      expect(shares.middle40PercentShare).toBeGreaterThan(0.2);
    });

    it("should demonstrate heavy-tail recovery under Hybrid Pareto model compared to pure spline", () => {
      const pchip = new PchipLorenzCurve(US_CENSUS_CPS_2022.dataset);
      const hybrid = new HybridLorenzCurve(US_CENSUS_CPS_2022.dataset, {
        bodyModel: pchip,
        splicePoint: 0.8
      });

      const engineSpline = new InequalityEngine(pchip, integrator, solver);
      const engineHybrid = new InequalityEngine(hybrid, integrator, solver);

      const sharesSpline = engineSpline.computeTopIncomeShares();
      const sharesHybrid = engineHybrid.computeTopIncomeShares();

      // In the US dataset, Pareto tail splicing captures extreme upper-income concentration:
      // Top 1% share must be strictly higher under hybrid Pareto than under decaying cubic Hermite polynomial
      expect(sharesHybrid.top1PercentShare).toBeGreaterThan(sharesSpline.top1PercentShare);
      expect(sharesHybrid.top01PercentShare).toBeGreaterThan(sharesSpline.top01PercentShare);
    });
  });

  describe("Poverty Headcount Elasticities", () => {
    it("should verify degree-0 homogeneity and analytical reflection (epsilon_mu = -epsilon_z)", () => {
      const pchip = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
      const engine = new InequalityEngine(pchip, integrator, solver);
      const povertyLine = 3092; // Official Bulgarian annual poverty line (EUR)
      const el = engine.computePovertyElasticities(povertyLine);

      expect(el.povertyHeadcount).toBeGreaterThan(0.2);
      expect(el.povertyHeadcount).toBeLessThan(0.4);

      // Higher poverty threshold increases headcount (dH/dz > 0, elasticityZ > 0)
      expect(el.dH_dz).toBeGreaterThan(0);
      expect(el.elasticityZ).toBeGreaterThan(0);

      // Higher mean income decreases headcount (dH/dmu < 0, elasticityMu < 0)
      expect(el.dH_dmu).toBeLessThan(0);
      expect(el.elasticityMu).toBeLessThan(0);

      // Homogeneity: elasticityMu should equal -elasticityZ within floating-point tolerance
      expect(el.elasticityMu).toBeCloseTo(-el.elasticityZ, 2);
    });

    it("should safely handle boundary and zero poverty thresholds", () => {
      const pchip = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
      const engine = new InequalityEngine(pchip, integrator, solver);

      const elZero = engine.computePovertyElasticities(0);
      expect(elZero.povertyHeadcount).toBe(0);
      expect(elZero.elasticityZ).toBe(0);
      expect(elZero.elasticityMu).toBe(0);

      const elNeg = engine.computePovertyElasticities(-100);
      expect(elNeg.povertyHeadcount).toBe(0);
    });
  });

  describe("Pareto Splice Knot Sensitivity Sweeps", () => {
    it("should sweep p* from 0.60 to 0.95 with full Gastwirth certification", () => {
      const sweep = SensitivityAnalyzer.sweepParetoSplice(
        BULGARIAN_NSI_2022.dataset,
        0.6,
        0.9,
        0.05,
        "pchip"
      );

      expect(sweep.length).toBeGreaterThan(4);
      for (const pt of sweep) {
        expect(pt.tailAlpha).toBeGreaterThan(1.0);
        expect(pt.giniIndex).toBeGreaterThan(0.3);
        expect(pt.giniIndex).toBeLessThan(0.45);
        expect(pt.isCertified).toBe(true);
        expect(pt.top1PercentShare).toBeGreaterThan(0);
      }
    });

    it("should compute poverty sensitivity tables across diverse thresholds", () => {
      const pchip = new PchipLorenzCurve(EUROSTAT_EU27_2022.dataset);
      const thresholds = [8000, 10000, 12300, 15000];
      const table = SensitivityAnalyzer.computePovertySensitivityTable(pchip, thresholds);

      expect(table.length).toBe(4);
      for (let i = 1; i < table.length; i++) {
        // Headcount should strictly increase with higher poverty threshold
        expect(table[i].povertyHeadcount).toBeGreaterThan(table[i - 1].povertyHeadcount);
      }
    });
  });

  describe("World Inequality Database (WID) Administrative Benchmarking", () => {
    it("should confirm hybrid model reduces error against WID top 1% wealth share", () => {
      const pchip = new PchipLorenzCurve(US_CENSUS_CPS_2022.dataset);
      const hybrid = new HybridLorenzCurve(US_CENSUS_CPS_2022.dataset, {
        bodyModel: pchip,
        splicePoint: 0.8
      });

      const comp = SensitivityAnalyzer.compareWithWID("us_census", pchip, hybrid);

      expect(comp.widTop1).toBe(0.191);
      // Hybrid tail model should be substantially closer to administrative WID microdata benchmark
      expect(comp.hybridTop1).toBeGreaterThan(comp.splineTop1);
      expect(comp.top1ErrorHybrid).toBeLessThan(comp.top1ErrorSpline);
    });
  });
});
