import { describe, it, expect } from "vitest";
import { DatasetParser } from "../src/data/DatasetParser.js";
import {
  validateQuantilePoints,
  validateEconomicParameters,
  autoRepairQuantiles
} from "../demo/src/validation.js";

describe("DatasetParser - Ingestion and Validation", () => {
  it("parses standard comma-separated CSV with headers", () => {
    const csv = `
population,income_share
0.2,0.05
0.4,0.14
0.6,0.28
0.8,0.51
1.0,1.00
    `.trim();

    const result = DatasetParser.parseDelimited(csv, { name: "Test CSV" });
    expect(result.p).toHaveLength(6);
    expect(result.p[0]).toBe(0);
    expect(result.L[0]).toBe(0);
    expect(result.p[5]).toBe(1);
    expect(result.L[5]).toBe(1);
    expect(result.name).toBe("Test CSV");
  });

  it("handles percentage tokens automatically", () => {
    const csv = `
pop_pct,share_pct
20%, 5.0%
40%, 14.0%
60%, 28.0%
80%, 51.0%
100%, 100.0%
    `.trim();

    const result = DatasetParser.parseDelimited(csv);
    expect(result.p[1]).toBeCloseTo(0.2);
    expect(result.L[1]).toBeCloseTo(0.05);
    expect(result.p[5]).toBeCloseTo(1.0);
    expect(result.L[5]).toBeCloseTo(1.0);
  });

  it("detects marginal shares and accumulates them", () => {
    const marginalCsv = `
p,marginal_share
0.2, 0.05
0.4, 0.09
0.6, 0.14
0.8, 0.23
1.0, 0.49
    `.trim();

    const result = DatasetParser.parseDelimited(marginalCsv, { assumeCumulative: false });
    expect(result.L[1]).toBeCloseTo(0.05);
    expect(result.L[2]).toBeCloseTo(0.14);
    expect(result.L[5]).toBeCloseTo(1.0);
  });

  it("parses tab-separated (TSV) and semicolon-separated tables", () => {
    const tsv = "0.2\t0.05\n0.4\t0.14\n0.6\t0.28\n0.8\t0.51\n1.0\t1.0";
    const resTsv = DatasetParser.parseDelimited(tsv);
    expect(resTsv.p).toHaveLength(6);

    const semi = "0.2;0.05\n0.4;0.14\n0.6;0.28\n0.8;0.51\n1.0;1.0";
    const resSemi = DatasetParser.parseDelimited(semi);
    expect(resSemi.L[1]).toBeCloseTo(0.05);
  });

  it("parses JSON format correctly", () => {
    const jsonStr = JSON.stringify([
      { p: 0.2, L: 0.05 },
      { p: 0.4, L: 0.14 },
      { p: 0.6, L: 0.28 },
      { p: 0.8, L: 0.51 },
      { p: 1.0, L: 1.0 }
    ]);

    const result = DatasetParser.parseJson(jsonStr, { name: "JSON Deciles" });
    expect(result.p).toHaveLength(6);
    expect(result.L[4]).toBeCloseTo(0.51);
    expect(result.name).toBe("JSON Deciles");
  });

  it("throws descriptive errors on invalid inputs", () => {
    const invalidMonotonicity = "0.2,0.05\n0.1,0.14\n1.0,1.0";
    expect(() => DatasetParser.parseDelimited(invalidMonotonicity)).toThrow();

    const invalidSuperDiagonal = "0.2,0.30\n1.0,1.0";
    expect(() => DatasetParser.parseDelimited(invalidSuperDiagonal)).toThrow();

    const corruptValues = "0.2,0.05\n0.5,abc\n1.0,1.0";
    expect(() => DatasetParser.parseDelimited(corruptValues)).toThrow();
  });

  it("exports data round-trip to CSV and JSON", () => {
    const orig = {
      p: [0, 0.2, 0.5, 1.0],
      L: [0, 0.05, 0.25, 1.0],
      name: "Roundtrip"
    };

    const csvOut = DatasetParser.toCsv(orig);
    expect(csvOut).toContain("population,income_share");

    const jsonOut = DatasetParser.toJson(orig);
    const reParsed = DatasetParser.parseJson(jsonOut);
    expect(reParsed.p).toHaveLength(4);
    expect(reParsed.L[2]).toBeCloseTo(0.25);
  });

  it("handles diverse JSON schemas, scale normalizations, and validation edge cases", () => {
    // 0-100 scale without '%' symbol and marginal non-cumulative shares
    const pctScaleCsv = "p,L\n20, 15\n40, 10\n60, 20\n80, 25\n100, 30\nsingle_token_line";
    const parsedPct = DatasetParser.parseDelimited(pctScaleCsv);
    expect(parsedPct.p[1]).toBeCloseTo(0.2);
    expect(parsedPct.L[5]).toBeCloseTo(1.0);

    // Marginal shares for interior knots whose unscaled sum is outside (0.8, 1.2)
    const smallMarginalCsv = "0.5, 0.1\n0.8, 0.2";
    const parsedSmall = DatasetParser.parseDelimited(smallMarginalCsv, {
      assumeCumulative: false
    });
    expect(parsedSmall.L[2]).toBeCloseTo(0.3);
    expect(parsedSmall.L[3]).toBeCloseTo(1.0);

    // JSON object with { p, L, name, meanIncome }
    const objJson = JSON.stringify({
      name: "ObjDataset",
      meanIncome: 32000,
      p: [0, 0.5, 1],
      L: [0, 0.25, 1]
    });
    const parsedObj = DatasetParser.parseJson(objJson);
    expect(parsedObj.name).toBe("ObjDataset");
    expect(parsedObj.meanIncome).toBe(32000);

    // JSON object with { population, income } and fallback options
    const altObjJson = JSON.stringify({
      population: [0, 0.5, 1],
      income: [0, 0.2, 1]
    });
    const parsedAlt = DatasetParser.parseJson(altObjJson, {
      name: "FallbackName",
      meanIncome: 18000
    });
    expect(parsedAlt.name).toBe("FallbackName");
    expect(parsedAlt.meanIncome).toBe(18000);

    // JSON object with { quantiles: [{ population, income }] } and meanIncome
    const wrappedJson = JSON.stringify({
      meanIncome: 41000,
      quantiles: [
        { population: 0.5, income: 0.2 },
        { population: 1.0, income: 1.0 }
      ]
    });
    const parsedWrapped = DatasetParser.parseJson(wrappedJson, { name: "Wrapped" });
    expect(parsedWrapped.meanIncome).toBe(41000);

    // Convert to QuantileDataset with and without defaultMeanIncome
    const dsWithMean = DatasetParser.toQuantileDataset(parsedWrapped);
    expect(dsWithMean.meanIncome).toBe(41000);
    const dsDefaultMean = DatasetParser.toQuantileDataset({ p: [0, 1], L: [0, 1] }, 15000);
    expect(dsDefaultMean.meanIncome).toBe(15000);

    // toJson without name uses default name
    const unnamedJson = DatasetParser.toJson({ p: [0, 1], L: [0, 1] });
    expect(unnamedJson).toContain("Lorenz Dataset");

    // Error paths
    expect(() => DatasetParser.parseDelimited("0.5,0.2")).toThrow(/at least two data points/);
    expect(() => DatasetParser.parseDelimited("p,L\n0.5,0.2\nbad_single_token")).toThrow(
      /Insufficient valid data points/
    );
    expect(() => DatasetParser.parseJson("{bad json")).toThrow(/Invalid JSON/);
    expect(() => DatasetParser.parseJson(JSON.stringify([{ p: 0.5, L: 0.2 }]))).toThrow(
      /at least two quantile objects/
    );
    expect(() =>
      DatasetParser.parseJson(
        JSON.stringify([
          { p: 0.5, L: "bad" },
          { p: 1.0, L: 1.0 }
        ])
      )
    ).toThrow(/Invalid numerical properties/);
    expect(() => DatasetParser.parseJson(JSON.stringify({ foo: "bar" }))).toThrow(
      /Unrecognized JSON structure/
    );
    expect(() => DatasetParser.parseJson("42")).toThrow(/Unrecognized JSON structure/);

    expect(() => DatasetParser.validateQuantiles({ p: [0, 0.5, 1], L: [0, 1] })).toThrow(
      /Length mismatch/
    );
    expect(() => DatasetParser.validateQuantiles({ p: [0], L: [0] })).toThrow(/at least 2 points/);
    expect(() =>
      DatasetParser.validateQuantiles({ p: [0, 0.5, 0.8, 1], L: [0, 0.3, 0.2, 1] })
    ).toThrow(/non-decreasing/);
  });

  it("validates UI economic parameters and flags out-of-range poverty lines", () => {
    const validParams = validateEconomicParameters(25000, 10000, 0.8);
    expect(validParams.isValid).toBe(true);
    expect(validParams.povertyLineWarning).toBeNull();

    const highPoverty = validateEconomicParameters(10000, 60000, 0.8);
    expect(highPoverty.isValid).toBe(true);
    expect(highPoverty.povertyLineWarning).toContain("exceeds 500%");

    const lowPoverty = validateEconomicParameters(10000, 200, 0.8);
    expect(lowPoverty.isValid).toBe(true);
    expect(lowPoverty.povertyLineWarning).toContain("less than 5%");

    const invalidParams = validateEconomicParameters(-100, 0, 0.99);
    expect(invalidParams.isValid).toBe(false);
    expect(invalidParams.meanIncomeError).not.toBeNull();
    expect(invalidParams.povertyLineError).not.toBeNull();
    expect(invalidParams.spliceError).not.toBeNull();
  });

  it("auto-repairs malformed quantile grids into valid Lorenz knots", () => {
    const fallbackGrid = autoRepairQuantiles([{ populationShare: 0, incomeShare: 0 }]);
    expect(fallbackGrid).toHaveLength(3);
    expect(validateQuantilePoints(fallbackGrid).isValid).toBe(true);

    const brokenGrid = [
      { populationShare: 0.1, incomeShare: 0.2 },
      { populationShare: 0.6, incomeShare: 0.7 },
      { populationShare: 0.3, incomeShare: 0.15 },
      { populationShare: 0.3, incomeShare: 0.1 },
      { populationShare: 0.9, incomeShare: 0.9 }
    ];
    const repaired = autoRepairQuantiles(brokenGrid);
    const report = validateQuantilePoints(repaired);
    expect(report.isValid).toBe(true);
  });
});
