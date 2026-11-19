export interface DemoElements {
  readonly selectPreset: HTMLSelectElement | null;
  readonly selectModelType: HTMLSelectElement | null;
  readonly rangeSplice: HTMLInputElement | null;
  readonly numSplice: HTMLInputElement | null;
  readonly inputMeanIncome: HTMLInputElement | null;
  readonly inputPoverty: HTMLInputElement | null;
  readonly labelCurrency: HTMLElement | null;
  readonly labelPovertyCurrency: HTMLElement | null;
  readonly fileInput: HTMLInputElement | null;
  readonly tableBody: HTMLElement | null;
  readonly btnAddRow: HTMLButtonElement | null;
  readonly btnAutoRepair: HTMLButtonElement | null;
  readonly btnTogglePaste: HTMLButtonElement | null;
  readonly boxPasteArea: HTMLElement | null;
  readonly txtRawInput: HTMLTextAreaElement | null;
  readonly btnApplyPaste: HTMLButtonElement | null;
  readonly alertContainer: HTMLElement | null;
  readonly alertContent: HTMLElement | null;
  readonly canvasLorenz: HTMLCanvasElement | null;
  readonly canvasDerivative: HTMLCanvasElement | null;
  readonly outGini: HTMLElement | null;
  readonly outGastwirth: HTMLElement | null;
  readonly outPalma: HTMLElement | null;
  readonly outSen: HTMLElement | null;
  readonly outHeadcount: HTMLElement | null;
  readonly outAlpha: HTMLElement | null;
  readonly outBenchmarkGini: HTMLElement | null;
  readonly outErrorGini: HTMLElement | null;
  readonly outTop1AndElasticity: HTMLElement | null;
  readonly outTop10And01: HTMLElement | null;
  readonly labelBenchmarkGini: HTMLElement | null;
  readonly labelErrorGini: HTMLElement | null;
  readonly badgeStatus: HTMLElement | null;
  readonly modelDescription: HTMLElement | null;
  readonly btnAutoSelectKnot: HTMLButtonElement | null;
  readonly badgeOptimalKnot: HTMLElement | null;
  readonly modelSelectionTableBody: HTMLElement | null;
  readonly badgeBestModel: HTMLElement | null;
}

export function getDemoElements(): DemoElements {
  return {
    selectPreset: document.getElementById("selectPreset") as HTMLSelectElement | null,
    selectModelType: document.getElementById("selectModelType") as HTMLSelectElement | null,
    rangeSplice: document.getElementById("rangeSplice") as HTMLInputElement | null,
    numSplice: document.getElementById("numSplice") as HTMLInputElement | null,
    inputMeanIncome: document.getElementById("inputMeanIncome") as HTMLInputElement | null,
    inputPoverty: document.getElementById("inputPoverty") as HTMLInputElement | null,
    labelCurrency: document.getElementById("labelCurrency"),
    labelPovertyCurrency: document.getElementById("labelPovertyCurrency"),
    fileInput: document.getElementById("fileInput") as HTMLInputElement | null,
    tableBody: document.getElementById("quantilesTableBody"),
    btnAddRow: document.getElementById("btnAddRow") as HTMLButtonElement | null,
    btnAutoRepair: document.getElementById("btnAutoRepair") as HTMLButtonElement | null,
    btnTogglePaste: document.getElementById("btnTogglePaste") as HTMLButtonElement | null,
    boxPasteArea: document.getElementById("boxPasteArea"),
    txtRawInput: document.getElementById("txtRawInput") as HTMLTextAreaElement | null,
    btnApplyPaste: document.getElementById("btnApplyPaste") as HTMLButtonElement | null,
    alertContainer: document.getElementById("alertContainer"),
    alertContent: document.getElementById("alertContent"),
    canvasLorenz: document.getElementById("canvasLorenz") as HTMLCanvasElement | null,
    canvasDerivative: document.getElementById("canvasDerivative") as HTMLCanvasElement | null,
    outGini: document.getElementById("outGini"),
    outGastwirth: document.getElementById("outGastwirth"),
    outPalma: document.getElementById("outPalma"),
    outSen: document.getElementById("outSen"),
    outHeadcount: document.getElementById("outHeadcount"),
    outAlpha: document.getElementById("outAlpha"),
    outBenchmarkGini: document.getElementById("outBenchmarkGini"),
    outErrorGini: document.getElementById("outErrorGini"),
    outTop1AndElasticity: document.getElementById("outTop1AndElasticity"),
    outTop10And01: document.getElementById("outTop10And01"),
    labelBenchmarkGini: document.getElementById("labelBenchmarkGini"),
    labelErrorGini: document.getElementById("labelErrorGini"),
    badgeStatus: document.getElementById("badgeStatus"),
    modelDescription: document.getElementById("modelDescription"),
    btnAutoSelectKnot: document.getElementById("btnAutoSelectKnot") as HTMLButtonElement | null,
    badgeOptimalKnot: document.getElementById("badgeOptimalKnot"),
    modelSelectionTableBody: document.getElementById("modelSelectionTableBody"),
    badgeBestModel: document.getElementById("badgeBestModel")
  };
}
