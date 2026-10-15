import { QuantilePoint } from "../../src/index.js";
import { ValidationReport } from "./validation.js";

export function renderTable(
  tableBody: HTMLElement | null,
  points: QuantilePoint[],
  validation: ValidationReport,
  onUpdate: (index: number, field: "p" | "L", val: number) => void,
  onDelete: (index: number) => void
): void {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const errorsByRow = new Map<number, Set<string>>();
  for (const err of validation.errors) {
    if (!errorsByRow.has(err.rowIndex)) {
      errorsByRow.set(err.rowIndex, new Set<string>());
    }
    errorsByRow.get(err.rowIndex)!.add(err.field);
  }

  points.forEach((pt, index) => {
    const isFirst = index === 0;
    const isLast = index === points.length - 1;
    const rowErrors = errorsByRow.get(index);

    const hasPError = rowErrors ? rowErrors.has("p") || rowErrors.has("all") : false;
    const hasLError = rowErrors ? rowErrors.has("L") || rowErrors.has("all") : false;

    const tr = document.createElement("tr");
    if (rowErrors && rowErrors.size > 0) {
      tr.className = "table-row-invalid";
    }

    const pClass = `form-control form-control-sm font-monospace ${hasPError ? "is-invalid" : ""}`;
    const lClass = `form-control form-control-sm font-monospace ${hasLError ? "is-invalid" : ""}`;

    const lockBadge = isFirst
      ? `<span class="badge badge-secondary" title="Anchor (0, 0)">0.000</span>`
      : isLast
      ? `<span class="badge badge-secondary" title="Anchor (1, 1)">1.000</span>`
      : "";

    tr.innerHTML = `
      <td class="text-muted text-center py-1" style="width: 32px; font-size: 0.75rem;">${index + 1}</td>
      <td class="py-1">
        ${
          isFirst || isLast
            ? lockBadge
            : `<input type="number" step="0.01" min="0" max="1" class="${pClass}" value="${pt.populationShare.toFixed(3)}" data-idx="${index}" data-field="p">`
        }
      </td>
      <td class="py-1">
        ${
          isFirst || isLast
            ? lockBadge
            : `<input type="number" step="0.001" min="0" max="1" class="${lClass}" value="${pt.incomeShare.toFixed(4)}" data-idx="${index}" data-field="L">`
        }
      </td>
      <td class="text-center py-1" style="width: 38px;">
        ${
          isFirst || isLast
            ? `<span class="text-muted" style="font-size: 0.8rem;">🔒</span>`
            : `<button class="btn btn-sm btn-outline-secondary py-0 px-1" data-delete="${index}" title="Remove knot" style="line-height: 1.2;">&times;</button>`
        }
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Attach event handlers
  tableBody.oninput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const idx = parseInt(target.getAttribute("data-idx") || "-1", 10);
    const field = target.getAttribute("data-field") as "p" | "L";
    const val = parseFloat(target.value);
    if (!isNaN(val) && idx >= 0) {
      onUpdate(idx, field, val);
    }
  };

  tableBody.onclick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const delIdx = target.getAttribute("data-delete");
    if (delIdx !== null) {
      const idx = parseInt(delIdx, 10);
      onDelete(idx);
    }
  };
}
