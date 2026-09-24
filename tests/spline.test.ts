import { describe, it, expect } from "vitest";
import { CubicSplineLorenzCurve, PchipLorenzCurve, QuantileDataset } from "../src/index.js";

describe("CubicSplineLorenzCurve and PchipLorenzCurve", () => {
  const sampleCensusDataset: QuantileDataset = {
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.2, incomeShare: 0.04 },
      { populationShare: 0.4, incomeShare: 0.12 },
      { populationShare: 0.6, incomeShare: 0.25 },
      { populationShare: 0.8, incomeShare: 0.48 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ],
    meanIncome: 45000
  };

  describe("CubicSplineLorenzCurve (Natural)", () => {
    const naturalSpline = new CubicSplineLorenzCurve(sampleCensusDataset, {
      boundaryType: "natural"
    });

    it("interpolates all quantile knots exactly", () => {
      for (const point of sampleCensusDataset.points) {
        expect(naturalSpline.evaluate(point.populationShare)).toBeCloseTo(point.incomeShare, 9);
      }
    });

    it("satisfies natural boundary conditions M_0 = 0 and M_n = 0", () => {
      const secondDerivs = naturalSpline.getSecondDerivatives();
      expect(secondDerivs[0]).toBeCloseTo(0.0, 9);
      expect(secondDerivs[secondDerivs.length - 1]).toBeCloseTo(0.0, 9);
    });

    it("verifies C1 slope continuity across internal knots", () => {
      const eps = 1e-6;
      for (let i = 1; i < sampleCensusDataset.points.length - 1; i++) {
        const pKnot = sampleCensusDataset.points[i].populationShare;
        const leftSlope = naturalSpline.derivative(pKnot - eps);
        const rightSlope = naturalSpline.derivative(pKnot + eps);
        expect(leftSlope).toBeCloseTo(rightSlope, 4);
      }
    });

    it("clamps out-of-range population inputs", () => {
      expect(naturalSpline.evaluate(-0.5)).toBeCloseTo(0.0, 9);
      expect(naturalSpline.evaluate(1.5)).toBeCloseTo(1.0, 9);
    });
  });

  describe("CubicSplineLorenzCurve (Clamped)", () => {
    const clampedSpline = new CubicSplineLorenzCurve(sampleCensusDataset, {
      boundaryType: "clamped",
      clampStartSlope: 0.1,
      clampEndSlope: 3.5
    });

    it("enforces specified boundary slopes at p = 0 and p = 1", () => {
      expect(clampedSpline.derivative(0.0)).toBeCloseTo(0.1, 7);
      expect(clampedSpline.derivative(1.0)).toBeCloseTo(3.5, 7);
    });

    it("interpolates all knots accurately under clamped boundaries", () => {
      for (const point of sampleCensusDataset.points) {
        expect(clampedSpline.evaluate(point.populationShare)).toBeCloseTo(point.incomeShare, 9);
      }
    });
  });

  describe("PchipLorenzCurve with Convexity Enforcement", () => {
    const pchip = new PchipLorenzCurve(sampleCensusDataset, {
      enforceConvexity: true
    });

    it("interpolates all knots exactly", () => {
      for (const point of sampleCensusDataset.points) {
        expect(pchip.evaluate(point.populationShare)).toBeCloseTo(point.incomeShare, 9);
      }
    });

    it("guarantees strict economic monotonicity L'(p) >= 0 everywhere", () => {
      expect(pchip.isMonotonic(500)).toBe(true);
    });

    it("guarantees economic convexity L''(p) >= 0 everywhere", () => {
      expect(pchip.isConvex(500)).toBe(true);
      const violations = pchip.findConvexityViolations(500);
      expect(violations).toHaveLength(0);
    });

    it("correctly extracts quantile income and top shares", () => {
      // y(p) = mu * L'(p)
      const medianIncome = pchip.quantileIncome(0.5);
      expect(medianIncome).toBeGreaterThan(0);
      expect(medianIncome).toBeLessThan(pchip.quantileIncome(0.9));

      // Top 20% share: 1 - L(0.8)
      const top20Share = pchip.topShare(0.2);
      expect(top20Share).toBeCloseTo(1 - 0.48, 1);
    });
  });
});
