# Lorenz Inequality Estimation

Client-side TypeScript library and browser dashboard for reconstructing continuous Lorenz curves from grouped census tables (such as 5 quintiles or 10 deciles) and computing inequality metrics including the Gini index, Palma ratio, Sen social welfare, poverty headcount, and Gastwirth bounds.

The numerical routines (Thomas tridiagonal solver, Fritsch-Carlson PCHIP splines, convexity repair loop, closed-form Pareto tail splicing, Simpson 1/3 integration, and bracketed root finders) are written directly in TypeScript with no external runtime dependencies.

## What It Does

- Fits a shape-preserving PCHIP spline across the interior brackets so the curve stays monotone ($L'(p) \ge 0$) and passes through every input knot.
- Runs an iterative slope-projection loop to enforce convexity ($L''(p) \ge 0$), preventing Runge oscillations and keeping marginal incomes non-decreasing (empirical convergence in 1–3 sweeps, hard cap 5).
- Splices a Pareto Type I upper tail onto the spline at a threshold $p^_$, matching both $L(p^_)$ and $L'(p^*)$ in closed form without an iterative optimizer.
- Computes the exact chord lower bound $G_L$ and secant-approximated upper bound $\hat{G}_U$ ($[G_L, \hat{G}_U]$) to verify that the reconstructed Gini estimate $G_{\mathrm{est}}$ stays enclosed inside its discrete interval.
- Runs entirely in the browser (`demo/app.js`, 112.7 kB) or Node.js (ES2022) with zero runtime packages, averaging 0.0042 ms (`k = 10`) to 0.0128 ms (`k = 100`) in Node.js 22 and 0.0087 ms to 0.0178 ms in Edge Chromium V8.

## Requirements

- Node.js v20+
- npm

## Setup

```bash
npm install
```

## Common Commands

Run the test suite (Vitest):

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Compile the library to `dist/` and check types:

```bash
npm run build
npm run typecheck
```

Bundle the browser demo (`demo/app.js`):

```bash
npm run build:demo
```

Run the 10,000-iteration latency and empirical benchmarks:

```bash
npm run benchmark
```

## Project Layout

```
src/
├── core/
│   ├── LorenzModel.ts         # Abstract base class for Lorenz curve models
│   ├── InequalityEngine.ts    # Facade for Gini, Palma, Sen welfare, and Gastwirth bounds
│   ├── NumericalIntegrator.ts # Quadrature interface
│   ├── RootFinder.ts          # Root-finding interface
│   └── types.ts               # Shared domain types and result records
├── interpolation/
│   ├── PchipLorenzCurve.ts       # PCHIP Hermite spline with convexity repair
│   └── CubicSplineLorenzCurve.ts # Classical C^2 cubic spline via Thomas algorithm
├── tail/
│   ├── HybridLorenzCurve.ts   # C^1 Pareto tail splicing and closed-form alpha solver
│   └── ParetoLorenzCurve.ts   # Standalone Type I Pareto Lorenz curve
├── integration/
│   ├── SimpsonsIntegrator.ts    # Composite Simpson 1/3 rule
│   └── TrapezoidalIntegrator.ts # Composite trapezoidal rule
├── solvers/
│   ├── TridiagonalSolver.ts   # O(N) Thomas algorithm
│   ├── NewtonRaphsonSolver.ts # Safeguarded 1D Newton-Raphson solver
│   └── BisectionSolver.ts     # Bracketing bisection fallback
├── data/
│   ├── censusDatasets.ts      # Built-in NSI 2022, Eurostat EU-27, and US CPS datasets
│   └── DatasetParser.ts       # CSV, TSV, and JSON quantile parser
├── simulation/
│   ├── SyntheticDistribution.ts     # Interface for ground-truth distributions
│   ├── LogNormalDistribution.ts     # Log-Normal distribution
│   ├── SinghMaddalaDistribution.ts  # Singh-Maddala (Burr XII) distribution
│   ├── DagumDistribution.ts         # Dagum (Burr III) distribution
│   ├── syntheticDistributions.ts    # Distribution registry
│   └── specialFunctions.ts          # Lanczos log-Gamma, erf, and incomplete Beta
├── regression/
│   ├── KakwaniPodderCurve.ts        # Parametric Kakwani-Podder (1976) baseline
│   └── ConsumptionRegressor.ts      # OLS consumption regression
└── diagnostics/
    ├── SensitivityAnalyzer.ts       # Poverty elasticities, Pareto sweeps, and WID checks
    ├── DownsamplingStressTester.ts  # Coarsening tests from deciles down to tertiles
    └── ModelSelectionEvaluator.ts   # AIC, AICc, BIC, Akaike weights, and p* search
demo/
├── index.html                 # Interactive browser UI
├── style.css                  # Main stylesheet entry point
├── styles/                    # Modular CSS (layout, forms, tables, charts)
└── src/                       # Browser TypeScript controllers and Canvas 2D charts
benchmarks/
├── runBenchmarks.ts           # Benchmark entry point
├── latencyBenchmarks.ts       # 10,000-iteration timing suite
└── empiricalBenchmarks.ts     # Cross-country WIID and census accuracy checks
```

## Adding a Custom Synthetic Distribution

New ground-truth distributions can be added under `src/simulation/` without changing the spline, tail, or integration code.

### 1. Implement `SyntheticDistribution`

Create a class implementing [`SyntheticDistribution`](src/simulation/SyntheticDistribution.ts):

```ts
import { QuantileDataset, QuantilePoint } from "../core/types.js";
import { SyntheticDistribution } from "./SyntheticDistribution.js";

export class CustomPowerDistribution implements SyntheticDistribution {
  public readonly name = "Custom Power Distribution";
  public readonly theoreticalGini: number;

  constructor(private readonly shape: number) {
    if (shape <= 1) {
      throw new Error(`Shape parameter must be > 1, received ${shape}.`);
    }
    this.theoreticalGini = 1 / (2 * shape - 1);
  }

  public evaluateLorenz(p: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return 1 - Math.pow(1 - p, 1 - 1 / this.shape);
  }

  public sampleQuantiles(k: number, meanIncome: number = 25000): QuantileDataset {
    const points: QuantilePoint[] = [];
    for (let i = 0; i <= k; i++) {
      const p = i / k;
      points.push({ populationShare: p, incomeShare: this.evaluateLorenz(p) });
    }
    return { meanIncome, points };
  }
}
```

Export the new class from `src/simulation/index.ts` to make it available at the package root.

### 2. Run Error and Bounds Checks

```ts
import {
  HybridLorenzCurve,
  InequalityEngine,
  SimpsonsIntegrator,
  NewtonRaphsonSolver,
  ModelSelectionEvaluator
} from "./src/index.js";

const dist = new CustomPowerDistribution(2.2);
const dataset = dist.sampleQuantiles(10, 30000);

const hybrid = new HybridLorenzCurve(dataset);
const engine = new InequalityEngine(hybrid, new SimpsonsIntegrator(), new NewtonRaphsonSolver());

const metrics = engine.computeComprehensiveMetrics(200, 12000);
const absError = Math.abs(metrics.giniIndex - dist.theoreticalGini);
const optimal = ModelSelectionEvaluator.findOptimalKnot(dataset);

console.log({
  theoreticalGini: dist.theoreticalGini,
  estimatedGini: metrics.giniIndex,
  absError,
  enclosedInBounds: metrics.gastwirthCertificate.isCertified,
  optimalSplice: optimal.optimalKnot
});
```

### 3. Verify Before Committing

Add tests under `tests/` covering the `(0, 0)` and `(1, 1)` anchors, convexity, and Gini convergence as `k` grows, then run:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run build:demo
```

## Academic Context

Built for the COS 4091 Senior Diploma Thesis at the American University in Bulgaria (AUBG), Department of Computer Science.

- Author: Atanas Bobev (ID: 200239539)
- Supervisor: Dr. Narasimha Rao Vajjhala, Chair, Department of Computer Science
