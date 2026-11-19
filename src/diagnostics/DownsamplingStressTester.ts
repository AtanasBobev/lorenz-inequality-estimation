import { QuantileDataset, QuantilePoint } from "../core/types.js";
import { PchipLorenzCurve } from "../interpolation/PchipLorenzCurve.js";
import { HybridLorenzCurve } from "../tail/HybridLorenzCurve.js";
import { SimpsonsIntegrator } from "../integration/SimpsonsIntegrator.js";
import { NewtonRaphsonSolver } from "../solvers/NewtonRaphsonSolver.js";
import { InequalityEngine } from "../core/InequalityEngine.js";

export interface DownsamplingRecord {
  readonly knotCount: number;
  readonly knotResolutionName: string;
  readonly linearChordGini: number;
  readonly linearUnderestimationPct: number;
  readonly pchipGini: number;
  readonly pchipAbsoluteError: number;
  readonly hybridGini: number;
  readonly hybridAbsoluteError: number;
  readonly gastwirthLowerBound: number;
  readonly gastwirthUpperBound: number;
  readonly envelopeWidth: number;
  readonly isCertified: boolean;
  readonly isBreakdown: boolean;
}

export interface DownsamplingStressReport {
  readonly datasetName: string;
  readonly referenceGini: number;
  readonly originalKnotCount: number;
  readonly records: readonly DownsamplingRecord[];
  readonly criticalKnotThreshold: number;
}

// Coarsens a quantile table from deciles down to quintiles, quartiles, and tertiles
// to measure how chord underestimation and Gastwirth bounds widen as knots are dropped
// TODO: Extend stress testing to non-uniform bracket layouts (e.g; CPS tables with a separate top-5% row)
export class DownsamplingStressTester {
  private readonly integrator: SimpsonsIntegrator;
  private readonly rootFinder: NewtonRaphsonSolver;

  constructor() {
    this.integrator = new SimpsonsIntegrator();
    this.rootFinder = new NewtonRaphsonSolver();
  }

  public runStressTest(
    datasetName: string,
    dataset: QuantileDataset,
    referenceGini: number,
    resolutions: readonly number[] = [10, 5, 4, 3]
  ): DownsamplingStressReport {
    const fullPoints = dataset.points;
    const totalBrackets = fullPoints.length - 1;

    const targetKnotCounts = resolutions.filter((bracketCount) => bracketCount <= totalBrackets);
    const records: DownsamplingRecord[] = [];
    let criticalKnotThreshold = 3;

    for (const bracketCount of targetKnotCounts) {
      const sampledDataset = this.downsampleDataset(dataset, bracketCount);
      const pchipCurve = new PchipLorenzCurve(sampledDataset);
      const hybridCurve = new HybridLorenzCurve(sampledDataset, {
        bodyModel: pchipCurve,
        splicePoint: 0.8
      });

      const engineHybrid = new InequalityEngine(hybridCurve, this.integrator, this.rootFinder);
      const enginePchip = new InequalityEngine(pchipCurve, this.integrator, this.rootFinder);

      const metricsHybrid = engineHybrid.computeComprehensiveMetrics(1000, 500);
      const metricsPchip = enginePchip.computeComprehensiveMetrics(1000, 500);

      const lowerBound = metricsHybrid.gastwirthCertificate.lowerBound;
      const upperBound = metricsHybrid.gastwirthCertificate.upperBound;
      const envelopeWidth = metricsHybrid.gastwirthCertificate.intervalWidth;
      const hybridGini = metricsHybrid.giniIndex;
      const pchipGini = metricsPchip.giniIndex;

      const linearUnderestimationPct = ((referenceGini - lowerBound) / referenceGini) * 100;
      const hybridAbsoluteError = Math.abs(hybridGini - referenceGini);
      const pchipAbsoluteError = Math.abs(pchipGini - referenceGini);
      const isCertified = metricsHybrid.gastwirthCertificate.isCertified;
      const isBreakdown = envelopeWidth > 0.095 || hybridAbsoluteError > 0.02;

      if (isBreakdown && bracketCount > criticalKnotThreshold) {
        criticalKnotThreshold = bracketCount;
      }

      records.push({
        knotCount: bracketCount,
        knotResolutionName: this.getResolutionName(bracketCount),
        linearChordGini: lowerBound,
        linearUnderestimationPct,
        pchipGini,
        pchipAbsoluteError,
        hybridGini,
        hybridAbsoluteError,
        gastwirthLowerBound: lowerBound,
        gastwirthUpperBound: upperBound,
        envelopeWidth,
        isCertified,
        isBreakdown
      });
    }

    return {
      datasetName,
      referenceGini,
      originalKnotCount: fullPoints.length,
      records,
      criticalKnotThreshold
    };
  }

  private downsampleDataset(dataset: QuantileDataset, targetBrackets: number): QuantileDataset {
    const fullPoints = dataset.points;
    const sampledPoints: QuantilePoint[] = [{ populationShare: 0, incomeShare: 0 }];

    // Linearly interpolate cumulative income shares at each target grid point p = i / targetBrackets
    for (let i = 1; i < targetBrackets; i++) {
      const targetPercentile = i / targetBrackets;
      const interpolatedIncome = this.interpolateLinear(fullPoints, targetPercentile);
      sampledPoints.push({ populationShare: targetPercentile, incomeShare: interpolatedIncome });
    }
    sampledPoints.push({ populationShare: 1, incomeShare: 1 });

    return {
      meanIncome: dataset.meanIncome,
      points: sampledPoints
    };
  }

  private interpolateLinear(points: readonly QuantilePoint[], targetPercentile: number): number {
    let bracketIdx = 0;
    while (
      bracketIdx < points.length - 2 &&
      targetPercentile > points[bracketIdx + 1].populationShare
    ) {
      bracketIdx++;
    }
    const leftPop = points[bracketIdx].populationShare;
    const rightPop = points[bracketIdx + 1].populationShare;
    const weight = (targetPercentile - leftPop) / (rightPop - leftPop);
    return (
      points[bracketIdx].incomeShare +
      weight * (points[bracketIdx + 1].incomeShare - points[bracketIdx].incomeShare)
    );
  }

  private getResolutionName(bracketCount: number): string {
    switch (bracketCount) {
      case 10:
        return "Deciles (k=10)";
      case 5:
        return "Quintiles (k=5)";
      case 4:
        return "Quartiles (k=4)";
      case 3:
        return "Tertiles (k=3)";
      default:
        return `k=${bracketCount}`;
    }
  }
}
