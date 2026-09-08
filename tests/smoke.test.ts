import { describe, it, expect } from "vitest";
import {
  PchipLorenzCurve,
  TrapezoidalIntegrator,
  SimpsonsIntegrator,
  NewtonRaphsonSolver,
  BisectionSolver,
  InequalityEngine,
  ConsumptionRegressor
} from "../src/index.js";

describe("Boilerplate Architecture Smoke Test", () => {
  const dummyDataset = {
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.5, incomeShare: 0.2 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ],
    meanIncome: 50000
  };

  it("instantiates core classes without error", () => {
    const model = new PchipLorenzCurve(dummyDataset);
    const trapezoid = new TrapezoidalIntegrator();
    const simpson = new SimpsonsIntegrator();
    const newton = new NewtonRaphsonSolver();
    const bisection = new BisectionSolver();
    const engine = new InequalityEngine(model, trapezoid, newton);
    const regressor = new ConsumptionRegressor();

    expect(model).toBeDefined();
    expect(trapezoid.name).toBe("Composite Trapezoidal Rule");
    expect(simpson.name).toBe("Composite Simpson's Rule");
    expect(newton.name).toBe("Newton-Raphson");
    expect(bisection.name).toBe("Bisection Method");
    expect(engine).toBeDefined();
    expect(regressor).toBeDefined();
  });
});
