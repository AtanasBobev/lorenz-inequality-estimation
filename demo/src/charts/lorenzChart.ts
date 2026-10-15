import { AppState } from "../types.js";

export function renderLorenzChart(canvas: HTMLCanvasElement | null, state: AppState): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const w = rect.width > 50 ? rect.width : 580;
  const h = rect.height > 50 ? rect.height : 380;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  const pad = { left: 50, right: 25, top: 25, bottom: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const toX = (p: number) => pad.left + p * plotW;
  const toY = (L: number) => pad.top + (1 - L) * plotH;

  // Grid lines
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "center";

  for (let i = 0; i <= 5; i++) {
    const val = i / 5;
    const x = toX(val);
    const y = toY(val);

    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    ctx.fillText(val.toFixed(1), x, pad.top + plotH + 16);
    ctx.textAlign = "right";
    ctx.fillText(val.toFixed(1), pad.left - 8, y + 4);
    ctx.textAlign = "center";
  }

  // Axis Labels
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#374151";
  ctx.fillText("Cumulative population share p", pad.left + plotW / 2, h - 8);

  ctx.save();
  ctx.translate(14, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Cumulative income share L(p)", 0, 0);
  ctx.restore();

  // Shaded Gastwirth envelope
  const pts = state.dataset.points;
  if (pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(toX(pts[0].populationShare), toY(pts[0].incomeShare));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toX(pts[i].populationShare), toY(pts[i].incomeShare));
    }
    ctx.lineTo(toX(1), toY(1));
    ctx.lineTo(toX(0), toY(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(224, 231, 255, 0.5)";
    ctx.fill();
  }

  // 45-degree Line of Perfect Equality
  ctx.strokeStyle = "#9ca3af";
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(0));
  ctx.lineTo(toX(1), toY(1));
  ctx.stroke();
  ctx.setLineDash([]);

  // Continuous Lorenz Curve
  if (state.currentModel) {
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const L = state.currentModel.evaluate(p);
      const x = toX(p);
      const y = toY(L);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Splicing threshold indicator
  if (state.modelType === "hybrid") {
    const xS = toX(state.splicingThreshold);
    const yS = toY(
      state.currentModel
        ? state.currentModel.evaluate(state.splicingThreshold)
        : state.splicingThreshold
    );

    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.arc(xS, yS, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Poverty headcount crosshair
  if (state.currentHeadcount > 0 && state.currentHeadcount < 1) {
    const pZ = state.currentHeadcount;
    const lZ = state.currentModel ? state.currentModel.evaluate(pZ) : 0;
    const xZ = toX(pZ);
    const yZ = toY(lZ);

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(xZ, pad.top + plotH);
    ctx.lineTo(xZ, yZ);
    ctx.lineTo(pad.left, yZ);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(xZ, yZ, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Quantile Knots
  for (let i = 0; i < pts.length; i++) {
    const x = toX(pts[i].populationShare);
    const y = toY(pts[i].incomeShare);
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
