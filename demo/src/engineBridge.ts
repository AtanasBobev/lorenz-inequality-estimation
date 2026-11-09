import {
  LorenzModel,
  CubicSplineLorenzCurve,
  PchipLorenzCurve,
  HybridLorenzCurve,
  SimpsonsIntegrator,
  NewtonRaphsonSolver,
  InequalityEngine,
  InequalityMetrics,
  ModelSelectionEvaluator,
  ModelEvaluationRecord,
  KnotOptimizationResult
} from "../../src/index.js";
import { AppState } from "./types.js";

export interface EvaluationResult {
  metrics: InequalityMetrics;
  model: LorenzModel;
}

export interface ModelSelectionResult {
  comparison: ModelEvaluationRecord[];
  knotOptimization: KnotOptimizationResult;
}

export function evaluateInequality(state: AppState): EvaluationResult {
  let baseSpline: LorenzModel;
  let model: LorenzModel;

  if (state.modelType === "cubicspline") {
    baseSpline = new CubicSplineLorenzCurve(state.dataset);
    model = baseSpline;
  } else {
    baseSpline = new PchipLorenzCurve(state.dataset);
    if (state.modelType === "hybrid") {
      model = new HybridLorenzCurve(state.dataset, {
        bodyModel: baseSpline,
        splicePoint: state.splicingThreshold
      });
    } else {
      model = baseSpline;
    }
  }

  const integrator = new SimpsonsIntegrator();
  const solver = new NewtonRaphsonSolver();
  const engine = new InequalityEngine(model, integrator, solver);

  const metrics = engine.computeComprehensiveMetrics(200, state.povertyLine);

  return { metrics, model };
}

export function evaluateModelSelection(state: AppState): ModelSelectionResult {
  const pchip = new PchipLorenzCurve(state.dataset);
  const cubic = new CubicSplineLorenzCurve(state.dataset);
  const hybrid = new HybridLorenzCurve(state.dataset, {
    bodyModel: pchip,
    splicePoint: state.splicingThreshold
  });

  const candidates = [
    {
      name: `Proposed Hybrid (p* = ${state.splicingThreshold.toFixed(2)})`,
      model: hybrid,
      parameterCount: 3
    },
    {
      name: "Monotone PCHIP Spline",
      model: pchip,
      parameterCount: 2
    },
    {
      name: "Natural Cubic Spline",
      model: cubic,
      parameterCount: 2
    }
  ];

  const comparison = ModelSelectionEvaluator.compareModels(state.dataset, candidates);
  const knotOptimization = ModelSelectionEvaluator.findOptimalKnot(state.dataset, {
    candidateKnots: [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
    curvatureWeight: 2.0,
    bodyModelType: "pchip"
  });

  return { comparison, knotOptimization };
}
