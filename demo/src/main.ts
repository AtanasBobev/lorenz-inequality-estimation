import { AppState } from "./types.js";
import { loadPreset } from "./presets.js";
import { evaluateInequality, evaluateModelSelection } from "./engineBridge.js";
import { renderLorenzChart } from "./charts/lorenzChart.js";
import { renderDerivativeChart } from "./charts/derivativeChart.js";
import { renderTable } from "./tableEditor.js";
import { validateQuantilePoints, validateEconomicParameters } from "./validation.js";
import { getDemoElements } from "./domElements.js";
import {
  updateModelDescription,
  updateAlerts,
  renderMacroMetrics,
  renderModelSelectionTable,
  renderValidationErrorBadge,
  setStatusBadge
} from "./metricsRenderer.js";
import { bindDemoEvents } from "./eventHandlers.js";

const initialPreset = loadPreset("bg_nsi_2022");

const state: AppState = {
  dataset: {
    meanIncome: initialPreset.dataset.meanIncome,
    points: initialPreset.dataset.points.map((pt) => ({ ...pt }))
  },
  currency: initialPreset.currency,
  modelType: "hybrid",
  splicingThreshold: 0.9,
  povertyLine: initialPreset.poverty,
  currentModel: null,
  currentHeadcount: 0.329,
  currentGastwirth: {
    lowerBound: 0.3538,
    upperBound: 0.3848,
    intervalWidth: 0.031,
    estimatedGini: 0.3621,
    isCertified: true,
    maxError: 0.0155
  },
  validation: { isValid: true, errors: [], warnings: [] },
  paramValidation: {
    meanIncomeError: null,
    povertyLineError: null,
    povertyLineWarning: null,
    spliceError: null,
    isValid: true
  },
  benchmarkGini: initialPreset.benchmarkGini,
  benchmarkLabel: initialPreset.benchmarkLabel,
  benchmarkType: initialPreset.benchmarkType
};

const el = getDemoElements();

function recompute(): void {
  state.validation = validateQuantilePoints(state.dataset.points);
  state.paramValidation = validateEconomicParameters(
    state.dataset.meanIncome || 10000,
    state.povertyLine,
    state.splicingThreshold
  );

  updateAlerts(el, state);
  updateModelDescription(el, state);

  if (!state.validation.isValid || !state.paramValidation.isValid) {
    renderValidationErrorBadge(el, state);
    renderLorenzChart(el.canvasLorenz, state);
    renderDerivativeChart(el.canvasDerivative, state);
    return;
  }

  try {
    const result = evaluateInequality(state);
    state.currentModel = result.model;
    state.currentGastwirth = result.metrics.gastwirthCertificate;
    state.currentHeadcount = result.metrics.povertyHeadcount ?? 0;

    renderMacroMetrics(el, state, result.metrics);

    try {
      const msResult = evaluateModelSelection(state);
      renderModelSelectionTable(el, msResult.comparison);
    } catch (msErr: unknown) {
      console.warn("Model selection evaluation warning:", msErr);
    }

    renderLorenzChart(el.canvasLorenz, state);
    renderDerivativeChart(el.canvasDerivative, state);
  } catch (err: unknown) {
    console.error("Recompute error:", err);
    const errMsg = err instanceof Error ? err.message : "Solver Error";
    setStatusBadge(el.badgeStatus, "error", errMsg, errMsg);
  }
}

function updateTable(): void {
  renderTable(
    el.tableBody,
    state.dataset.points,
    state.validation,
    (index, field, val) => {
      if (field === "p") state.dataset.points[index].populationShare = val;
      if (field === "L") state.dataset.points[index].incomeShare = val;
      recompute();
    },
    (index) => {
      if (index > 0 && index < state.dataset.points.length - 1) {
        state.dataset.points.splice(index, 1);
        updateTable();
        recompute();
      }
    }
  );
}

function syncSplicingThreshold(val: number): void {
  const clamped = Math.max(0.6, Math.min(0.95, isNaN(val) ? 0.8 : val));
  state.splicingThreshold = clamped;
  const formatted = clamped.toFixed(2);
  if (el.rangeSplice) {
    el.rangeSplice.value = formatted;
    el.rangeSplice.setAttribute("value", formatted);
    el.rangeSplice.setAttribute("aria-valuetext", formatted);
    el.rangeSplice.style.setProperty("--attr-min", el.rangeSplice.min || "0.60");
    el.rangeSplice.style.setProperty("--attr-max", el.rangeSplice.max || "0.95");
    el.rangeSplice.style.setProperty("--control-value", formatted);
  }
  if (el.numSplice) {
    el.numSplice.value = formatted;
    el.numSplice.setAttribute("value", formatted);
  }
  recompute();
}

function clearOptimalKnotBadge(): void {
  if (el.badgeOptimalKnot) {
    el.badgeOptimalKnot.style.display = "none";
    el.badgeOptimalKnot.textContent = "";
  }
}

function applyPreset(key: string): void {
  clearOptimalKnotBadge();

  const loaded = loadPreset(key);
  state.dataset = {
    meanIncome: loaded.dataset.meanIncome,
    points: loaded.dataset.points.map((pt) => ({ ...pt }))
  };
  state.povertyLine = loaded.poverty;
  state.currency = loaded.currency;
  state.benchmarkGini = loaded.benchmarkGini;
  state.benchmarkLabel = loaded.benchmarkLabel;
  state.benchmarkType = loaded.benchmarkType;

  const meanVal = String(Math.round(state.dataset.meanIncome || 10000));
  const povVal = String(Math.round(state.povertyLine));

  if (el.inputMeanIncome) {
    el.inputMeanIncome.value = meanVal;
    el.inputMeanIncome.setAttribute("value", meanVal);
  }
  if (el.inputPoverty) {
    el.inputPoverty.value = povVal;
    el.inputPoverty.setAttribute("value", povVal);
  }
  if (el.labelCurrency) el.labelCurrency.textContent = state.currency;
  if (el.labelPovertyCurrency) el.labelPovertyCurrency.textContent = state.currency;

  const pts = state.dataset.points;
  if (pts.length >= 3) {
    syncSplicingThreshold(pts[pts.length - 2].populationShare);
  }

  updateTable();
  recompute();
}

bindDemoEvents(el, state, {
  recompute,
  updateTable,
  syncSplicingThreshold,
  applyPreset,
  clearOptimalKnotBadge
});

if (el.selectPreset && el.selectPreset.value) {
  applyPreset(el.selectPreset.value);
} else {
  applyPreset("bg_nsi_2022");
}
syncSplicingThreshold(state.splicingThreshold);

if (typeof document !== "undefined") {
  const initUI = () => {
    if (el.selectPreset && el.selectPreset.value) {
      applyPreset(el.selectPreset.value);
    }
    syncSplicingThreshold(state.splicingThreshold);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    setTimeout(initUI, 30);
  }
}
