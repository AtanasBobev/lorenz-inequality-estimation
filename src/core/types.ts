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

export interface GastwirthCertificate {
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly intervalWidth: number;
  readonly estimatedGini: number;
  readonly isCertified: boolean;
  readonly maxError: number;
}

export interface PovertyElasticities {
  readonly povertyHeadcount: number;
  readonly povertyLine: number;
  readonly meanIncome: number;
  readonly marginalIncome: number; // mu * L'(H)
  readonly incomeDensity: number; // mu * L''(H)
  readonly dH_dz: number; // 1 / (mu * L''(H))
  readonly dH_dmu: number; // -z / (mu^2 * L''(H))
  readonly elasticityZ: number; // (z / H) * (dH/dz)
  readonly elasticityMu: number; // (mu / H) * (dH/dmu)
}

export interface TopIncomeShares {
  readonly top10PercentShare: number; // 1 - L(0.90)
  readonly top5PercentShare: number; // 1 - L(0.95)
  readonly top1PercentShare: number; // 1 - L(0.99)
  readonly top01PercentShare: number; // 1 - L(0.999)
  readonly top001PercentShare: number; // 1 - L(0.9999)
  readonly bottom40PercentShare: number; // L(0.40)
  readonly bottom50PercentShare: number; // L(0.50)
  readonly middle40PercentShare: number; // L(0.90) - L(0.50)
}

export interface ParetoSensitivityRecord {
  readonly pStar: number;
  readonly giniIndex: number;
  readonly tailAlpha: number;
  readonly top1PercentShare: number;
  readonly top01PercentShare: number;
  readonly secondDerivativeJump: number;
  readonly isCertified: boolean;
}

export interface WIDBenchmarkData {
  readonly datasetName: string;
  readonly officialGini: number;
  readonly widTop10: number;
  readonly widTop1: number;
  readonly widTop01?: number;
}

export interface WIDComparisonRecord {
  readonly datasetName: string;
  readonly splineTop10: number;
  readonly splineTop1: number;
  readonly hybridTop10: number;
  readonly hybridTop1: number;
  readonly widTop10: number;
  readonly widTop1: number;
  readonly top1ErrorSpline: number;
  readonly top1ErrorHybrid: number;
}

export interface InequalityMetrics {
  readonly giniIndex: number;
  readonly senWelfareIndex: number;
  readonly palmaRatio: number;
  readonly areaUnderCurve: number;
  readonly meanIncome: number;
  readonly povertyHeadcount?: number;
  readonly povertyLine?: number;
  readonly gastwirthCertificate: GastwirthCertificate;
  readonly topIncomeShares?: TopIncomeShares;
  readonly povertyElasticities?: PovertyElasticities;
}
