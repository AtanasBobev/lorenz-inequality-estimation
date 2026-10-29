import { QuantileDataset } from "../core/types.js";
import { LorenzModel } from "../core/LorenzModel.js";
import { InequalityEngine } from "../core/InequalityEngine.js";
import { SimpsonsIntegrator } from "../integration/SimpsonsIntegrator.js";
import { BisectionSolver } from "../solvers/BisectionSolver.js";
import { PchipLorenzCurve } from "../interpolation/PchipLorenzCurve.js";
import { CubicSplineLorenzCurve } from "../interpolation/CubicSplineLorenzCurve.js";
import { HybridLorenzCurve } from "../tail/HybridLorenzCurve.js";
import {
  ParetoSensitivityRecord,
  PovertyElasticities,
  TopIncomeShares,
  WIDBenchmarkData,
  WIDComparisonRecord
} from "../core/types.js";

export const WID_BENCHMARKS: Record<string, WIDBenchmarkData> = {
  bulgaria: {
    datasetName: "Bulgarian NSI (2022 HBS Deciles)",
    officialGini: 0.384,
    widTop10: 0.342,
    widTop1: 0.128,
    widTop01: 0.042
  },
  eurostat: {
    datasetName: "Eurostat EU-27 (2022 SILC)",
    officialGini: 0.296,
    widTop10: 0.354,
    widTop1: 0.114,
    widTop01: 0.035
  },
  us_census: {
    datasetName: "US Census Bureau CPS (2022 ASEC)",
    officialGini: 0.488,
    widTop10: 0.458,
    widTop1: 0.191,
    widTop01: 0.075
  }
};

export class SensitivityAnalyzer {
  private static readonly integrator = new SimpsonsIntegrator();
  private static readonly rootFinder = new BisectionSolver();

  // Performs systematic parametric scan across Pareto splicing knot p* in [startP, endP].
  public static sweepParetoSplice(
    dataset: QuantileDataset,
    startP: number = 0.6,
    endP: number = 0.95,
    step: number = 0.05,
    bodyModelType: "pchip" | "cubicspline" = "pchip"
  ): ParetoSensitivityRecord[] {
    const records: ParetoSensitivityRecord[] = [];
    const baseSpline: LorenzModel =
      bodyModelType === "cubicspline"
        ? new CubicSplineLorenzCurve(dataset)
        : new PchipLorenzCurve(dataset);

    const stepsCount = Math.max(1, Math.round((endP - startP) / step));

    for (let i = 0; i <= stepsCount; i++) {
      const pStar = Math.min(endP, Number((startP + i * step).toFixed(4)));
      if (pStar <= 0 || pStar >= 1) continue;

      try {
        const hybrid = new HybridLorenzCurve(dataset, {
          bodyModel: baseSpline,
          splicePoint: pStar
        });
        const engine = new InequalityEngine(hybrid, this.integrator, this.rootFinder);
        const giniResult = engine.computeGini(200);
        const cert = engine.certifyGastwirthBounds(giniResult.giniIndex);
        const alpha = hybrid.getTailAlpha();

        const top1PercentShare = Math.max(0, Math.min(1, 1 - hybrid.evaluate(0.99)));
        const top01PercentShare = Math.max(0, Math.min(1, 1 - hybrid.evaluate(0.999)));

        // Curvature jump: |L''_pareto(p*) - L''_spline(p*)|
        const splineCurvature = baseSpline.secondDerivative(pStar);
        const hybridCurvature = hybrid.secondDerivative(Math.min(0.9999, pStar + 1e-5));
        const secondDerivativeJump = Math.abs(hybridCurvature - splineCurvature);

        records.push({
          pStar,
          giniIndex: giniResult.giniIndex,
          tailAlpha: alpha,
          top1PercentShare,
          top01PercentShare,
          secondDerivativeJump,
          isCertified: cert.isCertified
        });
      } catch {
        // Skip points where calibration does not yield valid tail alpha > 1
        continue;
      }
    }

    return records;
  }

  // Analyzes poverty headcount sensitivity across varying thresholds.
  public static computePovertySensitivityTable(
    model: LorenzModel,
    povertyLines: number[],
    meanIncome?: number
  ): PovertyElasticities[] {
    const engine = new InequalityEngine(model, this.integrator, this.rootFinder);
    return povertyLines.map((line) => engine.computePovertyElasticities(line, meanIncome));
  }

  // Decomposes high-net-worth upper-tail wealth shares.
  public static decomposeTopWealth(model: LorenzModel): TopIncomeShares {
    const engine = new InequalityEngine(model, this.integrator, this.rootFinder);
    return engine.computeTopIncomeShares();
  }

  // Compares model reconstructed top-income shares against official World Inequality Database (WID) benchmarks.
  public static compareWithWID(
    datasetKey: "bulgaria" | "eurostat" | "us_census",
    splineModel: LorenzModel,
    hybridModel: LorenzModel
  ): WIDComparisonRecord {
    const wid = WID_BENCHMARKS[datasetKey];
    if (!wid) {
      throw new Error(`Unknown benchmark dataset key '${datasetKey}'.`);
    }

    const splineShares = this.decomposeTopWealth(splineModel);
    const hybridShares = this.decomposeTopWealth(hybridModel);

    const splineTop10 = splineShares.top10PercentShare;
    const splineTop1 = splineShares.top1PercentShare;
    const hybridTop10 = hybridShares.top10PercentShare;
    const hybridTop1 = hybridShares.top1PercentShare;

    const top1ErrorSpline = Math.abs(splineTop1 - wid.widTop1) / wid.widTop1;
    const top1ErrorHybrid = Math.abs(hybridTop1 - wid.widTop1) / wid.widTop1;

    return {
      datasetName: wid.datasetName,
      splineTop10,
      splineTop1,
      hybridTop10,
      hybridTop1,
      widTop10: wid.widTop10,
      widTop1: wid.widTop1,
      top1ErrorSpline,
      top1ErrorHybrid
    };
  }
}
