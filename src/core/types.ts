// Domain data structures and result types

export interface QuantilePoint {
  readonly populationShare: number; // Cumulative share p, where 0 <= p <= 1
  readonly incomeShare: number;     // Cumulative income share L, where 0 <= L <= 1
}

export interface QuantileDataset {
  readonly points: readonly QuantilePoint[];
  readonly meanIncome: number;
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

export interface RootResult {
  readonly populationPercentile: number;
  readonly iterations: number;
  readonly converged: boolean;
  readonly finalError: number;
}

export interface ConsumptionResult {
  readonly autonomousConsumption: number; // C_0
  readonly marginalPropensityToConsume: number; // c = dC/dY
  readonly rSquared: number;
}
