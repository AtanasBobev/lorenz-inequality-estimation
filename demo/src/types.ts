import { QuantileDataset, GastwirthCertificate } from "../../src/index.js";

export type ModelType = "hybrid" | "pchip" | "cubicspline";

export interface AppState {
  dataset: QuantileDataset;
  modelType: ModelType;
  splicingThreshold: number;
  povertyLine: number;
  currentModel: any;
  currentHeadcount: number;
  currentGastwirth: GastwirthCertificate;
}
