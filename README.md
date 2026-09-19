# Lorenz Inequality Estimation

A TypeScript tool to reconstruct continuous Lorenz curves and estimate inequality metrics (such as the Gini coefficient) from discrete census quantiles (like 5 quintiles or 10 deciles).

The numerical solvers (tridiagonal Thomas algorithm, bisection, and Newton-Raphson) are implemented from scratch without third-party math libraries.

## Requirements

- Node.js (v18 or newer)
- npm

## Setup

```bash
npm install
```

## Running Tests

Run the test suite:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## Build

Compile TypeScript to JavaScript in `dist/`:

```bash
npm run build
```

Type check only:

```bash
npm run typecheck
```

## Project Layout

- `src/core/`: base model definitions and data types
- `src/solvers/`: tridiagonal solver, bisection, and Newton-Raphson
- `src/interpolation/`: spline and shape-preserving interpolation
- `src/integration/`: numerical integration routines
- `tests/`: test suite
