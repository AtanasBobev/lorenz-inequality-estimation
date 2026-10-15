import { HybridLorenzCurve } from "../../src/index.js";
import { AppState, ModelType } from "./types.js";
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
  },
  benchmarkGini: initialPreset.benchmarkGini,
  benchmarkLabel: initialPreset.benchmarkLabel,
  benchmarkType: initialPreset.benchmarkType
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
const outBenchmarkGini = document.getElementById("outBenchmarkGini") as HTMLElement | null;
const outErrorGini = document.getElementById("outErrorGini") as HTMLElement | null;
const labelBenchmarkGini = document.getElementById("labelBenchmarkGini") as HTMLElement | null;
const labelErrorGini = document.getElementById("labelErrorGini") as HTMLElement | null;
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

    if (outBenchmarkGini && labelBenchmarkGini && outErrorGini && labelErrorGini) {
      if (state.benchmarkGini !== null) {
        const trueG = state.benchmarkGini;
        const diff = result.metrics.giniIndex - trueG;
        const relErr = (Math.abs(diff) / trueG) * 100;
        const sign = diff >= 0 ? "+" : "";

        if (state.benchmarkType === "synthetic") {
          labelBenchmarkGini.textContent = "Analytical Gini (G*)";
          outBenchmarkGini.textContent = `${trueG.toFixed(4)}`;
          labelErrorGini.textContent = "Estimation Error (|ΔG|)";
          outErrorGini.textContent = `${sign}${diff.toFixed(4)} (${relErr.toFixed(2)}%)`;
        } else {
          labelBenchmarkGini.textContent = "Official Agency Gini";
          outBenchmarkGini.textContent = `${trueG.toFixed(4)}`;
          labelErrorGini.textContent = "Disparity vs Official";
          outErrorGini.textContent = `${sign}${diff.toFixed(4)} (${relErr.toFixed(2)}%)`;
        }
      } else {
        labelBenchmarkGini.textContent = "Benchmark Ground Truth";
        outBenchmarkGini.textContent = "N/A (Custom Data)";
        labelErrorGini.textContent = "Gastwirth Max Error Bound";
        outErrorGini.textContent = `±${state.currentGastwirth.maxError.toFixed(4)}`;
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
  } catch (err: unknown) {
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

function syncSplicingThreshold(val: number): void {
  const clamped = Math.max(0.6, Math.min(0.95, isNaN(val) ? 0.8 : val));
  state.splicingThreshold = clamped;
  const formatted = clamped.toFixed(2);
  if (rangeSplice) {
    rangeSplice.value = formatted;
    rangeSplice.setAttribute("value", formatted);
  }
  if (numSplice) {
    numSplice.value = formatted;
    numSplice.setAttribute("value", formatted);
  }
  recompute();
}

function applyPreset(key: string): void {
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

  if (inputMeanIncome) {
    inputMeanIncome.value = meanVal;
    inputMeanIncome.setAttribute("value", meanVal);
  }
  if (inputPoverty) {
    inputPoverty.value = povVal;
    inputPoverty.setAttribute("value", povVal);
  }
  if (labelCurrency) labelCurrency.textContent = state.currency;
  if (labelPovertyCurrency) labelPovertyCurrency.textContent = state.currency;

  updateTable();
  recompute();
}

// Event Bindings
if (selectPreset) {
  const onPreset = () => applyPreset(selectPreset.value);
  selectPreset.addEventListener("change", onPreset);
  selectPreset.addEventListener("input", onPreset);
}

if (selectModelType) {
  selectModelType.addEventListener("change", (e: Event) => {
    state.modelType = (e.target as HTMLSelectElement).value as ModelType;
    recompute();
  });
}

if (rangeSplice) {
  rangeSplice.addEventListener("input", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    syncSplicingThreshold(val);
  });
  rangeSplice.addEventListener("change", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    syncSplicingThreshold(val);
  });
}

if (numSplice) {
  numSplice.addEventListener("input", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val)) syncSplicingThreshold(val);
  });
  numSplice.addEventListener("change", (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val)) syncSplicingThreshold(val);
  });
}

if (inputPoverty) {
  const onPoverty = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    state.povertyLine = isNaN(val) ? 0 : val;
    recompute();
  };
  inputPoverty.addEventListener("input", onPoverty);
  inputPoverty.addEventListener("change", onPoverty);
}

if (inputMeanIncome) {
  const onMean = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    state.dataset.meanIncome = isNaN(val) ? 0 : val;
    recompute();
  };
  inputMeanIncome.addEventListener("input", onMean);
  inputMeanIncome.addEventListener("change", onMean);
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

    // If splicing threshold is outside valid range, clamp it into [0.60, 0.95]
    if (
      isNaN(state.splicingThreshold) ||
      state.splicingThreshold < 0.6 ||
      state.splicingThreshold > 0.95
    ) {
      syncSplicingThreshold(0.8);
    }

    // If mean income or poverty line are invalid, restore to safe defaults
    if (isNaN(state.dataset.meanIncome) || state.dataset.meanIncome <= 0) {
      const defaultMean = 5032;
      state.dataset.meanIncome = defaultMean;
      if (inputMeanIncome) {
        inputMeanIncome.value = String(defaultMean);
        inputMeanIncome.setAttribute("value", String(defaultMean));
      }
    }

    if (isNaN(state.povertyLine) || state.povertyLine <= 0) {
      const defaultPov = 3092;
      state.povertyLine = defaultPov;
      if (inputPoverty) {
        inputPoverty.value = String(defaultPov);
        inputPoverty.setAttribute("value", String(defaultPov));
      }
    }

    updateTable();
    recompute();

    // Visual button feedback
    const origText = btnAutoRepair.textContent || "Auto-Repair Knots";
    btnAutoRepair.textContent = "✓ Repaired";
    btnAutoRepair.classList.add("btn-outline-light");
    btnAutoRepair.classList.remove("btn-dark");
    setTimeout(() => {
      btnAutoRepair.textContent = origText;
      btnAutoRepair.classList.remove("btn-outline-light");
      btnAutoRepair.classList.add("btn-dark");
    }, 1200);
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
      state.benchmarkGini = null;
      state.benchmarkLabel = null;
      state.benchmarkType = null;
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
      state.benchmarkGini = null;
      state.benchmarkLabel = null;
      state.benchmarkType = null;
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
if (selectPreset && selectPreset.value) {
  applyPreset(selectPreset.value);
} else {
  applyPreset("bg_nsi_2022");
}
syncSplicingThreshold(state.splicingThreshold);

if (typeof document !== "undefined") {
  const initUI = () => {
    if (selectPreset && selectPreset.value) {
      applyPreset(selectPreset.value);
    }
    syncSplicingThreshold(state.splicingThreshold);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    setTimeout(initUI, 30);
  }
}
