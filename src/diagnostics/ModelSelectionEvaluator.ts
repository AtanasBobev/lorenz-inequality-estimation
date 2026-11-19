import {
  QuantileDataset,
  ModelEvaluationRecord,
  KnotSelectionRecord,
  KnotOptimizationResult
} from "../core/types.js";
import { LorenzModel } from "../core/LorenzModel.js";
import { PchipLorenzCurve } from "../interpolation/PchipLorenzCurve.js";
import { CubicSplineLorenzCurve } from "../interpolation/CubicSplineLorenzCurve.js";
import { HybridLorenzCurve } from "../tail/HybridLorenzCurve.js";

export interface CandidateModelSpec {
  readonly name: string;
  readonly model: LorenzModel;
  readonly parameterCount: number;
}

export interface KnotOptimizationOptions {
  readonly candidateKnots?: readonly number[];
  readonly curvatureWeight?: number;
  readonly bodyModelType?: "pchip" | "cubicspline";
}

// Information-theoretic model selection (AIC, AICc, BIC, Akaike weights) and
// penalized knot selection for splicing a Pareto tail onto an empirical spline
// TODO: Implement leave-one-knot-out cross-validation as an out-of-sample check alongside AICc
export class ModelSelectionEvaluator {
  private static readonly EPSILON_RSS = 1e-14;

  // Gaussian log-likelihood: ln(L) = -0.5*n*ln(2*pi) - 0.5*n*ln(RSS/n) - 0.5*n
  public static computeLogLikelihood(sampleSize: number, rss: number): number {
    if (sampleSize <= 0) {
      throw new Error("Sample size must be strictly positive.");
    }
    const clampedRss = Math.max(rss, this.EPSILON_RSS);
    return (
      -0.5 * sampleSize * Math.log(2 * Math.PI) -
      0.5 * sampleSize * Math.log(clampedRss / sampleSize) -
      0.5 * sampleSize
    );
  }

  // Standard Akaike Information Criterion: AIC = 2*k - 2*ln(L)
  public static computeAIC(sampleSize: number, rss: number, paramCount: number): number {
    const logLikelihood = this.computeLogLikelihood(sampleSize, rss);
    return 2 * paramCount - 2 * logLikelihood;
  }

  // Hurvich-Tsai small-sample correction: AICc = AIC + 2*k*(k+1) / (n - k - 1)
  public static computeAICc(sampleSize: number, rss: number, paramCount: number): number {
    const aic = this.computeAIC(sampleSize, rss, paramCount);
    const degreesOfFreedom = sampleSize - paramCount - 1;
    if (degreesOfFreedom <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return aic + (2 * paramCount * (paramCount + 1)) / degreesOfFreedom;
  }

  // Schwarz Bayesian Information Criterion: BIC = k*ln(n) - 2*ln(L)
  public static computeBIC(sampleSize: number, rss: number, paramCount: number): number {
    const logLikelihood = this.computeLogLikelihood(sampleSize, rss);
    return paramCount * Math.log(sampleSize) - 2 * logLikelihood;
  }

  // Compute residual fit metrics and information criteria for one fitted Lorenz model
  public static evaluateModel(
    dataset: QuantileDataset,
    model: LorenzModel,
    parameterCount: number,
    modelName: string = "LorenzModel"
  ): ModelEvaluationRecord {
    const points = dataset.points;
    const sampleSize = points.length;
    if (sampleSize === 0) {
      throw new Error("Dataset contains no quantile points.");
    }

    let rss = 0;
    let absoluteErrorSum = 0;
    let meanObserved = 0;

    for (const knot of points) {
      meanObserved += knot.incomeShare;
    }
    meanObserved /= sampleSize;

    let totalSumSquares = 0;

    for (const knot of points) {
      const percentile = knot.populationShare;
      const actualShare = knot.incomeShare;
      const predictedShare = model.evaluate(percentile);
      const residual = actualShare - predictedShare;

      rss += residual * residual;
      absoluteErrorSum += Math.abs(residual);
      totalSumSquares += (actualShare - meanObserved) * (actualShare - meanObserved);
    }

    const mse = rss / sampleSize;
    const rmse = Math.sqrt(mse);
    const mae = absoluteErrorSum / sampleSize;
    const rSquared = totalSumSquares > 0 ? Math.max(0, 1 - rss / totalSumSquares) : 1.0;

    const logLikelihood = this.computeLogLikelihood(sampleSize, rss);
    const aic = this.computeAIC(sampleSize, rss, parameterCount);
    const aicc = this.computeAICc(sampleSize, rss, parameterCount);
    const bic = this.computeBIC(sampleSize, rss, parameterCount);

    return {
      modelName,
      parameterCount,
      sampleSize,
      rss,
      mse,
      rmse,
      mae,
      rSquared,
      logLikelihood,
      aic,
      aicc,
      bic,
      deltaAic: 0,
      akaikeWeight: 1.0,
      evidenceRatio: 1.0
    };
  }

  // Ranks candidate models by AICc and computes Akaike weights and evidence ratios
  public static compareModels(
    dataset: QuantileDataset,
    candidates: readonly CandidateModelSpec[]
  ): ModelEvaluationRecord[] {
    if (candidates.length === 0) {
      return [];
    }

    const evaluatedRecords = candidates.map((spec) =>
      this.evaluateModel(dataset, spec.model, spec.parameterCount, spec.name)
    );

    let minAicc = Number.POSITIVE_INFINITY;
    for (const record of evaluatedRecords) {
      if (record.aicc < minAicc) {
        minAicc = record.aicc;
      }
    }

    const relativeLikelihoods: number[] = [];
    let sumLikelihoods = 0;

    for (const record of evaluatedRecords) {
      const deltaAicc = record.aicc - minAicc;
      const relLikelihood = Math.exp(-0.5 * deltaAicc);
      relativeLikelihoods.push(relLikelihood);
      sumLikelihoods += relLikelihood;
    }

    const rankedResults: ModelEvaluationRecord[] = evaluatedRecords.map((record, idx) => {
      const deltaAic = record.aicc - minAicc;
      const akaikeWeight = relativeLikelihoods[idx] / sumLikelihoods;
      const evidenceRatio = akaikeWeight > 0 ? 1.0 / akaikeWeight : Number.POSITIVE_INFINITY;

      return {
        ...record,
        deltaAic,
        akaikeWeight,
        evidenceRatio
      };
    });

    return rankedResults.sort((a, b) => a.deltaAic - b.deltaAic);
  }

  // Searches candidate splicing knots p* for the best trade-off between AICc fit and curvature jump
  public static findOptimalKnot(
    dataset: QuantileDataset,
    options: KnotOptimizationOptions = {}
  ): KnotOptimizationResult {
    const candidateKnots = options.candidateKnots ?? [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
    const curvatureWeight = options.curvatureWeight ?? 2.0;
    const bodyModelType = options.bodyModelType ?? "pchip";

    const baseSpline: LorenzModel =
      bodyModelType === "cubicspline"
        ? new CubicSplineLorenzCurve(dataset)
        : new PchipLorenzCurve(dataset);

    const records: KnotSelectionRecord[] = [];
    let bestKnot = candidateKnots[0];
    let bestAlpha = 2.0;
    let minScore = Number.POSITIVE_INFINITY;

    const sampleSize = dataset.points.length;
    const hybridParamCount = 2;

    for (const pStar of candidateKnots) {
      try {
        const hybrid = new HybridLorenzCurve(dataset, {
          bodyModel: baseSpline,
          splicePoint: pStar
        });

        const alpha = hybrid.getTailAlpha();
        const isAdmissible = alpha > 1.0 && alpha < 12.0;

        let rss = 0;
        for (const knot of dataset.points) {
          const residual = knot.incomeShare - hybrid.evaluate(knot.populationShare);
          rss += residual * residual;
        }

        const aic = this.computeAIC(sampleSize, rss, hybridParamCount);
        const aicc = this.computeAICc(sampleSize, rss, hybridParamCount);
        const bic = this.computeBIC(sampleSize, rss, hybridParamCount);

        const splineCurvature = baseSpline.secondDerivative(pStar);
        const hybridCurvature = hybrid.secondDerivative(Math.min(0.9999, pStar + 1e-5));
        const curvatureJump = Math.abs(hybridCurvature - splineCurvature);

        // Penalize extreme tail exponents (alpha > 5 or alpha < 1.1) so we don't pick degenerate knots
        let alphaPenalty = 0;
        if (alpha > 5.0) {
          alphaPenalty = 5.0 * (alpha - 5.0);
        } else if (alpha < 1.1) {
          alphaPenalty = 20.0 * (1.1 - alpha);
        }

        const penalizedScore =
          aicc + curvatureWeight * Math.log(1.0 + curvatureJump) + alphaPenalty;

        const record: KnotSelectionRecord = {
          pStar,
          tailAlpha: alpha,
          curvatureJump,
          rss,
          aic,
          aicc,
          bic,
          penalizedScore,
          isAdmissible
        };
        records.push(record);

        if (isAdmissible && penalizedScore < minScore) {
          minScore = penalizedScore;
          bestKnot = pStar;
          bestAlpha = alpha;
        }
      } catch {
        continue;
      }
    }

    if (records.length === 0) {
      throw new Error("No admissible splicing knot found across candidate set.");
    }

    return {
      optimalKnot: bestKnot,
      minScore,
      optimalAlpha: bestAlpha,
      records
    };
  }
}
