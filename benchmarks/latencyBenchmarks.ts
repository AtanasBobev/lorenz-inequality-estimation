import {
  PchipLorenzCurve,
  HybridLorenzCurve,
  SimpsonsIntegrator,
  BisectionSolver,
  InequalityEngine,
  LogNormalDistribution,
  BULGARIAN_NSI_2022,
  US_CENSUS_CPS_2022
} from "../src/index.js";

export interface BenchmarkStats {
  readonly operation: string;
  readonly iterations: number;
  readonly totalTimeMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly stdDevMs: number;
  readonly throughputOpsSec: number;
}

export function computeStats(operation: string, timesMs: number[]): BenchmarkStats {
  const sampleCount = timesMs.length;
  timesMs.sort((a, b) => a - b);

  const totalTimeMs = timesMs.reduce((acc, t) => acc + t, 0);
  const meanMs = totalTimeMs / sampleCount;
  const p50Ms = timesMs[Math.floor(sampleCount * 0.5)];
  const p95Ms = timesMs[Math.floor(sampleCount * 0.95)];
  const p99Ms = timesMs[Math.floor(sampleCount * 0.99)];

  const variance = timesMs.reduce((acc, t) => acc + (t - meanMs) ** 2, 0) / sampleCount;
  const stdDevMs = Math.sqrt(variance);
  const throughputOpsSec = Math.round(sampleCount / (totalTimeMs / 1000));

  return {
    operation,
    iterations: sampleCount,
    totalTimeMs,
    meanMs,
    p50Ms,
    p95Ms,
    p99Ms,
    stdDevMs,
    throughputOpsSec
  };
}

export function runLatencyAndConvergenceBenchmarks(iterations: number): void {
  const simpson = new SimpsonsIntegrator();
  const bisection = new BisectionSolver();

  const timesPchipDecile: number[] = [];
  let gastwirthCertifiedCount = 0;

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const model = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
    const engine = new InequalityEngine(model, simpson, bisection);
    const res = engine.computeGini(200);
    const cert = engine.certifyGastwirthBounds(res.giniIndex);
    const t1 = performance.now();

    if (cert.isCertified) {
      gastwirthCertifiedCount++;
    }
    timesPchipDecile.push(t1 - t0);
  }

  const statsPchipDecile = computeStats("PCHIP Decile + Simpson 200 + Gastwirth", timesPchipDecile);

  const timesHybrid: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const hybrid = new HybridLorenzCurve(US_CENSUS_CPS_2022.dataset);
    const gVal = hybrid.analyticalGini(200);
    const t1 = performance.now();
    if (gVal > 0) timesHybrid.push(t1 - t0);
  }
  const statsHybrid = computeStats("Hybrid Pareto Tail Calibration + Gini", timesHybrid);

  const nsiModel = new PchipLorenzCurve(BULGARIAN_NSI_2022.dataset);
  const nsiEngine = new InequalityEngine(nsiModel, simpson, bisection);
  const povertyLine = BULGARIAN_NSI_2022.metadata.povertyLine;
  const timesPoverty: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const hc = nsiEngine.getPovertyHeadcount(povertyLine);
    const t1 = performance.now();
    if (hc > 0) timesPoverty.push(t1 - t0);
  }
  const statsPoverty = computeStats("Poverty Headcount Root Inversion", timesPoverty);

  const timesComprehensive: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const metrics = nsiEngine.computeComprehensiveMetrics(200, povertyLine);
    const t1 = performance.now();
    if (metrics.giniIndex > 0) timesComprehensive.push(t1 - t0);
  }
  const statsComprehensive = computeStats(
    "Comprehensive Metrics Suite (Gini+W+Palma+H)",
    timesComprehensive
  );

  const allStats = [statsPchipDecile, statsHybrid, statsPoverty, statsComprehensive];
  console.log(
    "---------------------------------------------------------------------------------------------------------"
  );
  console.log(
    "| Pipeline Operation                           | Iterations | Mean (ms) | p50 (ms) | p95 (ms) | Throughput (ops/s) |"
  );
  console.log(
    "---------------------------------------------------------------------------------------------------------"
  );
  for (const s of allStats) {
    const name = s.operation.padEnd(44);
    const iters = s.iterations.toString().padStart(10);
    const mean = s.meanMs.toFixed(4).padStart(9);
    const p50 = s.p50Ms.toFixed(4).padStart(8);
    const p95 = s.p95Ms.toFixed(4).padStart(8);
    const tp = s.throughputOpsSec.toLocaleString().padStart(18);
    console.log(`| ${name} | ${iters} | ${mean} | ${p50} | ${p95} | ${tp} |`);
  }
  console.log(
    "---------------------------------------------------------------------------------------------------------\n"
  );

  console.log(
    `Gastwirth Enclosure Confinement: ${gastwirthCertifiedCount} / ${iterations} trials certified (${((gastwirthCertifiedCount / iterations) * 100).toFixed(1)}% compliance)\n`
  );

  console.log("---------------------------------------------------------------------------------");
  console.log(" Error Decay vs Ground-Truth Log-Normal (sigma = 0.8, Analytical Gini = 0.428392)");
  console.log("---------------------------------------------------------------------------------");
  const logNorm = new LogNormalDistribution(0.8);
  const gStar = logNorm.theoreticalGini;
  console.log(
    "| Grid Size (k) | Knot Spacing (h) | Reconstructed Gini | Absolute Error | Relative Error |"
  );
  console.log("---------------------------------------------------------------------------------");

  for (const k of [5, 10, 20, 50, 100, 200]) {
    const dataset = logNorm.sampleQuantiles(k);
    const model = new PchipLorenzCurve(dataset);
    const engine = new InequalityEngine(model, simpson, bisection);
    const gEst = engine.computeGini(400).giniIndex;
    const absErr = Math.abs(gEst - gStar);
    const relErr = (absErr / gStar) * 100;

    const kStr = k.toString().padStart(13);
    const hStr = (1 / k).toFixed(4).padStart(16);
    const gStr = gEst.toFixed(6).padStart(18);
    const errStr = absErr.toExponential(3).padStart(14);
    const relStr = `${relErr.toFixed(3)}%`.padStart(14);
    console.log(`| ${kStr} | ${hStr} | ${gStr} | ${errStr} | ${relStr} |`);
  }
  console.log(
    "---------------------------------------------------------------------------------\n"
  );
}
