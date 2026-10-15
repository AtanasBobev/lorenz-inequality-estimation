import { AppState } from "../types.js";

export function renderDerivativeChart(canvas: HTMLCanvasElement | null, state: AppState): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const w = rect.width > 50 ? rect.width : 580;
  const h = rect.height > 50 ? rect.height : 220;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  const pad = { left: 50, right: 25, top: 20, bottom: 35 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const maxY = 3.5;
  const toX = (p: number) => pad.left + p * plotW;
  const toY = (val: number) => pad.top + (1 - Math.min(val, maxY) / maxY) * plotH;

  // Grid lines
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "center";

  for (let i = 0; i <= 5; i++) {
    const val = i / 5;
    const x = toX(val);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    ctx.fillText(val.toFixed(1), x, pad.top + plotH + 16);
  }

  const yTicks = [0, 1.0, 2.0, 3.0];
  for (const yt of yTicks) {
    const y = toY(yt);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillText(yt.toFixed(1), pad.left - 8, y + 4);
    ctx.textAlign = "center";
  }

  // Axis Labels
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#374151";
  ctx.fillText("Population share p", pad.left + plotW / 2, h - 5);

  ctx.save();
  ctx.translate(14, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("y(p) / μ", 0, 0);
  ctx.restore();

  // Derivative Curve L'(p)
  if (state.currentModel) {
    ctx.strokeStyle = "#059669";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    const steps = 180;
    for (let i = 1; i <= steps; i++) {
      const p = Math.min(0.99, i / steps);
      const deriv = state.currentModel.derivative(p);
      const x = toX(p);
      const y = toY(deriv);
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Normalized Poverty Threshold horizontal line
  const meanInc = state.dataset.meanIncome || 10000;
  const normThreshold = state.povertyLine / meanInc;
  const yZ = toY(normThreshold);

  ctx.strokeStyle = "#dc2626";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(pad.left, yZ);
  ctx.lineTo(pad.left + plotW, yZ);
  ctx.stroke();
  ctx.setLineDash([]);

  // Poverty headcount intersection point
  if (state.currentHeadcount > 0 && state.currentHeadcount < 0.98) {
    const xZ = toX(state.currentHeadcount);
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(xZ, yZ, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`H = ${(state.currentHeadcount * 100).toFixed(1)}%`, xZ + 8, yZ - 6);
  }
}
