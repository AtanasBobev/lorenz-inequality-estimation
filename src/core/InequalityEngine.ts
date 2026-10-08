import { LorenzModel } from "./LorenzModel.js";
import { NumericalIntegrator } from "./NumericalIntegrator.js";
import { RootFinder } from "./RootFinder.js";
import { GiniResult, WelfareResult, GastwirthCertificate, InequalityMetrics } from "./types.js";

export class InequalityEngine {
  private model: LorenzModel;
  private integrator: NumericalIntegrator;
  private rootFinder: RootFinder;

  constructor(model: LorenzModel, integrator: NumericalIntegrator, rootFinder: RootFinder) {
    this.model = model;
    this.integrator = integrator;
    this.rootFinder = rootFinder;
  }

  public computeGini(stepCount: number = 100): GiniResult {
    return this.integrator.integrate(this.model, 0, 1, stepCount);
  }

  public computeSenWelfare(stepCount: number = 100): WelfareResult {
    const gini = this.computeGini(stepCount);
    const meanIncome = this.model.getDataset().meanIncome;
    const senWelfareIndex = meanIncome * (1 - gini.giniIndex);

    return {
      senWelfareIndex,
      meanIncome,
      giniIndex: gini.giniIndex
    };
  }

  public computePalmaRatio(): number {
    const top10Share = 1 - this.model.evaluate(0.9);
    const bottom40Share = this.model.evaluate(0.4);

    if (bottom40Share <= 0) {
      return Infinity;
    }
    return top10Share / bottom40Share;
  }

  public findPercentileHoldingShare(targetShare: number): number {
    if (targetShare < 0 || targetShare > 1) {
      throw new Error(`Target income share must be in [0, 1], received ${targetShare}.`);
    }
    const result = this.rootFinder.findRoot(this.model, targetShare, 0, 1, 1e-7);
    return result.root;
  }

  public getIncomeAtPercentile(p: number): number {
    return this.model.quantileIncome(p);
  }

  // Solves for poverty headcount ratio H where marginal income equals povertyLine.
  public getPovertyHeadcount(
    povertyLine: number,
    meanIncome?: number,
    tolerance: number = 1e-7,
    maxIterations: number = 60
  ): number {
    if (povertyLine <= 0) {
      return 0.0;
    }

    const mu = meanIncome ?? this.model.getDataset().meanIncome;
    if (mu <= 0) {
      throw new Error(`Mean income must be strictly positive, received ${mu}.`);
    }

    // Check boundary marginal incomes
    const y0 = mu * this.model.derivative(0.0);
    if (povertyLine <= y0) {
      return 0.0;
    }

    const y1 = mu * this.model.derivative(1.0);
    if (povertyLine >= y1) {
      return 1.0;
    }

    // Monotone bracketing interval [a, b] where g(a) <= 0 and g(b) >= 0
    let a = 0.0;
    let b = 1.0;

    // Informed initial guess based on linear interpolation between boundary derivatives
    let p = Math.max(1e-4, Math.min(1.0 - 1e-4, (povertyLine - y0) / Math.max(1e-6, y1 - y0)));

    for (let iter = 0; iter < maxIterations; iter++) {
      const currentIncome = mu * this.model.derivative(p);
      const residual = currentIncome - povertyLine;

      if (Math.abs(residual) <= tolerance * Math.max(1.0, povertyLine)) {
        return p;
      }

      if (residual < 0) {
        a = p;
      } else {
        b = p;
      }

      const intervalWidth = b - a;
      if (intervalWidth <= tolerance) {
        return 0.5 * (a + b);
      }

      // Compute derivative g'(p) = mu * L''(p)
      const dResidual = mu * this.model.secondDerivative(p);

      // Attempt Newton-Raphson step if second derivative provides reliable gradient
      let stepAccepted = false;
      if (dResidual > 1e-12) {
        const pNewton = p - residual / dResidual;
        // Accept Newton step only if it lands strictly within current bracketing interval [a, b]
        if (pNewton > a + 1e-12 && pNewton < b - 1e-12) {
          p = pNewton;
          stepAccepted = true;
        }
      }

      // Fallback to bisection step if Newton step was invalid, divergent, or degenerate
      if (!stepAccepted) {
        p = 0.5 * (a + b);
      }
    }

    return 0.5 * (a + b);
  }

  // Certifies that estimated Gini lies within Gastwirth bounds [G_L, G_U].
  public certifyGastwirthBounds(estimatedGini?: number): GastwirthCertificate {
    const dataset = this.model.getDataset();
    const points = dataset.points;
    const k = points.length - 1;

    let chordArea = 0.0;
    const secants: number[] = [];

    for (let i = 1; i <= k; i++) {
      const hi = points[i].populationShare - points[i - 1].populationShare;
      const deltaL = points[i].incomeShare - points[i - 1].incomeShare;
      secants.push(deltaL / hi);
      chordArea += 0.5 * hi * (points[i].incomeShare + points[i - 1].incomeShare);
    }

    const lowerBound = Math.max(0.0, 1.0 - 2.0 * chordArea);

    let deltaG = 0.0;
    for (let i = 0; i < k; i++) {
      const hi = points[i + 1].populationShare - points[i].populationShare;
      const sPrev = i > 0 ? secants[i - 1] : 0.0;
      const sNext = i < k - 1 ? secants[i + 1] : secants[i] * 1.5;
      deltaG += 0.5 * hi * hi * (sNext - sPrev);
    }

    const upperBound = Math.min(1.0, lowerBound + deltaG);
    const intervalWidth = upperBound - lowerBound;

    const gEst = estimatedGini ?? this.computeGini(200).giniIndex;
    const isCertified = gEst >= lowerBound - 1e-7 && gEst <= upperBound + 1e-7;
    const maxError = 0.5 * intervalWidth;

    return {
      lowerBound,
      upperBound,
      intervalWidth,
      estimatedGini: gEst,
      isCertified,
      maxError
    };
  }

  // Evaluates complete inequality metrics including Gini, Sen index, Palma ratio, and bounds.
  public computeComprehensiveMetrics(
    stepCount: number = 200,
    povertyLine?: number
  ): InequalityMetrics {
    const giniResult = this.computeGini(stepCount);
    const senWelfare = this.computeSenWelfare(stepCount);
    const palmaRatio = this.computePalmaRatio();
    const gastwirthCertificate = this.certifyGastwirthBounds(giniResult.giniIndex);

    let povertyHeadcount: number | undefined = undefined;
    if (povertyLine !== undefined) {
      povertyHeadcount = this.getPovertyHeadcount(povertyLine);
    }

    return {
      giniIndex: giniResult.giniIndex,
      senWelfareIndex: senWelfare.senWelfareIndex,
      palmaRatio,
      areaUnderCurve: giniResult.areaUnderCurve,
      meanIncome: this.model.getDataset().meanIncome,
      povertyHeadcount,
      povertyLine,
      gastwirthCertificate
    };
  }

  public setIntegrator(integrator: NumericalIntegrator): void {
    this.integrator = integrator;
  }

  public setRootFinder(rootFinder: RootFinder): void {
    this.rootFinder = rootFinder;
  }

  public setModel(model: LorenzModel): void {
    this.model = model;
  }

  public getModel(): LorenzModel {
    return this.model;
  }

  public getIntegrator(): NumericalIntegrator {
    return this.integrator;
  }

  public getRootFinder(): RootFinder {
    return this.rootFinder;
  }
}
