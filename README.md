# Lorenz Inequality Estimation

A standalone, client-side TypeScript engine for reconstructing continuous, economically valid Lorenz curves and estimating inequality metrics (such as the Gini index, Palma ratio, and Sen social welfare) from discrete, censored census quantiles (e.g., 5 quintiles or 10 deciles).

All numerical solvers (tridiagonal Thomas algorithm, PCHIP shape-preserving splines, iterative convexity cone projection, analytical Pareto tail splicing, Simpson 1/3 quadrature, and root finders) are implemented from first principles with zero external runtime dependencies.

## Key Features

- **Shape-Preserving Spline Interpolation**: Implements Piecewise Cubic Hermite Interpolating Polynomials (PCHIP) with Fritsch-Carlson harmonic tangents, strictly guaranteeing first-derivative monotonicity ($L'(p) \ge 0$).
- **Automated Convexity Cone Repair**: An iterative projection protocol enforcing second-derivative non-negativity ($L''(p) \ge 0$), eliminating Runge oscillations and guaranteeing ordered marginal incomes.
- **Analytical Asymptotic Tail Splicing**: Slices a heavy-tailed continuous Pareto distribution onto the non-parametric body at threshold $p^*$, matching levels and first derivatives at exact $C^1$ continuity without non-linear optimization loops.
- **Certified Gastwirth Bounds**: Evaluates theoretical mathematical upper and lower bounds ($[G_L, G_U]$) to certify estimation accuracy against census data information loss.
- **Zero Runtime Dependencies**: 100% vanilla TypeScript targeting ECMAScript 2022, compatible with modern web browsers and serverless runtimes.
- **Sub-Millisecond Execution**: Evaluates full spline fitting, tail splicing, and quadrature integration in under 2.0 milliseconds.

## Requirements

- Node.js (v18 or newer)
- npm

## Setup

```bash
npm install
```

## Running Tests

Run the Vitest automated test suite:

```bash
npm test
```

Watch mode for interactive development:

```bash
npm run test:watch
```

## Build and Typecheck

Compile TypeScript sources to JavaScript in `dist/`:

```bash
npm run build
```

Run static type checking with strict compiler options:

```bash
npm run typecheck
```

## Running Performance Benchmarks

Run the 10,000-iteration execution latency benchmarks across quantile tiers:

```bash
npm run benchmark
```

## Project Architecture

```
src/
├── core/
│   ├── LorenzModel.ts         # Abstract base class for continuous Lorenz curves
│   ├── InequalityEngine.ts    # Facade for Gini, Palma, Sen welfare, and Gastwirth bounds
│   ├── NumericalIntegrator.ts # Quadrature strategy interface
│   ├── RootFinder.ts          # Root-finding strategy interface
│   └── types.ts               # Core domain types and metric records
├── interpolation/
│   ├── PchipLorenzCurve.ts       # Monotone Hermite splines with convexity cone repair
│   └── CubicSplineLorenzCurve.ts # Classical C^2 cubic splines solved via Thomas algorithm
├── tail/
│   ├── HybridLorenzCurve.ts   # C^1 continuity tail splicing and closed-form alpha calibration
│   └── ParetoLorenzCurve.ts   # Type-I Pareto Lorenz curve kernel
├── integration/
│   ├── SimpsonsIntegrator.ts    # Composite Simpson's 1/3 rule with even-interval enforcement
│   └── TrapezoidalIntegrator.ts # Composite trapezoidal quadrature
├── solvers/
│   ├── TridiagonalSolver.ts   # O(N) Thomas algorithm for tridiagonal linear systems
│   ├── NewtonRaphsonSolver.ts # Safeguarded Newton-Raphson solver for headcount inversion
│   └── BisectionSolver.ts     # Bracketing bisection root solver
├── data/
│   ├── censusDatasets.ts      # Empirical census deciles (Bulgarian NSI, Eurostat, US CPS)
│   └── DatasetParser.ts       # Multi-format CSV/TSV/JSON ingestion and normalization
├── simulation/
│   ├── SyntheticDistribution.ts     # Interface for analytical ground-truth distributions
│   ├── LogNormalDistribution.ts     # Analytical Log-Normal benchmark distribution
│   ├── SinghMaddalaDistribution.ts  # Analytical Singh-Maddala (Burr XII) distribution
│   ├── DagumDistribution.ts         # Analytical Dagum (Burr III) distribution
│   ├── syntheticDistributions.ts    # Synthetic distribution factory and registry
│   └── specialFunctions.ts          # Lanczos log-Gamma, erf, and incomplete Beta routines
├── regression/
│   ├── KakwaniPodderCurve.ts        # Parametric Kakwani-Podder (1976) Lorenz curve
│   └── ConsumptionRegressor.ts      # Ordinary least squares consumption regression
└── diagnostics/
    ├── SensitivityAnalyzer.ts       # Poverty elasticities, Pareto sweeps, and WID benchmarks
    ├── DownsamplingStressTester.ts  # Coarsening stress tests (deciles down to tertiles)
    └── ModelSelectionEvaluator.ts   # AIC, AICc, BIC, Akaike weights, and knot optimization
demo/
├── index.html                 # Interactive browser dashboard UI
├── style.css                  # Dashboard stylesheet
└── src/                       # Client-side TypeScript chart and table controllers
```

## Developer's Guide: Building Custom Simulations

You can extend the engine with your own parametric or empirical ground-truth income distributions without touching the core solvers or quadrature pipeline.

### 1. Implement `SyntheticDistribution`

Create a new class in `src/simulation/` (for example, `src/simulation/ParetoWeibullDistribution.ts`) implementing the [`SyntheticDistribution`](src/simulation/SyntheticDistribution.ts) interface:

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

Re-export your class from `src/simulation/index.ts` so it is available from the package root.

### 2. Evaluate Reconstruction Error and Gastwirth Bounds

Feed the sampled quantiles into any `LorenzModel` and `InequalityEngine`:

```ts
import {
  HybridLorenzCurve,
  InequalityEngine,
  SimpsonsIntegrator,
  NewtonRaphsonSolver,
  ModelSelectionEvaluator
} from "./src/index.js";

const dist = new CustomPowerDistribution(2.2);
const dataset = dist.sampleQuantiles(10, 30000); // 10 deciles

const hybrid = new HybridLorenzCurve(dataset);
const engine = new InequalityEngine(hybrid, new SimpsonsIntegrator(), new NewtonRaphsonSolver());

const metrics = engine.computeComprehensiveMetrics(200, 12000);
const absError = Math.abs(metrics.giniIndex - dist.theoreticalGini);
const optimal = ModelSelectionEvaluator.findOptimalKnot(dataset);

console.log({
  theoreticalGini: dist.theoreticalGini,
  estimatedGini: metrics.giniIndex,
  absError,
  certified: metrics.gastwirthCertificate.isCertified,
  optimalSplice: optimal.optimalKnot
});
```

### 3. Verify and Test

Add unit tests in `tests/` checking boundary anchors `(0, 0)` and `(1, 1)`, monotonicity/convexity, and Gini convergence as `k` increases, then run the full quality gate:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:coverage   # enforces 100% statements/branches/functions/lines in src/
npm run build
npm run build:demo
```

## Academic Context

Developed as a Senior Project and Diploma Thesis in Computer Science (COS 4091) at the American University in Bulgaria (AUBG), Department of Computer Science.

- Author: Atanas Bobev (Student ID: 200239539)
- Academic Supervisor: Prof. Dr. Narasimha Rao Vajjhala, Chair, Department of Computer Science
