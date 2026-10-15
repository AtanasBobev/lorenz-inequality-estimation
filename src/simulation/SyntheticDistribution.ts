import { QuantileDataset } from "../core/types.js";

export interface SyntheticDistribution {
  readonly name: string;
  readonly theoreticalGini: number;
  evaluateLorenz(p: number): number;
  sampleQuantiles(k: number, meanIncome?: number): QuantileDataset;
}
