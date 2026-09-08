import { QuantileDataset } from "./types.js";

// Abstract base class representing a continuous Lorenz curve model L(p).
// Concrete subclasses provide specific interpolation strategies such as PCHIP or cubic splines.
export abstract class LorenzModel {
  protected readonly dataset: QuantileDataset;

  constructor(dataset: QuantileDataset) {
    this.dataset = dataset;
  }

  // Evaluates cumulative income share L(p) at population share p
  public abstract evaluate(p: number): number;

  // Evaluates first derivative L'(p) = y(p) / mu (relative income share)
  public abstract derivative(p: number): number;

  // Evaluates second derivative L''(p) for convexity analysis
  public abstract secondDerivative(p: number): number;

  // Verifies that the reconstructed curve satisfies economic monotonicity (L'(p) >= 0)
  public abstract isMonotonic(sampleCount?: number): boolean;

  // Verifies that the curve satisfies economic convexity (L''(p) >= 0)
  public abstract isConvex(sampleCount?: number): boolean;

  public getDataset(): QuantileDataset {
    return this.dataset;
  }
}
