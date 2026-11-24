import {
  CubicSplineLorenzCurve,
  PchipLorenzCurve,
  HybridLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  NewtonRaphsonSolver,
  InequalityEngine,
  SensitivityAnalyzer,
  ModelSelectionEvaluator,
  KakwaniPodderCurve,
  LogNormalDistribution,
  SinghMaddalaDistribution,
  DagumDistribution,
  BULGARIAN_NSI_2022,
  BULGARIAN_NSI_QUINTILES_2022,
  EUROSTAT_EU27_2022,
  US_CENSUS_CPS_2022,
  QuantileDataset
} from "../src/index.js";

interface BenchmarkDatasetEntry {
  readonly name: string;
  readonly ds: QuantileDataset;
  readonly pov: number;
  readonly currency: string;
  readonly targetGini: number;
}

function buildCrossDatasets(): BenchmarkDatasetEntry[] {
  return [
    {
      name: "Bulgaria NSI 2022 Deciles",
      ds: BULGARIAN_NSI_2022.dataset,
      pov: BULGARIAN_NSI_2022.metadata.povertyLine,
      currency: BULGARIAN_NSI_2022.metadata.currency,
      targetGini: BULGARIAN_NSI_2022.metadata.officialGini
    },
    {
      name: "Bulgaria NSI Quintiles",
      ds: BULGARIAN_NSI_QUINTILES_2022.dataset,
      pov: BULGARIAN_NSI_QUINTILES_2022.metadata.povertyLine,
      currency: BULGARIAN_NSI_QUINTILES_2022.metadata.currency,
      targetGini: BULGARIAN_NSI_QUINTILES_2022.metadata.officialGini
    },
    {
      name: "Eurostat EU-27 2022",
      ds: EUROSTAT_EU27_2022.dataset,
      pov: EUROSTAT_EU27_2022.metadata.povertyLine,
      currency: "EUR",
      targetGini: EUROSTAT_EU27_2022.metadata.officialGini
    },
    {
      name: "US Census Bureau CPS 2022",
      ds: US_CENSUS_CPS_2022.dataset,
      pov: US_CENSUS_CPS_2022.metadata.povertyLine,
      currency: US_CENSUS_CPS_2022.metadata.currency,
      targetGini: US_CENSUS_CPS_2022.metadata.officialGini
    },
    {
      name: "Synthetic Log-Normal (σ=0.7)",
      ds: new LogNormalDistribution(0.7).sampleQuantiles(10, 25000),
      pov: 12000,
      currency: "EUR",
      targetGini: new LogNormalDistribution(0.7).theoreticalGini
    },
    {
      name: "Synthetic Singh-Maddala",
      ds: new SinghMaddalaDistribution(2.8, 1.7).sampleQuantiles(10, 24000),
      pov: 11500,
      currency: "EUR",
      targetGini: new SinghMaddalaDistribution(2.8, 1.7).theoreticalGini
    },
    {
      name: "Synthetic Dagum (a=3.5)",
      ds: new DagumDistribution(3.5, 0.7).sampleQuantiles(10, 26000),
      pov: 12500,
      currency: "EUR",
      targetGini: new DagumDistribution(3.5, 0.7).theoreticalGini
    }
  ];
}

export function runCrossModelAndDiagnosticsBenchmarks(): void {
  const simpson = new SimpsonsIntegrator();
  const bisection = new BisectionSolver();
  const nrSolver = new NewtonRaphsonSolver();
  const crossDatasets = buildCrossDatasets();

  console.log(
    "=================================================================================================================="
  );
  console.log(" SECTION 3: SYSTEMATIC CROSS-MODEL COMPARISON (CUBIC SPLINE vs PCHIP vs HYBRID)");
  console.log(
    "=================================================================================================================="
  );
  console.log(
    "| Dataset                      | Target G* | Natural Spline | PCHIP Model  | Hybrid (p*=0.8) | Bounds [G_L, Ĝ_U]     | Status     |"
  );
  console.log(
    "------------------------------------------------------------------------------------------------------------------"
  );

  for (const d of crossDatasets) {
    const cs = new CubicSplineLorenzCurve(d.ds);
    const pch = new PchipLorenzCurve(d.ds);
    const hyb = new HybridLorenzCurve(d.ds, { bodyModel: pch, splicePoint: 0.8 });

    const gCs = new InequalityEngine(cs, simpson, bisection).computeGini(200).giniIndex;
    const engPch = new InequalityEngine(pch, simpson, bisection);
    const gPch = engPch.computeGini(200).giniIndex;
    const gHyb = new InequalityEngine(hyb, simpson, bisection).computeGini(200).giniIndex;
    const cert = engPch.certifyGastwirthBounds(gPch);

    const bounds = `[${cert.lowerBound.toFixed(4)}, ${cert.upperBound.toFixed(4)}]`.padStart(21);
    const status = (cert.isCertified ? "Enclosed" : "Outside").padStart(10);
    console.log(
      `| ${d.name.padEnd(28)} | ${d.targetGini.toFixed(4).padStart(9)} | ${gCs.toFixed(4).padStart(14)} | ${gPch.toFixed(4).padStart(12)} | ${gHyb.toFixed(4).padStart(15)} | ${bounds} | ${status} |`
    );
  }
  console.log(
    "------------------------------------------------------------------------------------------------------------------\n"
  );

  console.log(
    "=================================================================================================================="
  );
  console.log(" SECTION 4: RECONSTRUCTED MACROECONOMIC INDICATORS & HEADCOUNT INVERSION (HYBRID)");
  console.log(
    "=================================================================================================================="
  );
  console.log(
    "| Dataset                      | Mean Income μ | Poverty Line z | Gini (G) | Palma Ratio | Sen Welfare W | Headcount H |"
  );
  console.log(
    "------------------------------------------------------------------------------------------------------------------"
  );

  for (const d of crossDatasets) {
    const pch = new PchipLorenzCurve(d.ds);
    const hyb = new HybridLorenzCurve(d.ds, { bodyModel: pch, splicePoint: 0.8 });
    const m = new InequalityEngine(hyb, simpson, nrSolver).computeComprehensiveMetrics(200, d.pov);

    const meanStr = `${Math.round(d.ds.meanIncome || 10000)} ${d.currency}`.padStart(13);
    const povStr = `${d.pov} ${d.currency}`.padStart(14);
    const palmaStr = isFinite(m.palmaRatio)
      ? m.palmaRatio.toFixed(2).padStart(11)
      : "N/A".padStart(11);
    const senStr = `${Math.round(m.senWelfareIndex).toLocaleString()} ${d.currency}`.padStart(13);
    const hcStr =
      m.povertyHeadcount !== undefined
        ? `${(m.povertyHeadcount * 100).toFixed(1)}%`.padStart(11)
        : "N/A".padStart(11);

    console.log(
      `| ${d.name.padEnd(28)} | ${meanStr} | ${povStr} | ${m.giniIndex.toFixed(4).padStart(8)} | ${palmaStr} | ${senStr} | ${hcStr} |`
    );
  }
  console.log(
    "------------------------------------------------------------------------------------------------------------------\n"
  );

  console.log(
    "=================================================================================================================="
  );
  console.log(" SECTION 5: POVERTY HEADCOUNT ELASTICITIES & SENSITIVITY DIAGNOSTICS");
  console.log(
    "=================================================================================================================="
  );
  console.log(
    "| Dataset                      | Unit | Headcount (H) | Slope 1/f(z) | dH / dz       | dH / dμ       | Elasticity ε_z | Elasticity ε_μ |"
  );
  console.log(
    "----------------------------------------------------------------------------------------------------------------------"
  );

  for (const d of crossDatasets) {
    const pch = new PchipLorenzCurve(d.ds);
    const hyb = new HybridLorenzCurve(d.ds, { bodyModel: pch, splicePoint: 0.8 });
    const el = new InequalityEngine(hyb, simpson, nrSolver).computePovertyElasticities(d.pov);

    const hcStr = `${(el.povertyHeadcount * 100).toFixed(1)}%`.padStart(13);
    const densStr =
      el.incomeDensity > 0 ? el.incomeDensity.toFixed(1).padStart(12) : "N/A".padStart(12);
    const dHdzStr = el.dH_dz > 0 ? el.dH_dz.toExponential(2).padStart(13) : "N/A".padStart(13);
    const dHdmuStr = el.dH_dmu < 0 ? el.dH_dmu.toExponential(2).padStart(13) : "N/A".padStart(13);
    const ezStr =
      el.elasticityZ !== 0 ? el.elasticityZ.toFixed(2).padStart(14) : "N/A".padStart(14);
    const emuStr =
      el.elasticityMu !== 0 ? el.elasticityMu.toFixed(2).padStart(14) : "N/A".padStart(14);

    console.log(
      `| ${d.name.padEnd(28)} | ${d.currency.padEnd(4)} | ${hcStr} | ${densStr} | ${dHdzStr} | ${dHdmuStr} | ${ezStr} | ${emuStr} |`
    );
  }
  console.log(
    "------------------------------------------------------------------------------------------------------------------\n"
  );

  console.log(
    "=================================================================================================================="
  );
  console.log(" SECTION 6: TOP-INCOME SHARE RECOVERY vs WID ADMINISTRATIVE BENCHMARKS");
  console.log(
    "=================================================================================================================="
  );
  console.log(
    "| Dataset Key  | Spline Top 10% | Spline Top 1% | Hybrid Top 10% | Hybrid Top 1% | WID Top 10% | WID Top 1% | Rel Err Reduc |"
  );
  console.log(
    "------------------------------------------------------------------------------------------------------------------"
  );

  const widDatasets = [
    { key: "bulgaria" as const, ds: BULGARIAN_NSI_2022.dataset },
    { key: "eurostat" as const, ds: EUROSTAT_EU27_2022.dataset },
    { key: "us_census" as const, ds: US_CENSUS_CPS_2022.dataset }
  ];

  for (const item of widDatasets) {
    const cs = new CubicSplineLorenzCurve(item.ds);
    const hyb = new HybridLorenzCurve(item.ds, { splicePoint: 0.8 });
    const comp = SensitivityAnalyzer.compareWithWID(item.key, cs, hyb);
    const redStr =
      `${(((comp.top1ErrorSpline - comp.top1ErrorHybrid) / comp.top1ErrorSpline) * 100).toFixed(1)}%`.padStart(
        13
      );

    console.log(
      `| ${item.key.toUpperCase().padEnd(12)} | ${`${(comp.splineTop10 * 100).toFixed(1)}%`.padStart(14)} | ${`${(comp.splineTop1 * 100).toFixed(2)}%`.padStart(13)} | ${`${(comp.hybridTop10 * 100).toFixed(1)}%`.padStart(14)} | ${`${(comp.hybridTop1 * 100).toFixed(2)}%`.padStart(13)} | ${`${(comp.widTop10 * 100).toFixed(1)}%`.padStart(11)} | ${`${(comp.widTop1 * 100).toFixed(2)}%`.padStart(10)} | ${redStr} |`
    );
  }
  console.log(
    "------------------------------------------------------------------------------------------------------------------\n"
  );

  console.log(
    "=================================================================================================================="
  );
  console.log(
    " SECTION 7: PARETO TAIL SPLICING KNOT (p*) SENSITIVITY SWEEP (BULGARIAN NSI DECILES)"
  );
  console.log(
    "=================================================================================================================="
  );
  console.log(
    "| Splice Knot (p*) | Gini Index (G) | Pareto Alpha (α) | Top 1% Share | Top 0.1% Share | Curvature Jump | Gastwirth Status |"
  );
  console.log(
    "------------------------------------------------------------------------------------------------------------------"
  );

  const bgSweep = SensitivityAnalyzer.sweepParetoSplice(
    BULGARIAN_NSI_2022.dataset,
    0.6,
    0.95,
    0.05
  );
  for (const pt of bgSweep) {
    console.log(
      `| ${pt.pStar.toFixed(2).padStart(16)} | ${pt.giniIndex.toFixed(4).padStart(14)} | ${pt.tailAlpha.toFixed(3).padStart(16)} | ${`${(pt.top1PercentShare * 100).toFixed(2)}%`.padStart(12)} | ${`${(pt.top01PercentShare * 100).toFixed(2)}%`.padStart(14)} | ${pt.secondDerivativeJump.toFixed(3).padStart(14)} | ${(pt.isCertified ? "Enclosed" : "Outside").padStart(16)} |`
    );
  }
  console.log(
    "------------------------------------------------------------------------------------------------------------------\n"
  );

  console.log(
    "=================================================================================================================="
  );
  console.log(" SECTION 8: MODEL SELECTION (AICc, BIC & PENALIZED OPTIMAL KNOT p*)");
  console.log(
    "=================================================================================================================="
  );
  console.log(
    "| Dataset                      | Hybrid80 AICc | Kakwani AICc | w_Hyb80 | p*_opt | alpha(p*_opt) |"
  );
  console.log(
    "------------------------------------------------------------------------------------------------------------------"
  );
  for (const d of crossDatasets.slice(0, 4).filter((_, idx) => idx !== 1)) {
    const pch = new PchipLorenzCurve(d.ds);
    const hyb80 = new HybridLorenzCurve(d.ds, { bodyModel: pch, splicePoint: 0.8 });
    const kak = new KakwaniPodderCurve(d.ds);
    const cmp = ModelSelectionEvaluator.compareModels(d.ds, [
      { name: "Hybrid80", model: hyb80, parameterCount: 2 },
      { name: "Kakwani", model: kak, parameterCount: 3 }
    ]);
    const hRec = cmp.find((r) => r.modelName === "Hybrid80")!;
    const kRec = cmp.find((r) => r.modelName === "Kakwani")!;
    const opt = ModelSelectionEvaluator.findOptimalKnot(d.ds);
    console.log(
      `| ${d.name.padEnd(28)} | ${hRec.aicc.toFixed(2).padStart(13)} | ${kRec.aicc.toFixed(2).padStart(12)} | ${hRec.akaikeWeight.toFixed(4).padStart(7)} | ${opt.optimalKnot.toFixed(2).padStart(6)} | ${opt.optimalAlpha.toFixed(3).padStart(13)} |`
    );
  }
  console.log(
    "------------------------------------------------------------------------------------------------------------------\n"
  );
}
