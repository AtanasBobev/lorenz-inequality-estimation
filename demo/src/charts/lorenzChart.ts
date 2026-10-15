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

  const pad = { left: 52, right: 28, top: 24, bottom: 44 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const toX = (p: number) => pad.left + p * plotW;
  const toY = (L: number) => pad.top + (1 - L) * plotH;

  // Grid lines
  ctx.strokeStyle = "#e9ecef";
  ctx.lineWidth = 1;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#6c757d";
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

  // Axis labels
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#212529";
  ctx.fillText("Cumulative population share (p)", pad.left + plotW / 2, h - 10);

  ctx.save();
  ctx.translate(15, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Cumulative income share L(p)", 0, 0);
  ctx.restore();

  // Gastwirth bounding envelope
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fill();

    // Gastwirth lower bound chords
    ctx.strokeStyle = "#adb5bd";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Line of equality
  ctx.strokeStyle = "#adb5bd";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(0));
  ctx.lineTo(toX(1), toY(1));
  ctx.stroke();
  ctx.setLineDash([]);

  // Lorenz curve
  if (state.currentModel && state.validation.isValid) {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.4;
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

  // Splicing threshold marker
  if (state.modelType === "hybrid" && state.currentModel && state.validation.isValid) {
    const pStar = state.splicingThreshold;
    const lStar = state.currentModel.evaluate(pStar);
    const xStar = toX(pStar);
    const yStar = toY(lStar);

    ctx.strokeStyle = "#6c757d";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(xStar, pad.top);
    ctx.lineTo(xStar, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Splicing point marker
    const s = 5.5;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#212529";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(xStar, yStar - s);
    ctx.lineTo(xStar + s, yStar);
    ctx.lineTo(xStar, yStar + s);
    ctx.lineTo(xStar - s, yStar);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Poverty headcount marker
  if (state.currentHeadcount > 0 && state.currentHeadcount < 1 && state.currentModel && state.validation.isValid) {
    const hP = state.currentHeadcount;
    const hL = state.currentModel.evaluate(hP);
    const xH = toX(hP);
    const yH = toY(hL);

    ctx.strokeStyle = "#495057";
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(xH, pad.top);
    ctx.lineTo(xH, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Headcount marker
    ctx.fillStyle = "#212529";
    ctx.fillRect(xH - 3.5, yH - 3.5, 7, 7);
  }

  // Quantile knots
  for (const pt of pts) {
    const x = toX(pt.populationShare);
    const y = toY(pt.incomeShare);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(x, y, 2.0, 0, Math.PI * 2);
    ctx.fill();
  }
}
