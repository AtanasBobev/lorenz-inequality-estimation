import { LorenzModel } from "./LorenzModel.js";
import { NumericalIntegrator } from "./NumericalIntegrator.js";
import { RootFinder } from "./RootFinder.js";
import { GiniResult, WelfareResult } from "./types.js";

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
