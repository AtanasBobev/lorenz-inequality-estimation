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
}

export function loadPreset(key: string): PresetResult {
  switch (key) {
    case "bg_nsi_2022":
      return {
        dataset: {
          meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
          points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: 6048
      };
    case "bg_nsi_quintiles":
      return {
        dataset: {
          meanIncome: BULGARIAN_NSI_QUINTILES_2022.dataset.meanIncome,
          points: BULGARIAN_NSI_QUINTILES_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: 6048
      };
    case "eurostat_2022":
      return {
        dataset: {
          meanIncome: EUROSTAT_EU27_2022.dataset.meanIncome,
          points: EUROSTAT_EU27_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: 12300
      };
    case "us_census_2022":
      return {
        dataset: {
          meanIncome: US_CENSUS_CPS_2022.dataset.meanIncome,
          points: US_CENSUS_CPS_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: 29678
      };
    case "syn_lognormal": {
      const syn = new LogNormalDistribution(0.7);
      return {
        dataset: syn.sampleQuantiles(10, 50000),
        poverty: 30000
      };
    }
    case "syn_singh_maddala": {
      const syn = new SinghMaddalaDistribution(1.5, 2.8);
      return {
        dataset: syn.sampleQuantiles(10, 50000),
        poverty: 30000
      };
    }
    case "syn_dagum": {
      const syn = new DagumDistribution(3.5, 0.7);
      return {
        dataset: syn.sampleQuantiles(10, 50000),
        poverty: 30000
      };
    }
    default:
      return {
        dataset: {
          meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
          points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
        },
        poverty: 6048
      };
  }
}
