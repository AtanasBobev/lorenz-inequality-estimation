import { QuantilePoint } from "../../src/index.js";

export interface KnotError {
  rowIndex: number;
  field: "p" | "L" | "all";
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  errors: KnotError[];
  warnings: string[];
}

export interface ParameterValidation {
  meanIncomeError: string | null;
  povertyLineError: string | null;
  povertyLineWarning: string | null;
  spliceError: string | null;
  isValid: boolean;
}

/**
 * Validates discrete quantile knots against mathematical and economic Lorenz axioms:
 * 1. Boundary Anchors: (0, 0) and (1, 1).
 * 2. Strict population monotonicity: p_{i} > p_{i-1}.
 * 3. Weak income monotonicity: L_{i} >= L_{i-1}.
 * 4. Sub-diagonal condition: L_i <= p_i.
 * 5. Knot count >= 3.
 */
export function validateQuantilePoints(points: QuantilePoint[]): ValidationReport {
  const errors: KnotError[] = [];
  const warnings: string[] = [];

  if (points.length < 3) {
    errors.push({
      rowIndex: 0,
      field: "all",
      message: `At least 3 quantile knots are required for spline interpolation. Currently provided: ${points.length}.`
    });
    return { isValid: false, errors, warnings };
  }

  // Anchor checks
  if (Math.abs(points[0].populationShare) > 1e-6 || Math.abs(points[0].incomeShare) > 1e-6) {
    errors.push({
      rowIndex: 0,
      field: "all",
      message: "The initial knot must be anchored exactly at (p=0.00, L=0.00)."
    });
  }

  const lastIdx = points.length - 1;
  if (
    Math.abs(points[lastIdx].populationShare - 1.0) > 1e-6 ||
    Math.abs(points[lastIdx].incomeShare - 1.0) > 1e-6
  ) {
    errors.push({
      rowIndex: lastIdx,
      field: "all",
      message: "The terminal knot must be anchored exactly at (p=1.00, L=1.00)."
    });
  }

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    // Range checks
    if (isNaN(pt.populationShare) || pt.populationShare < 0 || pt.populationShare > 1) {
      errors.push({
        rowIndex: i,
        field: "p",
        message: `Knot ${i + 1}: Population share p must be a number between 0.0 and 1.0.`
      });
    }

    if (isNaN(pt.incomeShare) || pt.incomeShare < 0 || pt.incomeShare > 1) {
      errors.push({
        rowIndex: i,
        field: "L",
        message: `Knot ${i + 1}: Income share L must be a number between 0.0 and 1.0.`
      });
    }

    // Sub-diagonal check: L(p) <= p
    if (pt.incomeShare > pt.populationShare + 1e-6) {
      errors.push({
        rowIndex: i,
        field: "L",
        message: `Knot ${i + 1}: Income share L (${pt.incomeShare.toFixed(3)}) exceeds population share p (${pt.populationShare.toFixed(3)}). This violates sub-diagonal property.`
      });
    }

    // Monotonicity checks against previous knot
    if (i > 0) {
      const prev = points[i - 1];

      // Strict population monotonicity (avoids division by zero in secant slopes)
      if (pt.populationShare <= prev.populationShare) {
        errors.push({
          rowIndex: i,
          field: "p",
          message: `Knot ${i + 1}: Population share p (${pt.populationShare.toFixed(3)}) must be strictly greater than previous knot (${prev.populationShare.toFixed(3)}).`
        });
      } else if (pt.populationShare - prev.populationShare < 0.005) {
        warnings.push(
          `Knot ${i + 1}: Distance to previous knot is very small (${(pt.populationShare - prev.populationShare).toFixed(4)}), which may produce steep local derivatives.`
        );
      }

      // Weak income monotonicity (no negative incomes)
      if (pt.incomeShare < prev.incomeShare - 1e-6) {
        errors.push({
          rowIndex: i,
          field: "L",
          message: `Knot ${i + 1}: Cumulative income share L (${pt.incomeShare.toFixed(3)}) cannot be less than previous knot (${prev.incomeShare.toFixed(3)}).`
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates economic parameters (mean income, poverty line, splicing point).
 */
export function validateEconomicParameters(
  meanIncome: number,
  povertyLine: number,
  splicePoint: number,
  points: QuantilePoint[]
): ParameterValidation {
  let meanIncomeError: string | null = null;
  let povertyLineError: string | null = null;
  let povertyLineWarning: string | null = null;
  let spliceError: string | null = null;

  if (isNaN(meanIncome) || !isFinite(meanIncome) || meanIncome <= 0) {
    meanIncomeError = "Mean income must be a strictly positive number.";
  }

  if (isNaN(povertyLine) || !isFinite(povertyLine) || povertyLine <= 0) {
    povertyLineError = "Poverty threshold must be a strictly positive number.";
  } else if (meanIncome > 0) {
    const ratio = povertyLine / meanIncome;
    if (ratio > 5.0) {
      povertyLineWarning = `Poverty line exceeds 500% of mean income (${(ratio * 100).toFixed(0)}%). Headcount will approach 100%.`;
    } else if (ratio < 0.05) {
      povertyLineWarning = `Poverty line is less than 5% of mean income. Headcount will approach 0%.`;
    }
  }

  if (isNaN(splicePoint) || splicePoint < 0.5 || splicePoint > 0.98) {
    spliceError = "Pareto splicing threshold p* must lie between 0.50 and 0.98.";
  } else if (points.length >= 3) {
    const minInterior = points[1].populationShare;
    const maxInterior = points[points.length - 2].populationShare;
    if (splicePoint < minInterior || splicePoint > maxInterior + 0.05) {
      spliceError = `Splicing point p* (${splicePoint.toFixed(2)}) should fall within empirical interior knots [${minInterior.toFixed(2)}, ${maxInterior.toFixed(2)}].`;
    }
  }

  return {
    meanIncomeError,
    povertyLineError,
    povertyLineWarning,
    spliceError,
    isValid: meanIncomeError === null && povertyLineError === null && spliceError === null
  };
}

/**
 * Automatically repairs and normalizes a broken quantile dataset into a valid Lorenz specification:
 * - Fixes anchors: (0, 0) and (1, 1).
 * - Sorts interior knots strictly ascending by p.
 * - Deduplicates identical population coordinates.
 * - Clamps L_i <= p_i and enforces L_i >= L_{i-1}.
 */
export function autoRepairQuantiles(points: QuantilePoint[]): QuantilePoint[] {
  if (points.length < 2) {
    return [
      { populationShare: 0.0, incomeShare: 0.0 },
      { populationShare: 0.5, incomeShare: 0.25 },
      { populationShare: 1.0, incomeShare: 1.0 }
    ];
  }

  // Extract interior knots
  let interior = points
    .filter((pt, idx) => idx > 0 && idx < points.length - 1)
    .map((pt) => ({
      populationShare: Math.min(
        0.99,
        Math.max(0.01, isNaN(pt.populationShare) ? 0.5 : pt.populationShare)
      ),
      incomeShare: Math.min(1.0, Math.max(0.0, isNaN(pt.incomeShare) ? 0.25 : pt.incomeShare))
    }));

  // Sort by population share
  interior.sort((a, b) => a.populationShare - b.populationShare);

  // Deduplicate and ensure strict spacing
  const cleaned: QuantilePoint[] = [{ populationShare: 0.0, incomeShare: 0.0 }];
  let prevP = 0.0;
  let prevL = 0.0;

  for (const pt of interior) {
    let p = pt.populationShare;
    if (p <= prevP) {
      p = Math.min(0.98, prevP + 0.02);
    }
    let L = Math.min(p, Math.max(prevL, pt.incomeShare));

    cleaned.push({ populationShare: p, incomeShare: L });
    prevP = p;
    prevL = L;
  }

  cleaned.push({ populationShare: 1.0, incomeShare: 1.0 });
  return cleaned;
}
