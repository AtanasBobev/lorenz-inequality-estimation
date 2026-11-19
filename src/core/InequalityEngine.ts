import { LorenzModel } from "./LorenzModel.js";
import { NumericalIntegrator } from "./NumericalIntegrator.js";
import { RootFinder } from "./RootFinder.js";
import {
  GiniResult,
  WelfareResult,
  GastwirthCertificate,
  InequalityMetrics,
  TopIncomeShares,
  PovertyElasticities
} from "./types.js";

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

  // Solve mu * L'(H) = povertyLine using safeguarded Newton-Raphson with bisection fallback
  // TODO: Support Foster-Greer-Thorbecke (FGT) poverty gap (alpha=1) and severity (alpha=2) integrals
  public getPovertyHeadcount(
    povertyLine: number,
    meanIncome?: number,
    tolerance: number = 1e-7,
    maxIterations: number = 60
  ): number {
    if (povertyLine <= 0) {
      return 0.0;
    }

    const effectiveMean = meanIncome ?? this.model.getDataset().meanIncome;
    if (effectiveMean <= 0) {
      throw new Error(`Mean income must be strictly positive, received ${effectiveMean}.`);
    }

    // Check marginal income at the endpoints before running the root solver
    const minMarginalIncome = effectiveMean * this.model.derivative(0.0);
    if (povertyLine <= minMarginalIncome) {
      return 0.0;
    }

    const maxMarginalIncome = effectiveMean * this.model.derivative(1.0);
    if (povertyLine >= maxMarginalIncome) {
      return 1.0;
    }

    let leftBound = 0.0;
    let rightBound = 1.0;

    // Start from a linear interpolation guess between the endpoint slopes
    let candidatePercentile = Math.max(
      1e-4,
      Math.min(
        1.0 - 1e-4,
        (povertyLine - minMarginalIncome) / Math.max(1e-6, maxMarginalIncome - minMarginalIncome)
      )
    );

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const currentIncome = effectiveMean * this.model.derivative(candidatePercentile);
      const residual = currentIncome - povertyLine;

      if (Math.abs(residual) <= tolerance * Math.max(1.0, povertyLine)) {
        return candidatePercentile;
      }

      if (residual < 0) {
        leftBound = candidatePercentile;
      } else {
        rightBound = candidatePercentile;
      }

      const bracketWidth = rightBound - leftBound;
      if (bracketWidth <= tolerance) {
        return 0.5 * (leftBound + rightBound);
      }

      // Derivative of residual g(p) is mu * L''(p)
      const residualSlope = effectiveMean * this.model.secondDerivative(candidatePercentile);

      // Take a Newton step if curvature is positive and stays inside [leftBound, rightBound]
      let stepAccepted = false;
      if (residualSlope > 1e-12) {
        const newtonStep = candidatePercentile - residual / residualSlope;
        if (newtonStep > leftBound + 1e-12 && newtonStep < rightBound - 1e-12) {
          candidatePercentile = newtonStep;
          stepAccepted = true;
        }
      }

      if (!stepAccepted) {
        candidatePercentile = 0.5 * (leftBound + rightBound);
      }
    }

    return 0.5 * (leftBound + rightBound);
  }

  // Check the estimated Gini falls inside Gastwirth's (1972) distribution-free bounds [G_L, G_U]
  // TODO: Add non-parametric bootstrap resampling to estimate confidence intervals alongside [G_L, G_U]
  public certifyGastwirthBounds(estimatedGini?: number): GastwirthCertificate {
    const dataset = this.model.getDataset();
    const points = dataset.points;
    const bracketCount = points.length - 1;

    let chordArea = 0.0;
    const secantSlopes: number[] = [];

    for (let i = 1; i <= bracketCount; i++) {
      const stepWidth = points[i].populationShare - points[i - 1].populationShare;
      const incomeIncrement = points[i].incomeShare - points[i - 1].incomeShare;
      secantSlopes.push(incomeIncrement / stepWidth);
      chordArea += 0.5 * stepWidth * (points[i].incomeShare + points[i - 1].incomeShare);
    }

    const lowerBound = Math.max(0.0, 1.0 - 2.0 * chordArea);

    let maxDispersionSpread = 0.0;
    for (let i = 0; i < bracketCount; i++) {
      const stepWidth = points[i + 1].populationShare - points[i].populationShare;
      const prevSlope = i > 0 ? secantSlopes[i - 1] : 0.0;
      const nextSlope = i < bracketCount - 1 ? secantSlopes[i + 1] : secantSlopes[i] * 1.5;
      maxDispersionSpread += 0.5 * stepWidth * stepWidth * (nextSlope - prevSlope);
    }

    const upperBound = Math.min(1.0, lowerBound + maxDispersionSpread);
    const intervalWidth = upperBound - lowerBound;

    const giniEstimate = estimatedGini ?? this.computeGini(200).giniIndex;
    const isCertified = giniEstimate >= lowerBound - 1e-7 && giniEstimate <= upperBound + 1e-7;
    const maxError = 0.5 * intervalWidth;

    return {
      lowerBound,
      upperBound,
      intervalWidth,
      estimatedGini: giniEstimate,
      isCertified,
      maxError
    };
  }

  // Compute income shares held by standard policy brackets (top 10%/5%/1%, bottom 40%/50%, middle 40%)
  public computeTopIncomeShares(): TopIncomeShares {
    const shareAt40 = this.model.evaluate(0.4);
    const shareAt50 = this.model.evaluate(0.5);
    const shareAt90 = this.model.evaluate(0.9);
    const shareAt95 = this.model.evaluate(0.95);
    const shareAt99 = this.model.evaluate(0.99);
    const shareAt999 = this.model.evaluate(0.999);
    const shareAt9999 = this.model.evaluate(0.9999);

    return {
      top10PercentShare: Math.max(0, Math.min(1, 1 - shareAt90)),
      top5PercentShare: Math.max(0, Math.min(1, 1 - shareAt95)),
      top1PercentShare: Math.max(0, Math.min(1, 1 - shareAt99)),
      top01PercentShare: Math.max(0, Math.min(1, 1 - shareAt999)),
      top001PercentShare: Math.max(0, Math.min(1, 1 - shareAt9999)),
      bottom40PercentShare: Math.max(0, Math.min(1, shareAt40)),
      bottom50PercentShare: Math.max(0, Math.min(1, shareAt50)),
      middle40PercentShare: Math.max(0, Math.min(1, shareAt90 - shareAt50))
    };
  }

  // Compute Kakwani poverty headcount elasticities with respect to poverty line z and mean income mu
  public computePovertyElasticities(povertyLine: number, meanIncome?: number): PovertyElasticities {
    const effectiveMean = meanIncome ?? this.model.getDataset().meanIncome;
    if (effectiveMean <= 0) {
      throw new Error(`Mean income must be positive, received ${effectiveMean}.`);
    }

    if (povertyLine <= 0) {
      return {
        povertyHeadcount: 0,
        povertyLine,
        meanIncome: effectiveMean,
        marginalIncome: 0,
        incomeDensity: 0,
        dH_dz: 0,
        dH_dmu: 0,
        elasticityZ: 0,
        elasticityMu: 0
      };
    }

    const headcount = this.getPovertyHeadcount(povertyLine, effectiveMean);
    const firstDerivative = this.model.derivative(headcount);
    const secondDerivative = this.model.secondDerivative(headcount);
    const marginalIncome = effectiveMean * firstDerivative;
    const incomeDensity = effectiveMean * secondDerivative;

    let dH_dz = 0;
    let dH_dmu = 0;
    let elasticityZ = 0;
    let elasticityMu = 0;

    if (headcount > 1e-6 && headcount < 1 - 1e-6 && incomeDensity > 1e-12) {
      dH_dz = 1 / incomeDensity;
      dH_dmu = -povertyLine / (effectiveMean * incomeDensity);
      elasticityZ = (povertyLine / headcount) * dH_dz;
      elasticityMu = (effectiveMean / headcount) * dH_dmu;
    }

    return {
      povertyHeadcount: headcount,
      povertyLine,
      meanIncome: effectiveMean,
      marginalIncome,
      incomeDensity,
      dH_dz,
      dH_dmu,
      elasticityZ,
      elasticityMu
    };
  }

  // Evaluate complete inequality metrics including Gini, Sen index, Palma ratio, and bounds
  public computeComprehensiveMetrics(
    stepCount: number = 200,
    povertyLine?: number
  ): InequalityMetrics {
    const giniResult = this.computeGini(stepCount);
    const senWelfare = this.computeSenWelfare(stepCount);
    const palmaRatio = this.computePalmaRatio();
    const gastwirthCertificate = this.certifyGastwirthBounds(giniResult.giniIndex);
    const topIncomeShares = this.computeTopIncomeShares();

    let povertyHeadcount: number | undefined = undefined;
    let povertyElasticities: PovertyElasticities | undefined = undefined;

    if (povertyLine !== undefined) {
      povertyHeadcount = this.getPovertyHeadcount(povertyLine);
      povertyElasticities = this.computePovertyElasticities(povertyLine);
    }

    return {
      giniIndex: giniResult.giniIndex,
      senWelfareIndex: senWelfare.senWelfareIndex,
      palmaRatio,
      areaUnderCurve: giniResult.areaUnderCurve,
      meanIncome: this.model.getDataset().meanIncome,
      povertyHeadcount,
      povertyLine,
      gastwirthCertificate,
      topIncomeShares,
      povertyElasticities
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
