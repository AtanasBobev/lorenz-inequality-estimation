import {
  QuantileDataset,
  BULGARIAN_NSI_2022,
  BULGARIAN_NSI_QUINTILES_2022,
  EUROSTAT_EU27_2022,
  US_CENSUS_CPS_2022,
  LogNormalDistribution,
  SinghMaddalaDistribution,
  DagumDistribution
} from "../../src/index.js";

export interface PresetResult {
  dataset: QuantileDataset;
  poverty: number;
  currency: string;
  benchmarkGini: number | null;
  benchmarkLabel: string | null;
  benchmarkType: "synthetic" | "empirical" | null;
}

export function loadPreset(key: string): PresetResult {
  switch (key) {
    case "bg_nsi_2022":
      return {
        dataset: {
          meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
          points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: BULGARIAN_NSI_2022.metadata.povertyLine, // 3092 EUR
        currency: "EUR",
        benchmarkGini: BULGARIAN_NSI_2022.metadata.officialGini,
        benchmarkLabel: "NSI 2022 HBS Microdata",
        benchmarkType: "empirical"
      };
    case "bg_nsi_quintiles":
      return {
        dataset: {
          meanIncome: BULGARIAN_NSI_QUINTILES_2022.dataset.meanIncome,
          points: BULGARIAN_NSI_QUINTILES_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: BULGARIAN_NSI_QUINTILES_2022.metadata.povertyLine, // 3092 EUR
        currency: "EUR",
        benchmarkGini: BULGARIAN_NSI_QUINTILES_2022.metadata.officialGini,
        benchmarkLabel: "NSI 2022 Summary Deciles",
        benchmarkType: "empirical"
      };
    case "eurostat_2022":
      return {
        dataset: {
          meanIncome: EUROSTAT_EU27_2022.dataset.meanIncome,
          points: EUROSTAT_EU27_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: EUROSTAT_EU27_2022.metadata.povertyLine, // 12300 EUR
        currency: "EUR",
        benchmarkGini: EUROSTAT_EU27_2022.metadata.officialGini,
        benchmarkLabel: "Eurostat EU-SILC (EU-27)",
        benchmarkType: "empirical"
      };
    case "us_census_2022":
      return {
        dataset: {
          meanIncome: US_CENSUS_CPS_2022.dataset.meanIncome,
          points: US_CENSUS_CPS_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: US_CENSUS_CPS_2022.metadata.povertyLine, // 28180 EUR
        currency: "EUR",
        benchmarkGini: US_CENSUS_CPS_2022.metadata.officialGini,
        benchmarkLabel: "US Census Bureau CPS ASEC",
        benchmarkType: "empirical"
      };
    case "syn_lognormal": {
      const syn = new LogNormalDistribution(0.7);
      return {
        dataset: syn.sampleQuantiles(10, 25000),
        poverty: 12000,
        currency: "EUR",
        benchmarkGini: syn.theoreticalGini,
        benchmarkLabel: "Exact Closed-Form (erf(σ/2))",
        benchmarkType: "synthetic"
      };
    }
    case "syn_singh_maddala": {
      const syn = new SinghMaddalaDistribution(2.8, 1.7);
      return {
        dataset: syn.sampleQuantiles(10, 24000),
        poverty: 11500,
        currency: "EUR",
        benchmarkGini: syn.theoreticalGini,
        benchmarkLabel: "Exact Analytical (Beta/Gamma)",
        benchmarkType: "synthetic"
      };
    }
    case "syn_dagum": {
      const syn = new DagumDistribution(3.5, 0.7);
      return {
        dataset: syn.sampleQuantiles(10, 26000),
        poverty: 12500,
        currency: "EUR",
        benchmarkGini: syn.theoreticalGini,
        benchmarkLabel: "Exact Analytical (Beta/Gamma)",
        benchmarkType: "synthetic"
      };
    }
    default:
      return {
        dataset: {
          meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
          points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: BULGARIAN_NSI_2022.metadata.povertyLine,
        currency: "EUR",
        benchmarkGini: BULGARIAN_NSI_2022.metadata.officialGini,
        benchmarkLabel: "Bulgarian NSI 2022",
        benchmarkType: "empirical"
      };
  }
}
