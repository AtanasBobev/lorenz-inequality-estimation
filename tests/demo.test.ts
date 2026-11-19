import { describe, expect, it } from "vitest";
import {
  validateQuantilePoints,
  validateEconomicParameters,
  autoRepairQuantiles
} from "../demo/src/validation.js";
import { loadPreset } from "../demo/src/presets.js";
import { evaluateInequality, evaluateModelSelection } from "../demo/src/engineBridge.js";
import { parseRawContent } from "../demo/src/fileIngestion.js";
import { AppState } from "../demo/src/types.js";

function createTestState(presetKey: string = "bg_nsi_2022"): AppState {
  const preset = loadPreset(presetKey);
  return {
    dataset: {
      meanIncome: preset.dataset.meanIncome,
      points: preset.dataset.points.map((pt) => ({ ...pt }))
    },
    currency: preset.currency,
    modelType: "hybrid",
    splicingThreshold: 0.9,
    povertyLine: preset.poverty,
    currentModel: null,
    currentHeadcount: 0,
    currentGastwirth: {
      lowerBound: 0,
      upperBound: 1,
      intervalWidth: 1,
      estimatedGini: 0.36,
      isCertified: true,
      maxError: 0.5
    },
    validation: { isValid: true, errors: [], warnings: [] },
    paramValidation: {
      meanIncomeError: null,
      povertyLineError: null,
      povertyLineWarning: null,
      spliceError: null,
      isValid: true
    },
    benchmarkGini: preset.benchmarkGini,
    benchmarkLabel: preset.benchmarkLabel,
    benchmarkType: preset.benchmarkType
  };
}

describe("Demo UI validation, presets, ingestion, and engine bridge", () => {
  it("validates well-formed quantile points and catches ordering/sub-diagonal errors", () => {
    const preset = loadPreset("bg_nsi_2022");
    expect(validateQuantilePoints(preset.dataset.points).isValid).toBe(true);

    const invalid = validateQuantilePoints([
      { populationShare: 0, incomeShare: 0 },
      { populationShare: 0.5, incomeShare: 0.6 },
      { populationShare: 1, incomeShare: 1 }
    ]);
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it("auto-repairs unsorted or non-convex quantile points", () => {
    const broken = [
      { populationShare: 0, incomeShare: 0 },
      { populationShare: 0.5, incomeShare: 0.55 },
      { populationShare: 0.2, incomeShare: 0.05 },
      { populationShare: 1, incomeShare: 1 }
    ];
    const repaired = autoRepairQuantiles(broken);
    expect(repaired[0]).toEqual({ populationShare: 0, incomeShare: 0 });
    expect(repaired[repaired.length - 1]).toEqual({ populationShare: 1, incomeShare: 1 });
    expect(validateQuantilePoints(repaired).isValid).toBe(true);
  });

  it("validates economic parameters and warns on extreme poverty lines", () => {
    expect(validateEconomicParameters(5000, 3000, 0.8).isValid).toBe(true);
    expect(validateEconomicParameters(-10, 3000, 0.8).isValid).toBe(false);
    expect(validateEconomicParameters(5000, 3000, 0.99).isValid).toBe(false);
    expect(validateEconomicParameters(5000, 50000, 0.8).povertyLineWarning).not.toBeNull();
  });

  it("evaluates inequality metrics and model selection via engineBridge", () => {
    const state = createTestState("us_census_2022");
    const evalResult = evaluateInequality(state);
    expect(evalResult.metrics.gastwirthCertificate.isCertified).toBe(true);

    const msResult = evaluateModelSelection(state);
    expect(msResult.comparison.length).toBeGreaterThanOrEqual(2);
    expect(msResult.knotOptimization.optimalAlpha).toBeGreaterThan(1);
  });

  it("parses raw CSV content cleanly in demo fileIngestion", () => {
    const parsed = parseRawContent("0.2,0.05\n0.5,0.2\n0.8,0.5", "test.csv", 10000);
    expect(parsed.success).toBe(true);
    expect(parsed.dataset?.points.length).toBe(5);

    const empty = parseRawContent("", "empty.csv", 10000);
    expect(empty.success).toBe(false);
  });
});
