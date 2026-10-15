import {
  CubicSplineLorenzCurve,
  PchipLorenzCurve,
  HybridLorenzCurve,
  SimpsonsIntegrator,
  NewtonRaphsonSolver,
  InequalityEngine,
  InequalityMetrics
} from "../../src/index.js";
import { AppState } from "./types.js";

export interface EvaluationResult {
  metrics: InequalityMetrics;
  model: any;
}

export function evaluateInequality(state: AppState): EvaluationResult {
  let baseSpline: any;
  let model: any;

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
