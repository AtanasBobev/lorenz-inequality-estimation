import { describe, it, expect } from "vitest";
import { ModelSelectionEvaluator } from "../src/diagnostics/ModelSelectionEvaluator.js";
import { PchipLorenzCurve } from "../src/interpolation/PchipLorenzCurve.js";
import { KakwaniPodderCurve } from "../src/regression/KakwaniPodderCurve.js";
import { HybridLorenzCurve } from "../src/tail/HybridLorenzCurve.js";
import {
  BULGARIAN_NSI_2022,
  EUROSTAT_EU27_2022,
  US_CENSUS_CPS_2022
} from "../src/data/censusDatasets.js";
import { QuantileDataset } from "../src/core/types.js";

describe("ModelSelectionEvaluator - Information Criteria & Model Selection", () => {
  it("calculates analytical log-likelihood, AIC, AICc, and BIC accurately", () => {
    const sampleSize = 10;
    const rss = 0.001; // MSE = 0.0001
    const k = 3;

    const ll = ModelSelectionEvaluator.computeLogLikelihood(sampleSize, rss);
    const aic = ModelSelectionEvaluator.computeAIC(sampleSize, rss, k);
    const aicc = ModelSelectionEvaluator.computeAICc(sampleSize, rss, k);
    const bic = ModelSelectionEvaluator.computeBIC(sampleSize, rss, k);

    // Verify mathematical relationships
    // AIC = 2k - 2*LL
    expect(aic).toBeCloseTo(2 * k - 2 * ll, 6);

    // AICc = AIC + 2k(k+1)/(n - k - 1)
    const penalty = (2 * k * (k + 1)) / (sampleSize - k - 1); // 2*3*4 / (10 - 3 - 1) = 24 / 6 = 4.0
    expect(aicc).toBeCloseTo(aic + penalty, 6);
    expect(aicc).toBeGreaterThan(aic);

    // BIC = k*ln(n) - 2*LL
    expect(bic).toBeCloseTo(k * Math.log(sampleSize) - 2 * ll, 6);

    // Edge case: sample size too small for k (n - k - 1 <= 0)
    const infiniteAicc = ModelSelectionEvaluator.computeAICc(4, rss, 3);
    expect(infiniteAicc).toBe(Number.POSITIVE_INFINITY);
  });

  it("evaluates a single LorenzModel and produces complete metrics", () => {
    const dataset = BULGARIAN_NSI_2022.dataset;
    const pchip = new PchipLorenzCurve(dataset);

    const record = ModelSelectionEvaluator.evaluateModel(dataset, pchip, 5, "PCHIP-Spline");

    expect(record.modelName).toBe("PCHIP-Spline");
    expect(record.sampleSize).toBe(dataset.points.length);
    expect(record.parameterCount).toBe(5);
    expect(record.rss).toBeGreaterThanOrEqual(0);
    expect(record.rmse).toBeGreaterThanOrEqual(0);
    expect(record.mae).toBeGreaterThanOrEqual(0);
    expect(record.rSquared).toBeGreaterThan(0.99);
    expect(Number.isFinite(record.logLikelihood)).toBe(true);
    expect(Number.isFinite(record.aic)).toBe(true);
    expect(Number.isFinite(record.aicc)).toBe(true);
    expect(Number.isFinite(record.bic)).toBe(true);
  });

  it("compares multiple competing models and normalizes Akaike weights to 1.0", () => {
    const dataset = BULGARIAN_NSI_2022.dataset;

    const pchip = new PchipLorenzCurve(dataset);
    const kakwani = new KakwaniPodderCurve(dataset);
    const hybrid = new HybridLorenzCurve(dataset, { bodyModel: pchip, splicePoint: 0.8 });

    const models = [
      { name: "PCHIP Spline", model: pchip, parameterCount: 5 },
      { name: "Kakwani-Podder (1976)", model: kakwani, parameterCount: 3 },
      { name: "Hybrid PCHIP-Pareto (p*=0.80)", model: hybrid, parameterCount: 2 }
    ];

    const results = ModelSelectionEvaluator.compareModels(dataset, models);

    expect(results.length).toBe(3);

    // 1. Best model must have deltaAic == 0
    expect(results[0].deltaAic).toBe(0);
    expect(results[0].evidenceRatio).toBeCloseTo(1.0, 4);

    // 2. Results must be sorted ascending by deltaAic
    expect(results[0].deltaAic).toBeLessThanOrEqual(results[1].deltaAic);
    expect(results[1].deltaAic).toBeLessThanOrEqual(results[2].deltaAic);

    // 3. Akaike weights must sum to 1.0
    const sumWeights = results.reduce((acc, r) => acc + r.akaikeWeight, 0);
    expect(sumWeights).toBeCloseTo(1.0, 5);

    // 4. All weights in [0, 1]
    for (const r of results) {
      expect(r.akaikeWeight).toBeGreaterThanOrEqual(0);
      expect(r.akaikeWeight).toBeLessThanOrEqual(1.0);
    }
  });

  it("finds the optimal Pareto tail splicing knot p* using penalized information criteria", () => {
    const dataset = BULGARIAN_NSI_2022.dataset;

    const optResult = ModelSelectionEvaluator.findOptimalKnot(dataset, {
      candidateKnots: [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
      curvatureWeight: 2.0
    });

    expect(optResult.optimalKnot).toBeGreaterThanOrEqual(0.7);
    expect(optResult.optimalKnot).toBeLessThanOrEqual(0.95);
    expect(optResult.optimalAlpha).toBeGreaterThan(1.5);
    expect(optResult.optimalAlpha).toBeLessThan(6.0);
    expect(optResult.records.length).toBeGreaterThanOrEqual(6);

    // Verify all records have valid properties
    for (const rec of optResult.records) {
      expect(Number.isFinite(rec.pStar)).toBe(true);
      expect(rec.tailAlpha).toBeGreaterThan(1.0);
      expect(rec.curvatureJump).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(rec.penalizedScore)).toBe(true);
    }
  });

  it("evaluates and compares models across international census datasets (Bulgaria, Eurostat, US)", () => {
    const testDatasets: QuantileDataset[] = [
      BULGARIAN_NSI_2022.dataset,
      EUROSTAT_EU27_2022.dataset,
      US_CENSUS_CPS_2022.dataset
    ];

    for (const dataset of testDatasets) {
      const pchip = new PchipLorenzCurve(dataset);
      const kakwani = new KakwaniPodderCurve(dataset);
      const hybrid = new HybridLorenzCurve(dataset, { bodyModel: pchip, splicePoint: 0.8 });

      const ranked = ModelSelectionEvaluator.compareModels(dataset, [
        { name: "Kakwani-Podder", model: kakwani, parameterCount: 3 },
        { name: "Hybrid PCHIP-Pareto", model: hybrid, parameterCount: 2 }
      ]);

      expect(ranked.length).toBe(2);
      expect(ranked[0].deltaAic).toBe(0);
      expect(ranked[0].akaikeWeight + ranked[1].akaikeWeight).toBeCloseTo(1.0, 5);
    }
  });
});
