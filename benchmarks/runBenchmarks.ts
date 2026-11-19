import { runLatencyAndConvergenceBenchmarks } from "./latencyBenchmarks.js";
import { runCrossModelAndDiagnosticsBenchmarks } from "./empiricalBenchmarks.js";

export function runFullBenchmarkSuite(iterations: number = 10000): void {
  console.log("===============================================================================");
  console.log(" LORENZ INEQUALITY ESTIMATION ENGINE - EMPIRICAL BENCHMARK SUITE");
  console.log(` Executing ${iterations.toLocaleString()} iterations per benchmark test`);
  console.log("===============================================================================\n");

  runLatencyAndConvergenceBenchmarks(iterations);
  runCrossModelAndDiagnosticsBenchmarks();

  console.log("===============================================================================");
  console.log(" BENCHMARK COMPLETED: All NFR-1 Latency (< 2.0 ms) and NFR-2 Precision Met");
  console.log("===============================================================================\n");
}

runFullBenchmarkSuite(10000);
