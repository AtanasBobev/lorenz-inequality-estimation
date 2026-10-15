import { describe, it, expect } from "vitest";
import {
  InequalityEngine,
  PchipLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  QuantileDataset,
  BULGARIAN_NSI_2022
} from "../src/index.js";

const testDataset: QuantileDataset = {
  meanIncome: 10000,
  points: [
    { populationShare: 0.0, incomeShare: 0.0 },
    { populationShare: 0.2, incomeShare: 0.05 },
    { populationShare: 0.4, incomeShare: 0.15 },
    { populationShare: 0.6, incomeShare: 0.35 },
    { populationShare: 0.8, incomeShare: 0.6 },
    { populationShare: 1.0, incomeShare: 1.0 }
  ]
};

describe("Poverty Headcount Estimation via Hybrid Root-Finding", () => {
  const model = new PchipLorenzCurve(testDataset);
  const engine = new InequalityEngine(model, new SimpsonsIntegrator(), new BisectionSolver());

  it("returns 0 for negative or zero poverty thresholds", () => {
    expect(engine.getPovertyHeadcount(0)).toBe(0);
    expect(engine.getPovertyHeadcount(-500)).toBe(0);
  });

  it("returns 0 when poverty line is at or below the minimum marginal income", () => {
    const minIncome = 10000 * model.derivative(0);
    expect(engine.getPovertyHeadcount(minIncome * 0.5)).toBe(0);
  });

  it("returns 1.0 when poverty line is at or above maximum marginal income", () => {
    const maxIncome = 10000 * model.derivative(1.0);
    expect(engine.getPovertyHeadcount(maxIncome * 1.5)).toBe(1.0);
  });

  it("accurately inverts poverty line to find population headcount ratio", () => {
    // Pick an interior percentile p_target = 0.25
    const pTarget = 0.25;
    const marginalIncomeAt25 = 10000 * model.derivative(pTarget);

    const estimatedHeadcount = engine.getPovertyHeadcount(marginalIncomeAt25);
    expect(estimatedHeadcount).toBeCloseTo(pTarget, 4);

    // Marginal income at recovered headcount should match target poverty line within tolerance
    const recoveredIncome = 10000 * model.derivative(estimatedHeadcount);
    expect(recoveredIncome).toBeCloseTo(marginalIncomeAt25, 2);
  });

  it("evaluates Bulgarian NSI 2022 official poverty threshold (258 EUR/month, 3,092 EUR/year)", () => {
    const nsiModel = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
    const nsiEngine = new InequalityEngine(
      nsiModel,
      new SimpsonsIntegrator(),
      new BisectionSolver()
    );

    // Official annual poverty line = 3,092 EUR (258 EUR/month)
    const headcount = nsiEngine.getPovertyHeadcount(BULGARIAN_NSI_2022.metadata.povertyLine);

    // On the decile distribution, marginal income reaches 3,092 EUR at ~32.9% of the population
    expect(headcount).toBeGreaterThan(0.28);
    expect(headcount).toBeLessThan(0.36);
    expect(headcount).toBeCloseTo(0.329, 2);

    // Verify root condition: y(p*) = mu * L'(p*) = 3092 EUR
    const marginalIncome = BULGARIAN_NSI_2022.dataset.meanIncome * nsiModel.derivative(headcount);
    expect(marginalIncome).toBeCloseTo(BULGARIAN_NSI_2022.metadata.povertyLine, 1);
  });
});
