import { describe, it, expect } from "vitest";
import {
  LorenzModel,
  QuantileDataset,
  SimpsonsIntegrator,
  TrapezoidalIntegrator
} from "../src/index.js";

class PolynomialLorenzModel extends LorenzModel {
  private readonly power: number;

  constructor(power: number) {
    const dummyDataset: QuantileDataset = {
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 1, incomeShare: 1 }
      ],
      meanIncome: 1000
    };
    super(dummyDataset);
    this.power = power;
  }

  public evaluate(p: number): number {
    return Math.pow(p, this.power);
  }

  public derivative(p: number): number {
    return this.power * Math.pow(p, this.power - 1);
  }

  public secondDerivative(p: number): number {
    return this.power * (this.power - 1) * Math.pow(p, this.power - 2);
  }
}

describe("Numerical Quadrature Integrators", () => {
  const simpson = new SimpsonsIntegrator();
  const trapezoid = new TrapezoidalIntegrator();

  it("integrates line of perfect equality exactly", () => {
    const linearModel = new PolynomialLorenzModel(1);

    const simpResult = simpson.integrate(linearModel, 0, 1, 100);
    const trapResult = trapezoid.integrate(linearModel, 0, 1, 100);

    expect(simpResult.areaUnderCurve).toBeCloseTo(0.5, 9);
    expect(simpResult.giniIndex).toBeCloseTo(0.0, 9);

    expect(trapResult.areaUnderCurve).toBeCloseTo(0.5, 9);
    expect(trapResult.giniIndex).toBeCloseTo(0.0, 9);
  });

  it("integrates quadratic Lorenz curve exactly with Simpson's rule", () => {
    const quadModel = new PolynomialLorenzModel(2);

    // Integral of p^2 from 0 to 1 is 1/3; Gini = 1 - 2/3 = 1/3
    const simpResult = simpson.integrate(quadModel, 0, 1, 100);
    expect(simpResult.areaUnderCurve).toBeCloseTo(1 / 3, 9);
    expect(simpResult.giniIndex).toBeCloseTo(1 / 3, 9);

    // Trapezoidal rule overestimates convex area, yielding a lower Gini
    const trapResult = trapezoid.integrate(quadModel, 0, 1, 100);
    expect(trapResult.areaUnderCurve).toBeGreaterThan(1 / 3);
    expect(trapResult.giniIndex).toBeLessThan(1 / 3);
  });

  it("integrates cubic Lorenz curve exactly with Simpson's rule", () => {
    const cubicModel = new PolynomialLorenzModel(3);

    // Integral of p^3 from 0 to 1 is 1/4 = 0.25; Gini = 1 - 2(0.25) = 0.5
    const simpResult = simpson.integrate(cubicModel, 0, 1, 100);
    expect(simpResult.areaUnderCurve).toBeCloseTo(0.25, 9);
    expect(simpResult.giniIndex).toBeCloseTo(0.5, 9);
  });

  it("handles odd step counts in Simpson's integrator gracefully", () => {
    const quadModel = new PolynomialLorenzModel(2);
    const result = simpson.integrate(quadModel, 0, 1, 101);
    expect(result.areaUnderCurve).toBeCloseTo(1 / 3, 8);
  });

  it("throws on invalid bounds or step counts", () => {
    const quadModel = new PolynomialLorenzModel(2);

    expect(() => simpson.integrate(quadModel, 1, 0, 100)).toThrow();
    expect(() => trapezoid.integrate(quadModel, 1, 0, 100)).toThrow();
    expect(() => simpson.integrate(quadModel, 0, 1, 1)).toThrow();
    expect(() => trapezoid.integrate(quadModel, 0, 1, 0)).toThrow();
  });
});
