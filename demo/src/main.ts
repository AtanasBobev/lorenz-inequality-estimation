import { BULGARIAN_NSI_2022, HybridLorenzCurve } from "../../src/index.js";
import { AppState } from "./types.js";
import { loadPreset } from "./presets.js";
import { evaluateInequality } from "./engineBridge.js";
import { renderLorenzChart } from "./charts/lorenzChart.js";
import { renderDerivativeChart } from "./charts/derivativeChart.js";
import { renderTable } from "./tableEditor.js";
import { setupFileInput } from "./fileIngestion.js";

// Central Application Reactive State
const state: AppState = {
  dataset: {
    meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
    points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
  },
  modelType: "hybrid",
  splicingThreshold: 0.8,
  povertyLine: 6048,
  currentModel: null,
  currentHeadcount: 0.329,
  currentGastwirth: {
    lowerBound: 0.3538,
    upperBound: 0.3848,
    intervalWidth: 0.031,
    estimatedGini: 0.3621,
    isCertified: true,
    maxError: 0.0155
  }
};

// DOM Elements
const selectPreset = document.getElementById("selectPreset") as HTMLSelectElement | null;
const selectModelType = document.getElementById("selectModelType") as HTMLSelectElement | null;
const rangeSplice = document.getElementById("rangeSplice") as HTMLInputElement | null;
const valSplice = document.getElementById("valSplice") as HTMLElement | null;
const inputPoverty = document.getElementById("inputPoverty") as HTMLInputElement | null;
const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
const tableBody = document.getElementById("quantilesTableBody") as HTMLElement | null;
const btnAddRow = document.getElementById("btnAddRow") as HTMLButtonElement | null;
const canvasLorenz = document.getElementById("canvasLorenz") as HTMLCanvasElement | null;
const canvasDerivative = document.getElementById("canvasDerivative") as HTMLCanvasElement | null;

// Metric Elements
const outGini = document.getElementById("outGini") as HTMLElement | null;
const outGastwirth = document.getElementById("outGastwirth") as HTMLElement | null;
const outPalma = document.getElementById("outPalma") as HTMLElement | null;
const outSen = document.getElementById("outSen") as HTMLElement | null;
const outHeadcount = document.getElementById("outHeadcount") as HTMLElement | null;
const outAlpha = document.getElementById("outAlpha") as HTMLElement | null;

// Recompute pipeline and refresh view
function recompute(): void {
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
      outSen.textContent = `${Math.round(result.metrics.senWelfareIndex).toLocaleString()}`;
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

    renderLorenzChart(canvasLorenz, state);
    renderDerivativeChart(canvasDerivative, state);
  } catch (err: any) {
    console.error("Recompute error:", err);
  }
}

// Table UI update
function updateTable(): void {
  renderTable(
    tableBody,
    state.dataset.points,
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
    if (inputPoverty) inputPoverty.value = String(Math.round(state.povertyLine));
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

if (rangeSplice) {
  rangeSplice.addEventListener("input", (e: Event) => {
    state.splicingThreshold = parseFloat((e.target as HTMLInputElement).value);
    if (valSplice) valSplice.textContent = state.splicingThreshold.toFixed(2);
    recompute();
  });
}

if (inputPoverty) {
  inputPoverty.addEventListener("input", (e: Event) => {
    state.povertyLine = parseFloat((e.target as HTMLInputElement).value) || 1;
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

setupFileInput(fileInput, state.dataset.meanIncome || 10000, (loadedDataset) => {
  state.dataset = loadedDataset;
  updateTable();
  recompute();
});

window.addEventListener("resize", () => {
  renderLorenzChart(canvasLorenz, state);
  renderDerivativeChart(canvasDerivative, state);
});

// Boot initialization
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
