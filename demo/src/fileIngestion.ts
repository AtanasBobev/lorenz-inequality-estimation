import { DatasetParser, QuantileDataset } from "../../src/index.js";

export interface FileIngestionResult {
  success: boolean;
  dataset?: QuantileDataset;
  errorMessage?: string;
}

export function parseRawContent(
  text: string,
  fileName: string,
  meanIncome: number
): FileIngestionResult {
  try {
    const trimmed = text.trim();
    if (!trimmed) {
      return { success: false, errorMessage: "Input content is empty." };
    }

    let parsed;
    if (fileName.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      parsed = DatasetParser.parseJson(trimmed, { name: fileName });
    } else {
      parsed = DatasetParser.parseDelimited(trimmed, { name: fileName });
    }

    const dataset = DatasetParser.toQuantileDataset(parsed, meanIncome || 10000);
    return { success: true, dataset };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message || "Failed to parse quantile data."
    };
  }
}

export function setupFileInput(
  fileInput: HTMLInputElement | null,
  getMeanIncome: () => number,
  onResult: (result: FileIngestionResult) => void
): void {
  if (!fileInput) return;

  fileInput.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const reader = new FileReader();

      reader.onload = (ev: ProgressEvent<FileReader>) => {
        const text = ev.target?.result as string;
        const res = parseRawContent(text, file.name, getMeanIncome());
        onResult(res);
        // Reset file input so user can re-upload same file after edits
        target.value = "";
      };

      reader.onerror = () => {
        onResult({
          success: false,
          errorMessage: `Failed to read file ${file.name}.`
        });
      };

      reader.readAsText(file);
    }
  });
}
