import { LorenzModel } from "./LorenzModel.js";
import { GiniResult } from "./types.js";

// Strategy interface for numerical quadrature algorithms
export interface NumericalIntegrator {
  readonly name: string;

  // Computes the definite integral of L(p) from a to b and returns the Gini coefficient
  integrate(model: LorenzModel, a: number, b: number, stepCount: number): GiniResult;
}
