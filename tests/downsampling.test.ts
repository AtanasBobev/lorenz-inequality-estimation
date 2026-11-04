import { describe, it, expect } from "vitest";
import { DownsamplingStressTester, BULGARIAN_NSI_2022 } from "../src/index.js";

describe("DownsamplingStressTester Breakdown Analysis", () => {
  const tester = new DownsamplingStressTester();

  it("evaluates downsampling degradation across deciles, quintiles, quartiles, and tertiles", () => {
    const referenceGini = 0.3582;
    const report = tester.runStressTest(
      "Bulgarian NSI 2022",
      BULGARIAN_NSI_2022.dataset,
      referenceGini
    );

    expect(report.records.length).toBeGreaterThanOrEqual(3);
    expect(report.datasetName).toBe("Bulgarian NSI 2022");

    // Deciles should have narrower Gastwirth envelope than quintiles
    const deciles = report.records.find((r) => r.knotCount === 10);
    const quintiles = report.records.find((r) => r.knotCount === 5);
    const tertiles = report.records.find((r) => r.knotCount === 3);

    if (deciles && quintiles) {
      expect(deciles.envelopeWidth).toBeLessThan(quintiles.envelopeWidth);
      expect(deciles.linearUnderestimationPct).toBeLessThan(quintiles.linearUnderestimationPct);
    }

    if (quintiles && tertiles) {
      expect(quintiles.envelopeWidth).toBeLessThan(tertiles.envelopeWidth);
    }

    // All evaluated records should preserve Gastwirth certification
    for (const record of report.records) {
      expect(record.isCertified).toBe(true);
      expect(record.hybridGini).toBeGreaterThanOrEqual(record.gastwirthLowerBound - 1e-4);
      expect(record.hybridGini).toBeLessThanOrEqual(record.gastwirthUpperBound + 1e-4);
    }
  });

  it("identifies information breakdown when downsampled to tertiles", () => {
    const report = tester.runStressTest("Bulgarian NSI 2022", BULGARIAN_NSI_2022.dataset, 0.3582);
    const tertiles = report.records.find((r) => r.knotCount === 3);
    if (tertiles) {
      expect(tertiles.envelopeWidth).toBeGreaterThan(0.08);
      expect(tertiles.linearUnderestimationPct).toBeGreaterThan(5.0);
    }
  });
});
