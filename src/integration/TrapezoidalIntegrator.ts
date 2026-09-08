import { LorenzModel } from "../core/LorenzModel.js";
import { NumericalIntegrator } from "../core/NumericalIntegrator.js";
import { GiniResult } from "../core/types.js";

// Evaluates the Gini coefficient using the Composite Trapezoidal Rule
// Yields the Gastwirth lower bound because straight chords overestimate the convex area
export class TrapezoidalIntegrator implements NumericalIntegrator {
  public readonly name = "Composite Trapezoidal Rule";

  public integrate(
    model: LorenzModel,
    a: number = 0,
    b: number = 1,
    stepCount: number = 100
  ): GiniResult {
    // Placeholder - to be implemented
    throw new Error("Method not implemented yet.");
  }
}
