import { QuantilePoint } from "../../src/index.js";

export function renderTable(
  tableBody: HTMLElement | null,
  points: QuantilePoint[],
  onUpdate: (index: number, field: "p" | "L", val: number) => void,
  onDelete: (index: number) => void
): void {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  points.forEach((pt, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="number" step="0.01" min="0" max="1" class="tbl-input" value="${pt.populationShare.toFixed(3)}" data-idx="${index}" data-field="p"></td>
      <td><input type="number" step="0.001" min="0" max="1" class="tbl-input" value="${pt.incomeShare.toFixed(4)}" data-idx="${index}" data-field="L"></td>
      <td><button class="btn-del" data-delete="${index}" ${index === 0 || index === points.length - 1 ? "disabled style='visibility:hidden'" : ""}>×</button></td>
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
