import { QuantileDataset } from "../core/types.js";

export interface EmpiricalCensusMetadata {
  readonly country: string;
  readonly year: number;
  readonly agency: string;
  readonly officialGini: number;
  readonly povertyLine: number;
  readonly currency: string;
  readonly notes: string;
}

export interface CensusBenchmarkEntry {
  readonly metadata: EmpiricalCensusMetadata;
  readonly dataset: QuantileDataset;
}

// Bulgarian National Statistical Institute (NSI) 2022 disposable income deciles.
export const BULGARIAN_NSI_2022: CensusBenchmarkEntry = {
  metadata: {
    country: "Bulgaria",
    year: 2022,
    agency: "National Statistical Institute (NSI)",
    officialGini: 0.384,
    povertyLine: 6048,
    currency: "BGN",
    notes: "Official NSI Household Budget Survey 2022 decile dataset."
  },
  dataset: {
    meanIncome: 9842,
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.1, incomeShare: 0.021 },
      { populationShare: 0.2, incomeShare: 0.059 },
      { populationShare: 0.3, incomeShare: 0.11 },
      { populationShare: 0.4, incomeShare: 0.174 },
      { populationShare: 0.5, incomeShare: 0.251 },
      { populationShare: 0.6, incomeShare: 0.342 },
      { populationShare: 0.7, incomeShare: 0.45 },
      { populationShare: 0.8, incomeShare: 0.58 },
      { populationShare: 0.9, incomeShare: 0.744 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ]
  }
};

// Bulgarian National Statistical Institute (NSI) 2022 quintile aggregation.
export const BULGARIAN_NSI_QUINTILES_2022: CensusBenchmarkEntry = {
  metadata: {
    country: "Bulgaria",
    year: 2022,
    agency: "National Statistical Institute (NSI)",
    officialGini: 0.384,
    povertyLine: 6048,
    currency: "BGN",
    notes: "Aggregated 5-quintile format from summary statistical yearbooks."
  },
  dataset: {
    meanIncome: 9842,
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.2, incomeShare: 0.059 },
      { populationShare: 0.4, incomeShare: 0.174 },
      { populationShare: 0.6, incomeShare: 0.342 },
      { populationShare: 0.8, incomeShare: 0.58 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ]
  }
};

// Eurostat EU-27 2022 equivalised disposable income deciles.
export const EUROSTAT_EU27_2022: CensusBenchmarkEntry = {
  metadata: {
    country: "European Union (EU-27)",
    year: 2022,
    agency: "Eurostat",
    officialGini: 0.296,
    povertyLine: 12300,
    currency: "EUR (PPS)",
    notes: "Pan-European living conditions survey (EU-SILC)."
  },
  dataset: {
    meanIncome: 20500,
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.1, incomeShare: 0.03 },
      { populationShare: 0.2, incomeShare: 0.076 },
      { populationShare: 0.3, incomeShare: 0.134 },
      { populationShare: 0.4, incomeShare: 0.203 },
      { populationShare: 0.5, incomeShare: 0.282 },
      { populationShare: 0.6, incomeShare: 0.371 },
      { populationShare: 0.7, incomeShare: 0.472 },
      { populationShare: 0.8, incomeShare: 0.59 },
      { populationShare: 0.9, incomeShare: 0.735 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ]
  }
};

// United States Census Bureau CPS 2022 household income deciles.
export const US_CENSUS_CPS_2022: CensusBenchmarkEntry = {
  metadata: {
    country: "United States",
    year: 2022,
    agency: "US Census Bureau",
    officialGini: 0.488,
    povertyLine: 29678,
    currency: "USD",
    notes: "Current Population Survey Annual Social and Economic Supplement 2022."
  },
  dataset: {
    meanIncome: 106400,
    points: [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.1, incomeShare: 0.012 },
      { populationShare: 0.2, incomeShare: 0.03 },
      { populationShare: 0.3, incomeShare: 0.063 },
      { populationShare: 0.4, incomeShare: 0.113 },
      { populationShare: 0.5, incomeShare: 0.177 },
      { populationShare: 0.6, incomeShare: 0.256 },
      { populationShare: 0.7, incomeShare: 0.355 },
      { populationShare: 0.8, incomeShare: 0.486 },
      { populationShare: 0.9, incomeShare: 0.672 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ]
  }
};

// Catalog of empirical census benchmark datasets.
export const CENSUS_BENCHMARK_CATALOG: readonly CensusBenchmarkEntry[] = [
  BULGARIAN_NSI_2022,
  BULGARIAN_NSI_QUINTILES_2022,
  EUROSTAT_EU27_2022,
  US_CENSUS_CPS_2022
];
