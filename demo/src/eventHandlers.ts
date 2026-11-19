import { evaluateModelSelection } from "./engineBridge.js";
import { renderLorenzChart } from "./charts/lorenzChart.js";
import { renderDerivativeChart } from "./charts/derivativeChart.js";
import { setupFileInput, parseRawContent } from "./fileIngestion.js";
import { autoRepairQuantiles } from "./validation.js";
import { DemoElements } from "./domElements.js";
import { AppState, ModelType } from "./types.js";

export interface EventHandlerCallbacks {
  readonly recompute: () => void;
  readonly updateTable: () => void;
  readonly syncSplicingThreshold: (val: number) => void;
  readonly applyPreset: (key: string) => void;
  readonly clearOptimalKnotBadge: () => void;
}

export function bindDemoEvents(el: DemoElements, state: AppState, cb: EventHandlerCallbacks): void {
  if (el.selectPreset) {
    const onPreset = () => cb.applyPreset(el.selectPreset!.value);
    el.selectPreset.addEventListener("change", onPreset);
    el.selectPreset.addEventListener("input", onPreset);
  }

  if (el.selectModelType) {
    el.selectModelType.addEventListener("change", (e: Event) => {
      state.modelType = (e.target as HTMLSelectElement).value as ModelType;
      cb.recompute();
    });
  }

  if (el.rangeSplice) {
    const onRangeSplice = (e: Event) => {
      cb.clearOptimalKnotBadge();
      cb.syncSplicingThreshold(parseFloat((e.target as HTMLInputElement).value));
    };
    el.rangeSplice.addEventListener("input", onRangeSplice);
    el.rangeSplice.addEventListener("change", onRangeSplice);
  }

  if (el.numSplice) {
    const onNumSplice = (e: Event) => {
      cb.clearOptimalKnotBadge();
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val)) cb.syncSplicingThreshold(val);
    };
    el.numSplice.addEventListener("input", onNumSplice);
    el.numSplice.addEventListener("change", onNumSplice);
  }

  if (el.inputPoverty) {
    const onPoverty = (e: Event) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      state.povertyLine = isNaN(val) ? 0 : val;
      cb.recompute();
    };
    el.inputPoverty.addEventListener("input", onPoverty);
    el.inputPoverty.addEventListener("change", onPoverty);
  }

  if (el.inputMeanIncome) {
    const onMean = (e: Event) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      state.dataset.meanIncome = isNaN(val) ? 0 : val;
      cb.recompute();
    };
    el.inputMeanIncome.addEventListener("input", onMean);
    el.inputMeanIncome.addEventListener("change", onMean);
  }

  if (el.btnAddRow) {
    el.btnAddRow.addEventListener("click", () => {
      const pts = state.dataset.points;
      const lastSec = pts[pts.length - 2];
      const newP = lastSec ? Math.min(0.95, (lastSec.populationShare + 1.0) / 2) : 0.5;
      const newL = lastSec ? Math.min(0.95, (lastSec.incomeShare + 1.0) / 2) : 0.5;

      pts.splice(pts.length - 1, 0, { populationShare: newP, incomeShare: newL });
      pts.sort((a, b) => a.populationShare - b.populationShare);
      cb.updateTable();
      cb.recompute();
    });
  }

  if (el.btnAutoRepair) {
    el.btnAutoRepair.addEventListener("click", () => {
      state.dataset.points = autoRepairQuantiles(state.dataset.points);

      if (
        isNaN(state.splicingThreshold) ||
        state.splicingThreshold < 0.6 ||
        state.splicingThreshold > 0.95
      ) {
        cb.syncSplicingThreshold(0.8);
      }

      if (isNaN(state.dataset.meanIncome) || state.dataset.meanIncome <= 0) {
        const defaultMean = 5032;
        state.dataset.meanIncome = defaultMean;
        if (el.inputMeanIncome) {
          el.inputMeanIncome.value = String(defaultMean);
          el.inputMeanIncome.setAttribute("value", String(defaultMean));
        }
      }

      if (isNaN(state.povertyLine) || state.povertyLine <= 0) {
        const defaultPov = 3092;
        state.povertyLine = defaultPov;
        if (el.inputPoverty) {
          el.inputPoverty.value = String(defaultPov);
          el.inputPoverty.setAttribute("value", String(defaultPov));
        }
      }

      cb.updateTable();
      cb.recompute();

      const btn = el.btnAutoRepair!;
      const origText = btn.textContent || "Auto-Repair Knots";
      btn.textContent = "✓ Repaired";
      btn.classList.add("btn-outline-light");
      btn.classList.remove("btn-dark");
      setTimeout(() => {
        btn.textContent = origText;
        btn.classList.remove("btn-outline-light");
        btn.classList.add("btn-dark");
      }, 1200);
    });
  }

  if (el.btnTogglePaste && el.boxPasteArea) {
    el.btnTogglePaste.addEventListener("click", () => {
      const isHidden = el.boxPasteArea!.style.display === "none";
      el.boxPasteArea!.style.display = isHidden ? "block" : "none";
      el.btnTogglePaste!.textContent = isHidden ? "Close Text Paste" : "Paste Raw Text";
    });
  }

  if (el.btnApplyPaste && el.txtRawInput) {
    el.btnApplyPaste.addEventListener("click", () => {
      const res = parseRawContent(
        el.txtRawInput!.value,
        "manual_entry.csv",
        state.dataset.meanIncome || 10000
      );
      if (res.success && res.dataset) {
        state.dataset = {
          meanIncome: res.dataset.meanIncome,
          points: res.dataset.points.map((pt) => ({ ...pt }))
        };
        state.benchmarkGini = null;
        state.benchmarkLabel = null;
        state.benchmarkType = null;
        if (el.boxPasteArea) el.boxPasteArea.style.display = "none";
        if (el.btnTogglePaste) el.btnTogglePaste.textContent = "Paste Raw Text";
        cb.updateTable();
        cb.recompute();
      } else {
        alert("Failed to parse content: " + (res.errorMessage || "Unknown error."));
      }
    });
  }

  setupFileInput(
    el.fileInput,
    () => state.dataset.meanIncome || 10000,
    (res) => {
      if (res.success && res.dataset) {
        state.dataset = {
          meanIncome: res.dataset.meanIncome,
          points: res.dataset.points.map((pt) => ({ ...pt }))
        };
        state.benchmarkGini = null;
        state.benchmarkLabel = null;
        state.benchmarkType = null;
        cb.updateTable();
        cb.recompute();
      } else {
        alert("File error: " + (res.errorMessage || "Could not read data."));
      }
    }
  );

  if (el.btnAutoSelectKnot) {
    el.btnAutoSelectKnot.addEventListener("click", () => {
      try {
        const msResult = evaluateModelSelection(state);
        const optKnot = msResult.knotOptimization.optimalKnot;
        cb.syncSplicingThreshold(optKnot);
        if (el.badgeOptimalKnot) {
          el.badgeOptimalKnot.textContent = `Optimal p* = ${optKnot.toFixed(2)} (Score: ${msResult.knotOptimization.minScore.toFixed(1)}, α: ${msResult.knotOptimization.optimalAlpha.toFixed(2)})`;
          el.badgeOptimalKnot.style.display = "inline-block";
        }
        cb.recompute();
      } catch (optErr) {
        console.error("Auto knot selection failed:", optErr);
        cb.clearOptimalKnotBadge();
      }
    });
  }

  window.addEventListener("resize", () => {
    renderLorenzChart(el.canvasLorenz, state);
    renderDerivativeChart(el.canvasDerivative, state);
  });
}
