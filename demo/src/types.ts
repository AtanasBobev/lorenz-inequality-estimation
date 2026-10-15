import { QuantileDataset, GastwirthCertificate } from "../../src/index.js";
import { ValidationReport, ParameterValidation } from "./validation.js";

export type ModelType = "hybrid" | "pchip" | "cubicspline";

export interface AppState {
  dataset: QuantileDataset;
  currency: string;
  modelType: ModelType;
  splicingThreshold: number;
  povertyLine: number;
  currentModel: any;
  currentHeadcount: number;
  currentGastwirth: GastwirthCertificate;
  validation: ValidationReport;
  paramValidation: ParameterValidation;
}
