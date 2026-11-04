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

// Executes systematic downsampling breakdown stress testing on high-resolution
// quantile datasets (e.g. deciles or percentiles down to quintiles, quartiles, tertiles)
// to analyze information loss, chordal underestimation, and Gastwirth envelope widening.
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
    referenceGini: number
  ): DownsamplingStressReport {
    const fullPoints = dataset.points;
    const n = fullPoints.length - 1; // number of brackets

    // Target downsampling knot resolutions: [10, 5, 4, 3] if original has >= 10
    const targetKnotCounts = [10, 5, 4, 3].filter((k) => k <= n);
    const records: DownsamplingRecord[] = [];
    let criticalKnotThreshold = 3;

    for (const k of targetKnotCounts) {
      const sampledDataset = this.downsampleDataset(dataset, k);
      const pchip = new PchipLorenzCurve(sampledDataset);
      const hybrid = new HybridLorenzCurve(sampledDataset, {
        bodyModel: pchip,
        splicePoint: 0.8
      });

      const engineHybrid = new InequalityEngine(hybrid, this.integrator, this.rootFinder);
      const enginePchip = new InequalityEngine(pchip, this.integrator, this.rootFinder);

      const metricsHybrid = engineHybrid.computeComprehensiveMetrics(1000, 500);
      const metricsPchip = enginePchip.computeComprehensiveMetrics(1000, 500);

      const gl = metricsHybrid.gastwirthCertificate.lowerBound;
      const gu = metricsHybrid.gastwirthCertificate.upperBound;
      const w = metricsHybrid.gastwirthCertificate.intervalWidth;
      const gh = metricsHybrid.giniIndex;
      const gp = metricsPchip.giniIndex;

      const linearUnderestimationPct = ((referenceGini - gl) / referenceGini) * 100;
      const hybridAbsoluteError = Math.abs(gh - referenceGini);
      const pchipAbsoluteError = Math.abs(gp - referenceGini);
      const isCertified = metricsHybrid.gastwirthCertificate.isCertified;
      const isBreakdown = w > 0.095 || hybridAbsoluteError > 0.02;

      if (isBreakdown && k > criticalKnotThreshold) {
        criticalKnotThreshold = k;
      }

      records.push({
        knotCount: k,
        knotResolutionName: this.getResolutionName(k),
        linearChordGini: gl,
        linearUnderestimationPct,
        pchipGini: gp,
        pchipAbsoluteError,
        hybridGini: gh,
        hybridAbsoluteError,
        gastwirthLowerBound: gl,
        gastwirthUpperBound: gu,
        envelopeWidth: w,
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

    // Interpolate linearly from full points to find income share at each p = i / targetBrackets
    for (let i = 1; i < targetBrackets; i++) {
      const targetP = i / targetBrackets;
      const income = this.interpolateLinear(fullPoints, targetP);
      sampledPoints.push({ populationShare: targetP, incomeShare: income });
    }
    sampledPoints.push({ populationShare: 1, incomeShare: 1 });

    return {
      meanIncome: dataset.meanIncome,
      points: sampledPoints
    };
  }

  private interpolateLinear(points: readonly QuantilePoint[], p: number): number {
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i].populationShare;
      const p1 = points[i + 1].populationShare;
      if (p >= p0 && p <= p1) {
        const t = (p - p0) / (p1 - p0);
        return points[i].incomeShare + t * (points[i + 1].incomeShare - points[i].incomeShare);
      }
    }
    return p;
  }

  private getResolutionName(k: number): string {
    switch (k) {
      case 10:
        return "Deciles (k=10)";
      case 5:
        return "Quintiles (k=5)";
      case 4:
        return "Quartiles (k=4)";
      case 3:
        return "Tertiles (k=3)";
      default:
        return `k=${k}`;
    }
  }
}
