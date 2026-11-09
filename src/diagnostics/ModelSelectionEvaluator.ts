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

/**
 * ModelSelectionEvaluator
 *
 * Implements information-theoretic criteria for Lorenz curve evaluation:
 * - Residual Sum of Squares (RSS), RMSE, MAE, R^2
 * - Maximized Log-Likelihood ln(L) under Gaussian error distribution
 * - Akaike Information Criterion (AIC)
 * - Hurvich-Tsai small-sample corrected AIC (AICc)
 * - Bayesian Information Criterion (BIC / Schwarz)
 * - Multi-model ranking via delta AICc and Akaike weights (w_m)
 * - Adaptive Pareto tail splicing knot (p*) optimization balancing goodness-of-fit
 *   with C^2 curvature continuity.
 */
export class ModelSelectionEvaluator {
  private static readonly EPSILON_RSS = 1e-14;

  /**
   * Computes maximized log-likelihood under Gaussian error distribution:
   * ln(L) = -0.5 * n * ln(2*pi) - 0.5 * n * ln(RSS / n) - 0.5 * n
   */
  public static computeLogLikelihood(sampleSize: number, rss: number): number {
    if (sampleSize <= 0) {
      throw new Error("Sample size must be strictly positive.");
    }
    const safeRss = Math.max(rss, this.EPSILON_RSS);
    return (
      -0.5 * sampleSize * Math.log(2 * Math.PI) -
      0.5 * sampleSize * Math.log(safeRss / sampleSize) -
      0.5 * sampleSize
    );
  }

  /**
   * Standard Akaike Information Criterion:
   * AIC = 2*k - 2*ln(L)
   */
  public static computeAIC(sampleSize: number, rss: number, k: number): number {
    const ll = this.computeLogLikelihood(sampleSize, rss);
    return 2 * k - 2 * ll;
  }

  /**
   * Hurvich & Tsai (1989) small-sample corrected AIC:
   * AICc = AIC + (2*k*(k+1)) / (n - k - 1)
   */
  public static computeAICc(sampleSize: number, rss: number, k: number): number {
    const aic = this.computeAIC(sampleSize, rss, k);
    const denominator = sampleSize - k - 1;
    if (denominator <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return aic + (2 * k * (k + 1)) / denominator;
  }

  /**
   * Bayesian Information Criterion (Schwarz 1978):
   * BIC = k * ln(n) - 2 * ln(L)
   */
  public static computeBIC(sampleSize: number, rss: number, k: number): number {
    const ll = this.computeLogLikelihood(sampleSize, rss);
    return k * Math.log(sampleSize) - 2 * ll;
  }

  /**
   * Evaluates statistical metrics and information criteria for a single model on a dataset.
   */
  public static evaluateModel(
    dataset: QuantileDataset,
    model: LorenzModel,
    parameterCount: number,
    modelName: string = "LorenzModel"
  ): ModelEvaluationRecord {
    const points = dataset.points;
    const n = points.length;
    if (n === 0) {
      throw new Error("Dataset contains no quantile points.");
    }

    let rss = 0;
    let absoluteErrorSum = 0;
    let meanObserved = 0;

    for (const pt of points) {
      meanObserved += pt.incomeShare;
    }
    meanObserved /= n;

    let totalSumSquares = 0;

    for (const pt of points) {
      const p = pt.populationShare;
      const actualL = pt.incomeShare;
      const predictedL = model.evaluate(p);
      const residual = actualL - predictedL;

      rss += residual * residual;
      absoluteErrorSum += Math.abs(residual);
      totalSumSquares += (actualL - meanObserved) * (actualL - meanObserved);
    }

    const mse = rss / n;
    const rmse = Math.sqrt(mse);
    const mae = absoluteErrorSum / n;
    const rSquared = totalSumSquares > 0 ? Math.max(0, 1 - rss / totalSumSquares) : 1.0;

    const logLikelihood = this.computeLogLikelihood(n, rss);
    const aic = this.computeAIC(n, rss, parameterCount);
    const aicc = this.computeAICc(n, rss, parameterCount);
    const bic = this.computeBIC(n, rss, parameterCount);

    return {
      modelName,
      parameterCount,
      sampleSize: n,
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

  /**
   * Compares multiple candidate models on the same dataset,
   * computing relative delta AICc, Akaike weights, and evidence ratios.
   */
  public static compareModels(
    dataset: QuantileDataset,
    candidates: readonly CandidateModelSpec[]
  ): ModelEvaluationRecord[] {
    if (candidates.length === 0) {
      return [];
    }

    // 1. Evaluate individual models
    const evaluated = candidates.map((spec) =>
      this.evaluateModel(dataset, spec.model, spec.parameterCount, spec.name)
    );

    // 2. Find minimum AICc
    let minAicc = Number.POSITIVE_INFINITY;
    for (const record of evaluated) {
      if (record.aicc < minAicc) {
        minAicc = record.aicc;
      }
    }

    // 3. Compute delta AICc and unnormalized likelihoods
    const relativeLikelihoods: number[] = [];
    let sumLikelihoods = 0;

    for (const record of evaluated) {
      const deltaAicc = record.aicc - minAicc;
      const relLikelihood = Math.exp(-0.5 * deltaAicc);
      relativeLikelihoods.push(relLikelihood);
      sumLikelihoods += relLikelihood;
    }

    // 4. Compute normalized Akaike weights and evidence ratios
    const results: ModelEvaluationRecord[] = evaluated.map((record, idx) => {
      const deltaAic = record.aicc - minAicc;
      const akaikeWeight = sumLikelihoods > 0 ? relativeLikelihoods[idx] / sumLikelihoods : 0;
      const evidenceRatio = akaikeWeight > 0 ? 1.0 / akaikeWeight : Number.POSITIVE_INFINITY;

      return {
        ...record,
        deltaAic,
        akaikeWeight,
        evidenceRatio
      };
    });

    // 5. Sort ascending by deltaAic (best model first)
    return results.sort((a, b) => a.deltaAic - b.deltaAic);
  }

  /**
   * Performs adaptive Pareto tail splicing knot (p*) optimization.
   * Jointly minimizes AICc and curvature discontinuity |ΔL''(p*)| across candidate knots.
   */
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

    const n = dataset.points.length;
    // Parameter count in hybrid model: knot p* + tail alpha = 2 degrees of freedom
    const kHybrid = 2;

    for (const pStar of candidateKnots) {
      if (pStar <= 0 || pStar >= 1) continue;

      try {
        const hybrid = new HybridLorenzCurve(dataset, {
          bodyModel: baseSpline,
          splicePoint: pStar
        });

        const alpha = hybrid.getTailAlpha();
        const isAdmissible = alpha > 1.0 && alpha < 12.0;

        // Evaluate RSS across empirical reporting points
        let rss = 0;
        for (const pt of dataset.points) {
          const res = pt.incomeShare - hybrid.evaluate(pt.populationShare);
          rss += res * res;
        }

        const aic = this.computeAIC(n, rss, kHybrid);
        const aicc = this.computeAICc(n, rss, kHybrid);
        const bic = this.computeBIC(n, rss, kHybrid);

        // Curvature jump |L''_pareto(p*) - L''_spline(p*)|
        const splineCurvature = baseSpline.secondDerivative(pStar);
        const hybridCurvature = hybrid.secondDerivative(Math.min(0.9999, pStar + 1e-5));
        const curvatureJump = Math.abs(hybridCurvature - splineCurvature);

        // Penalized criterion: AICc + lambda * ln(1 + curvatureJump)
        // If tail alpha is unphysical (alpha > 5.0 or alpha <= 1.05), apply heavy regularization penalty
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
        // Skip knots where closed-form splicing fails admissibility
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
