import { describe, it, expect } from "vitest";
import { DatasetParser } from "../src/data/DatasetParser.js";

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

    const corruptValues = "0.2,abc\n1.0,1.0";
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
});
