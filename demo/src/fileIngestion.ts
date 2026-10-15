import { DatasetParser, QuantileDataset } from "../../src/index.js";

export function setupFileInput(
  fileInput: HTMLInputElement | null,
  currentMeanIncome: number,
  onLoaded: (dataset: QuantileDataset) => void
): void {
  if (!fileInput) return;

  fileInput.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const reader = new FileReader();

      reader.onload = (ev: ProgressEvent<FileReader>) => {
        try {
          const text = ev.target?.result as string;
          let parsed;
          if (file.name.endsWith(".json")) {
            parsed = DatasetParser.parseJson(text, { name: file.name });
          } else {
            parsed = DatasetParser.parseDelimited(text, { name: file.name });
          }
          const dataset = DatasetParser.toQuantileDataset(parsed, currentMeanIncome || 10000);
          onLoaded(dataset);
        } catch (err: any) {
          alert("Failed to parse file: " + err.message);
        }
      };

      reader.readAsText(file);
    }
  });
}
