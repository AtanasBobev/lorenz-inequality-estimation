import { LorenzModel } from "./LorenzModel.js";
import { RootResult } from "./types.js";

// Strategy interface for root-finding algorithms used to invert the Lorenz curve
export interface RootFinder {
  readonly name: string;

  // Solves L(p) - targetIncomeShare = 0 for the unknown population percentile p*
  findRoot(
    model: LorenzModel,
    targetIncomeShare: number,
    lowerBound: number,
    upperBound: number,
    tolerance: number,
    maxIterations?: number
  ): RootResult;
}
