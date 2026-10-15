import { BULGARIAN_NSI_2022, HybridLorenzCurve } from "../../src/index.js";
import { AppState } from "./types.js";
import { loadPreset } from "./presets.js";
import { evaluateInequality } from "./engineBridge.js";
import { renderLorenzChart } from "./charts/lorenzChart.js";
import { renderDerivativeChart } from "./charts/derivativeChart.js";
import { renderTable } from "./tableEditor.js";
import { setupFileInput, parseRawContent } from "./fileIngestion.js";
import {
  validateQuantilePoints,
  validateEconomicParameters,
  autoRepairQuantiles
} from "./validation.js";

// State
const initialPreset = loadPreset("bg_nsi_2022");

const state: AppState = {
  dataset: {
    meanIncome: initialPreset.dataset.meanIncome,
    points: initialPreset.dataset.points.map((pt) => ({ ...pt }))
  },
  currency: initialPreset.currency,
  modelType: "hybrid",
  splicingThreshold: 0.8,
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
  }
};

// DOM Elements
const selectPreset = document.getElementById("selectPreset") as HTMLSelectElement | null;
const selectModelType = document.getElementById("selectModelType") as HTMLSelectElement | null;
const rangeSplice = document.getElementById("rangeSplice") as HTMLInputElement | null;
const numSplice = document.getElementById("numSplice") as HTMLInputElement | null;
const inputMeanIncome = document.getElementById("inputMeanIncome") as HTMLInputElement | null;
const inputPoverty = document.getElementById("inputPoverty") as HTMLInputElement | null;
const labelCurrency = document.getElementById("labelCurrency") as HTMLElement | null;
const labelPovertyCurrency = document.getElementById("labelPovertyCurrency") as HTMLElement | null;
const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
const tableBody = document.getElementById("quantilesTableBody") as HTMLElement | null;
const btnAddRow = document.getElementById("btnAddRow") as HTMLButtonElement | null;
const btnAutoRepair = document.getElementById("btnAutoRepair") as HTMLButtonElement | null;
const btnTogglePaste = document.getElementById("btnTogglePaste") as HTMLButtonElement | null;
const boxPasteArea = document.getElementById("boxPasteArea") as HTMLElement | null;
const txtRawInput = document.getElementById("txtRawInput") as HTMLTextAreaElement | null;
const btnApplyPaste = document.getElementById("btnApplyPaste") as HTMLButtonElement | null;

const alertContainer = document.getElementById("alertContainer") as HTMLElement | null;
const alertContent = document.getElementById("alertContent") as HTMLElement | null;
const canvasLorenz = document.getElementById("canvasLorenz") as HTMLCanvasElement | null;
const canvasDerivative = document.getElementById("canvasDerivative") as HTMLCanvasElement | null;

// Metric Elements
const outGini = document.getElementById("outGini") as HTMLElement | null;
const outGastwirth = document.getElementById("outGastwirth") as HTMLElement | null;
const outPalma = document.getElementById("outPalma") as HTMLElement | null;
const outSen = document.getElementById("outSen") as HTMLElement | null;
const outHeadcount = document.getElementById("outHeadcount") as HTMLElement | null;
const outAlpha = document.getElementById("outAlpha") as HTMLElement | null;
const badgeStatus = document.getElementById("badgeStatus") as HTMLElement | null;
const modelDescription = document.getElementById("modelDescription") as HTMLElement | null;

// Updates the informative model description text
function updateModelDescription(): void {
  if (!modelDescription) return;
  if (state.modelType === "hybrid") {
    modelDescription.textContent =
      "Tail-spliced hybrid model: shape-preserving PCHIP body spliced onto an asymptotic Pareto tail with C^1 derivative continuity.";
  } else if (state.modelType === "pchip") {
    modelDescription.textContent =
      "Shape-preserving piecewise cubic Hermite interpolating polynomial (PCHIP) with harmonic slope weighting and iterative convexity cone projection.";
  } else {
    modelDescription.textContent =
      "Natural C^2 cubic spline: smooth twice-differentiable polynomial solved via Thomas algorithm. May exhibit oscillatory overshoot on coarse data.";
  }
}

// Recompute pipeline and refresh view
function recompute(): void {
  state.validation = validateQuantilePoints(state.dataset.points);
  state.paramValidation = validateEconomicParameters(
    state.dataset.meanIncome || 10000,
    state.povertyLine,
    state.splicingThreshold,
    state.dataset.points
  );

  updateAlerts();
  updateModelDescription();

  if (!state.validation.isValid || !state.paramValidation.isValid) {
    if (badgeStatus) {
      badgeStatus.className = "badge badge-dark border border-dark text-white";
      badgeStatus.textContent = "Validation Issue";
    }
    renderLorenzChart(canvasLorenz, state);
    renderDerivativeChart(canvasDerivative, state);
    return;
  }

  try {
    const result = evaluateInequality(state);
    state.currentModel = result.model;
    state.currentGastwirth = result.metrics.gastwirthCertificate;
    state.currentHeadcount = result.metrics.povertyHeadcount ?? 0;

    if (outGini) outGini.textContent = result.metrics.giniIndex.toFixed(4);
    if (outGastwirth) {
      outGastwirth.textContent = `[${state.currentGastwirth.lowerBound.toFixed(4)}, ${state.currentGastwirth.upperBound.toFixed(4)}]`;
    }
    if (outPalma) {
      outPalma.textContent = isFinite(result.metrics.palmaRatio)
        ? result.metrics.palmaRatio.toFixed(2)
        : "N/A";
    }
    if (outSen) {
      outSen.textContent = `${Math.round(result.metrics.senWelfareIndex).toLocaleString()} ${state.currency}`;
    }
    if (outHeadcount) {
      outHeadcount.textContent = `${(state.currentHeadcount * 100).toFixed(1)}%`;
    }
    if (outAlpha) {
      if (state.modelType === "hybrid" && state.currentModel instanceof HybridLorenzCurve) {
        outAlpha.textContent = state.currentModel.getTailAlpha().toFixed(2);
      } else {
        outAlpha.textContent = "N/A";
      }
    }

    if (badgeStatus) {
      badgeStatus.className = "badge badge-dark";
      badgeStatus.textContent = state.currentGastwirth.isCertified
        ? "Certified [G_L, G_U]"
        : "Verified";
    }

    renderLorenzChart(canvasLorenz, state);
    renderDerivativeChart(canvasDerivative, state);
  } catch (err: any) {
    console.error("Recompute error:", err);
    if (badgeStatus) {
      badgeStatus.className = "badge badge-secondary";
      badgeStatus.textContent = "Solver Error";
    }
  }
}

// Display validation alerts
function updateAlerts(): void {
  if (!alertContainer || !alertContent) return;

  const messages: string[] = [];

  for (const err of state.validation.errors) {
    messages.push(`<strong>Knot Error:</strong> ${err.message}`);
  }

  if (state.paramValidation.meanIncomeError) {
    messages.push(`<strong>Parameter Error:</strong> ${state.paramValidation.meanIncomeError}`);
  }

  if (state.paramValidation.povertyLineError) {
    messages.push(`<strong>Parameter Error:</strong> ${state.paramValidation.povertyLineError}`);
  }

  if (state.paramValidation.spliceError) {
    messages.push(`<strong>Splicing Error:</strong> ${state.paramValidation.spliceError}`);
  }

  for (const warn of state.validation.warnings) {
    messages.push(`<strong>Warning:</strong> ${warn}`);
  }

  if (state.paramValidation.povertyLineWarning) {
    messages.push(`<strong>Notice:</strong> ${state.paramValidation.povertyLineWarning}`);
  }

  if (messages.length > 0) {
    alertContainer.style.display = "block";
    alertContent.innerHTML = messages.map((m) => `<div>${m}</div>`).join("");
  } else {
    alertContainer.style.display = "none";
    alertContent.innerHTML = "";
  }
}

// Table UI update
function updateTable(): void {
  renderTable(
    tableBody,
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

// Event Bindings
if (selectPreset) {
  selectPreset.addEventListener("change", (e: Event) => {
    const key = (e.target as HTMLSelectElement).value;
    const loaded = loadPreset(key);
    state.dataset = loaded.dataset;
    state.povertyLine = loaded.poverty;
    state.currency = loaded.currency;

    if (inputPoverty) inputPoverty.value = String(Math.round(state.povertyLine));
    if (inputMeanIncome)
      inputMeanIncome.value = String(Math.round(state.dataset.meanIncome || 10000));
    if (labelCurrency) labelCurrency.textContent = state.currency;
    if (labelPovertyCurrency) labelPovertyCurrency.textContent = state.currency;

    updateTable();
    recompute();
  });
}

if (selectModelType) {
  selectModelType.addEventListener("change", (e: Event) => {
    state.modelType = (e.target as HTMLSelectElement).value as any;
    recompute();
  });
}

if (rangeSplice && numSplice) {
  rangeSplice.addEventListener("input", (e: Event) => {
    state.splicingThreshold = parseFloat((e.target as HTMLInputElement).value);
    numSplice.value = state.splicingThreshold.toFixed(2);
    recompute();
  });

  numSplice.addEventListener("input", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      state.splicingThreshold = Math.max(0.5, Math.min(0.98, val));
      rangeSplice.value = String(state.splicingThreshold);
      recompute();
    }
  });
}

if (inputPoverty) {
  inputPoverty.addEventListener("input", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    state.povertyLine = isNaN(val) ? 0 : val;
    recompute();
  });
}

if (inputMeanIncome) {
  inputMeanIncome.addEventListener("input", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    state.dataset.meanIncome = isNaN(val) ? 0 : val;
    recompute();
  });
}

if (btnAddRow) {
  btnAddRow.addEventListener("click", () => {
    const pts = state.dataset.points;
    const lastSec = pts[pts.length - 2];
    const newP = lastSec ? Math.min(0.95, (lastSec.populationShare + 1.0) / 2) : 0.5;
    const newL = lastSec ? Math.min(0.95, (lastSec.incomeShare + 1.0) / 2) : 0.5;

    pts.splice(pts.length - 1, 0, { populationShare: newP, incomeShare: newL });
    pts.sort((a, b) => a.populationShare - b.populationShare);
    updateTable();
    recompute();
  });
}

if (btnAutoRepair) {
  btnAutoRepair.addEventListener("click", () => {
    state.dataset.points = autoRepairQuantiles(state.dataset.points);
    updateTable();
    recompute();
  });
}

if (btnTogglePaste && boxPasteArea) {
  btnTogglePaste.addEventListener("click", () => {
    const isHidden = boxPasteArea.style.display === "none";
    boxPasteArea.style.display = isHidden ? "block" : "none";
    btnTogglePaste.textContent = isHidden ? "Close Text Paste" : "Paste Raw Text";
  });
}

if (btnApplyPaste && txtRawInput) {
  btnApplyPaste.addEventListener("click", () => {
    const content = txtRawInput.value;
    const res = parseRawContent(content, "manual_entry.csv", state.dataset.meanIncome || 10000);
    if (res.success && res.dataset) {
      state.dataset = res.dataset;
      if (boxPasteArea) boxPasteArea.style.display = "none";
      if (btnTogglePaste) btnTogglePaste.textContent = "Paste Raw Text";
      updateTable();
      recompute();
    } else {
      alert("Failed to parse content: " + (res.errorMessage || "Unknown error."));
    }
  });
}

setupFileInput(
  fileInput,
  () => state.dataset.meanIncome || 10000,
  (res) => {
    if (res.success && res.dataset) {
      state.dataset = res.dataset;
      updateTable();
      recompute();
    } else {
      alert("File error: " + (res.errorMessage || "Could not read data."));
    }
  }
);

window.addEventListener("resize", () => {
  renderLorenzChart(canvasLorenz, state);
  renderDerivativeChart(canvasDerivative, state);
});

// Boot initialization
if (inputMeanIncome) inputMeanIncome.value = String(Math.round(state.dataset.meanIncome || 10000));
if (inputPoverty) inputPoverty.value = String(Math.round(state.povertyLine));
if (numSplice) numSplice.value = state.splicingThreshold.toFixed(2);
if (labelCurrency) labelCurrency.textContent = state.currency;
if (labelPovertyCurrency) labelPovertyCurrency.textContent = state.currency;

updateTable();
recompute();

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      recompute();
    });
  } else {
    setTimeout(() => recompute(), 60);
  }
}
