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

## Project Architecture

```
src/
├── core/
│   ├── LorenzModel.ts         # Abstract base class defining mathematical contracts
│   ├── InequalityEngine.ts    # Facade orchestrating validation, fitting, and certification
│   ├── NumericalIntegrator.ts # Quadrature strategy interface
│   ├── RootFinder.ts          # Root-finding strategy interface
│   └── types.ts               # Core domain interfaces and metric records
├── interpolation/
│   ├── PchipLorenzCurve.ts       # Monotone Hermite splines with convexity cone repair
│   └── CubicSplineLorenzCurve.ts # Classical C^2 cubic splines (baseline comparator)
├── tail/
│   ├── HybridLorenzCurve.ts   # C^1 continuity tail splicing and analytical alpha
│   └── ParetoLorenzCurve.ts   # Pure Pareto distribution kernel
├── integration/
│   ├── SimpsonsIntegrator.ts    # Composite Simpson's 1/3 rule with parity enforcement
│   └── TrapezoidalIntegrator.ts # Linear trapezoidal quadrature
└── solvers/
    ├── TridiagonalSolver.ts  # O(N) Thomas algorithm LU decomposition
    ├── NewtonRaphsonSolver.ts # 1D quadratic root finding for headcount inversion
    └── BisectionSolver.ts    # Robust interval bracketing
```

## Academic Context

Developed as a Senior Project and Diploma Thesis in Computer Science (COS 4091) at the American University in Bulgaria (AUBG), Department of Computer Science.

- Author: Atanas Bobev (Student ID: 200239539)
- Academic Supervisor: Prof. Dr. Narasimha Rao Vajjhala, Chair, Department of Computer Science
