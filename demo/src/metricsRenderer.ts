import { HybridLorenzCurve, InequalityMetrics, ModelEvaluationRecord } from "../../src/index.js";
import { DemoElements } from "./domElements.js";
import { AppState } from "./types.js";

function appendAlertLine(container: HTMLElement, label: string, message: string): void {
  const row = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = label;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(` ${message}`));
  container.appendChild(row);
}

function createTableCell(text: string, className: string): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

export function updateModelDescription(el: DemoElements, state: AppState): void {
  if (!el.modelDescription) return;
  if (state.modelType === "hybrid") {
    el.modelDescription.textContent =
      "Tail-spliced hybrid model: shape-preserving PCHIP body spliced onto an asymptotic Pareto tail with C^1 derivative continuity.";
  } else if (state.modelType === "pchip") {
    el.modelDescription.textContent =
      "Shape-preserving piecewise cubic Hermite interpolating polynomial (PCHIP) with harmonic slope weighting and iterative convexity cone projection.";
  } else {
    el.modelDescription.textContent =
      "Natural C^2 cubic spline: smooth twice-differentiable polynomial solved via Thomas algorithm. May exhibit oscillatory overshoot on coarse data.";
  }
}

function collectValidationEntries(
  state: AppState
): Array<{ label: string; message: string; isError: boolean }> {
  const entries: Array<{ label: string; message: string; isError: boolean }> = [];

  for (const err of state.validation.errors) {
    entries.push({ label: "Knot Error:", message: err.message, isError: true });
  }
  if (state.paramValidation.meanIncomeError) {
    entries.push({
      label: "Parameter Error:",
      message: state.paramValidation.meanIncomeError,
      isError: true
    });
  }
  if (state.paramValidation.povertyLineError) {
    entries.push({
      label: "Parameter Error:",
      message: state.paramValidation.povertyLineError,
      isError: true
    });
  }
  if (state.paramValidation.spliceError) {
    entries.push({
      label: "Splicing Error:",
      message: state.paramValidation.spliceError,
      isError: true
    });
  }
  for (const warn of state.validation.warnings) {
    entries.push({ label: "Warning:", message: warn, isError: false });
  }
  if (state.paramValidation.povertyLineWarning) {
    entries.push({
      label: "Notice:",
      message: state.paramValidation.povertyLineWarning,
      isError: false
    });
  }

  return entries;
}

export function setStatusBadge(
  badge: HTMLElement | null,
  status: "pass" | "error",
  text: string,
  title?: string
): void {
  if (!badge) return;
  badge.className = status === "pass" ? "badge badge-dark" : "badge badge-error";
  badge.textContent = text;
  if (title) {
    badge.title = title;
  } else {
    badge.removeAttribute("title");
  }
}

export function renderValidationErrorBadge(el: DemoElements, state: AppState): void {
  const errors = collectValidationEntries(state)
    .filter((entry) => entry.isError)
    .map((entry) => entry.message);

  if (errors.length === 0) {
    setStatusBadge(el.badgeStatus, "error", "Validation error");
    return;
  }

  const summary = errors.length === 1 ? errors[0] : `${errors[0]} (+${errors.length - 1} more)`;
  setStatusBadge(el.badgeStatus, "error", summary, errors.join("\n"));
}

export function updateAlerts(el: DemoElements, state: AppState): void {
  if (!el.alertContainer || !el.alertContent) return;

  el.alertContent.replaceChildren();
  const entries = collectValidationEntries(state);

  if (entries.length > 0) {
    el.alertContainer.style.display = "block";
    for (const entry of entries) {
      appendAlertLine(el.alertContent, entry.label, entry.message);
    }
  } else {
    el.alertContainer.style.display = "none";
  }
}

export function renderMacroMetrics(
  el: DemoElements,
  state: AppState,
  metrics: InequalityMetrics
): void {
  if (el.outGini) el.outGini.textContent = metrics.giniIndex.toFixed(4);
  if (el.outGastwirth) {
    el.outGastwirth.textContent = `[${state.currentGastwirth.lowerBound.toFixed(4)}, ${state.currentGastwirth.upperBound.toFixed(4)}]`;
  }
  if (el.outPalma) {
    el.outPalma.textContent = isFinite(metrics.palmaRatio) ? metrics.palmaRatio.toFixed(2) : "N/A";
  }
  if (el.outSen) {
    el.outSen.textContent = `${Math.round(metrics.senWelfareIndex).toLocaleString()} ${state.currency}`;
  }
  if (el.outHeadcount) {
    el.outHeadcount.textContent = `${(state.currentHeadcount * 100).toFixed(1)}%`;
  }
  if (el.outAlpha) {
    if (state.modelType === "hybrid" && state.currentModel instanceof HybridLorenzCurve) {
      el.outAlpha.textContent = state.currentModel.getTailAlpha().toFixed(2);
    } else {
      el.outAlpha.textContent = "N/A";
    }
  }

  if (el.outBenchmarkGini && el.labelBenchmarkGini && el.outErrorGini && el.labelErrorGini) {
    if (state.benchmarkGini !== null) {
      const trueG = state.benchmarkGini;
      const diff = metrics.giniIndex - trueG;
      const relErr = (Math.abs(diff) / trueG) * 100;
      const sign = diff >= 0 ? "+" : "";

      if (state.benchmarkType === "synthetic") {
        el.labelBenchmarkGini.textContent = "Analytical Gini (G*)";
        el.outBenchmarkGini.textContent = `${trueG.toFixed(4)}`;
        el.labelErrorGini.textContent = "Estimation Error (|ΔG|)";
        el.outErrorGini.textContent = `${sign}${diff.toFixed(4)} (${relErr.toFixed(2)}%)`;
      } else {
        el.labelBenchmarkGini.textContent = "Official Agency Gini";
        el.outBenchmarkGini.textContent = `${trueG.toFixed(4)}`;
        el.labelErrorGini.textContent = "Disparity vs Official";
        el.outErrorGini.textContent = `${sign}${diff.toFixed(4)} (${relErr.toFixed(2)}%)`;
      }
    } else {
      el.labelBenchmarkGini.textContent = "Benchmark Ground Truth";
      el.outBenchmarkGini.textContent = "N/A (Custom Data)";
      el.labelErrorGini.textContent = "Gastwirth Max Error Bound";
      el.outErrorGini.textContent = `±${state.currentGastwirth.maxError.toFixed(4)}`;
    }
  }

  if (el.outTop1AndElasticity && el.outTop10And01) {
    if (metrics.topIncomeShares) {
      const t1 = (metrics.topIncomeShares.top1PercentShare * 100).toFixed(2);
      const t10 = (metrics.topIncomeShares.top10PercentShare * 100).toFixed(1);
      const t01 = (metrics.topIncomeShares.top01PercentShare * 100).toFixed(2);
      const ez = metrics.povertyElasticities
        ? metrics.povertyElasticities.elasticityZ.toFixed(2)
        : "N/A";
      el.outTop1AndElasticity.textContent = `${t1}% (ε_z: +${ez})`;
      el.outTop10And01.textContent = `${t10}% / ${t01}%`;
    } else {
      el.outTop1AndElasticity.textContent = "—";
      el.outTop10And01.textContent = "—";
    }
  }

  if (state.currentGastwirth.isCertified) {
    setStatusBadge(el.badgeStatus, "pass", "G_est in [G_L, Ĝ_U]");
  } else {
    const boundsMsg = `Outside Gastwirth bounds: Gini ${metrics.giniIndex.toFixed(4)} not in [${state.currentGastwirth.lowerBound.toFixed(4)}, ${state.currentGastwirth.upperBound.toFixed(4)}]`;
    setStatusBadge(el.badgeStatus, "error", boundsMsg, boundsMsg);
  }
}

export function renderModelSelectionTable(
  el: DemoElements,
  comparison: readonly ModelEvaluationRecord[]
): void {
  if (el.modelSelectionTableBody) {
    el.modelSelectionTableBody.replaceChildren();
    for (const rec of comparison) {
      const tr = document.createElement("tr");
      const isBest = rec.deltaAic === 0;
      if (isBest) tr.className = "best-model-row";

      const deltaAicStr = rec.deltaAic === 0 ? "0.00" : `+${rec.deltaAic.toFixed(2)}`;
      const weightPct = `${(rec.akaikeWeight * 100).toFixed(1)}%`;
      const evidenceStr = isFinite(rec.evidenceRatio)
        ? rec.evidenceRatio <= 1.01
          ? "1.0×"
          : `${rec.evidenceRatio.toFixed(1)}×`
        : "—";

      const nameCell = document.createElement("td");
      nameCell.className = "model-name";
      nameCell.appendChild(document.createTextNode(rec.modelName));
      if (isBest) {
        nameCell.appendChild(document.createTextNode(" "));
        const badge = document.createElement("span");
        badge.className = "badge badge-secondary ms-1";
        badge.style.fontSize = "0.62rem";
        badge.textContent = "Lowest AICc";
        nameCell.appendChild(badge);
      }

      tr.appendChild(nameCell);
      tr.appendChild(createTableCell(String(rec.parameterCount), "text-center font-monospace"));
      tr.appendChild(
        createTableCell(`${(rec.rmse * 10000).toFixed(2)}‱`, "text-end font-monospace")
      );
      tr.appendChild(createTableCell(rec.logLikelihood.toFixed(2), "text-end font-monospace"));
      tr.appendChild(createTableCell(rec.aicc.toFixed(2), "text-end font-monospace"));
      tr.appendChild(createTableCell(deltaAicStr, "text-end font-monospace"));
      tr.appendChild(createTableCell(weightPct, "text-end font-monospace"));
      tr.appendChild(createTableCell(evidenceStr, "text-end font-monospace"));
      el.modelSelectionTableBody.appendChild(tr);
    }
  }

  if (el.badgeBestModel && comparison.length > 0) {
    const best = comparison[0];
    el.badgeBestModel.textContent = `Lowest In-Sample AICc: ${best.modelName} (wᵢ = ${(best.akaikeWeight * 100).toFixed(1)}%)`;
  }
}
