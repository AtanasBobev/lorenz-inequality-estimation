import { LorenzModel, QuantileDataset, GastwirthCertificate } from "../../src/index.js";
import { ValidationReport, ParameterValidation } from "./validation.js";

export type ModelType = "hybrid" | "pchip" | "cubicspline";

export interface AppState {
  dataset: QuantileDataset;
  currency: string;
  modelType: ModelType;
  splicingThreshold: number;
  povertyLine: number;
  currentModel: LorenzModel | null;
  currentHeadcount: number;
  currentGastwirth: GastwirthCertificate;
  validation: ValidationReport;
  paramValidation: ParameterValidation;
  benchmarkGini: number | null;
  benchmarkLabel: string | null;
  benchmarkType: "synthetic" | "empirical" | null;
}
