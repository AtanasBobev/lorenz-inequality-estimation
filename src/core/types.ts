export interface QuantilePoint {
  readonly populationShare: number;
  readonly incomeShare: number;
}

export interface QuantileDataset {
  readonly points: readonly QuantilePoint[];
  readonly meanIncome: number;
}

export interface TridiagonalSystem {
  readonly lower: number[];
  readonly diag: number[];
  readonly upper: number[];
  readonly rhs: number[];
}

export interface RootResult {
  readonly root: number;
  readonly populationPercentile: number;
  readonly iterations: number;
  readonly converged: boolean;
  readonly finalError: number;
}

export interface GiniResult {
  readonly giniIndex: number;
  readonly areaUnderCurve: number;
  readonly methodUsed: string;
}

export interface WelfareResult {
  readonly senWelfareIndex: number;
  readonly meanIncome: number;
  readonly giniIndex: number;
}

export interface ConsumptionResult {
  readonly autonomousConsumption: number;
  readonly marginalPropensityToConsume: number;
  readonly rSquared: number;
}
