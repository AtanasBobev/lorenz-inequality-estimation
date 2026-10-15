import { QuantileDataset } from "../core/types.js";

export interface QuantileData {
  p: number[];
  L: number[];
  name?: string;
  meanIncome?: number;
}

export interface ParseOptions {
  assumeCumulative?: boolean;
  name?: string;
  meanIncome?: number;
}

export class DatasetParser {
  static parseDelimited(text: string, options: ParseOptions = {}): QuantileData {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

    if (lines.length < 2) {
      throw new Error("Dataset must contain at least two data points.");
    }

    const firstLine = lines[0];
    const delimiter = this.detectDelimiter(firstLine);

    let startIndex = 0;
    const headerTokens = firstLine.split(delimiter).map((t) => t.trim().toLowerCase());
    const isHeader = headerTokens.some((t) => isNaN(parseFloat(t.replace("%", ""))));
    if (isHeader) {
      startIndex = 1;
    }

    const pRaw: number[] = [];
    const lRaw: number[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const tokens = line.split(delimiter).map((t) => t.trim());
      if (tokens.length < 2) continue;

      const pVal = this.parseNumericToken(tokens[0]);
      const lVal = this.parseNumericToken(tokens[1]);

      if (isNaN(pVal) || isNaN(lVal)) {
        throw new Error(`Invalid numerical value on line ${i + 1}: "${line}"`);
      }

      pRaw.push(pVal);
      lRaw.push(lVal);
    }

    if (pRaw.length < 2) {
      throw new Error("Insufficient valid data points parsed from input table.");
    }

    const pNormalized = this.normalizeProportions(pRaw);
    let lNormalized = this.normalizeProportions(lRaw);

    const isCumulative = options.assumeCumulative ?? this.detectIfCumulative(lNormalized);

    if (!isCumulative) {
      lNormalized = this.cumulativeSum(lNormalized);
    }

    const data: QuantileData = {
      p: pNormalized,
      L: lNormalized,
      name: options.name ?? "Custom Ingested Dataset",
      meanIncome: options.meanIncome
    };

    return this.validateQuantiles(data);
  }

  static parseJson(jsonText: string, options: ParseOptions = {}): QuantileData {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Invalid JSON formatting in input string.");
    }

    if (Array.isArray(parsed)) {
      if (parsed.length < 2) {
        throw new Error("JSON array must contain at least two quantile objects.");
      }

      const p: number[] = [];
      const L: number[] = [];

      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i] as Record<string, unknown>;
        const pVal = Number(item.p ?? item.pop ?? item.population ?? item.percentile ?? item.x);
        const lVal = Number(item.L ?? item.income ?? item.share ?? item.cumIncome ?? item.y);

        if (isNaN(pVal) || isNaN(lVal)) {
          throw new Error(`Invalid numerical properties in JSON item at index ${i}`);
        }
        p.push(pVal);
        L.push(lVal);
      }

      return this.parseDelimited(p.map((pv, idx) => `${pv},${L[idx]}`).join("\n"), options);
    }

    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const pArr = (obj.p ?? obj.population ?? obj.percentiles) as number[] | undefined;
      const lArr = (obj.L ?? obj.income ?? obj.shares) as number[] | undefined;

      if (Array.isArray(pArr) && Array.isArray(lArr) && pArr.length >= 2) {
        const name = typeof obj.name === "string" ? obj.name : options.name;
        const meanIncome = typeof obj.meanIncome === "number" ? obj.meanIncome : options.meanIncome;
        return this.parseDelimited(pArr.map((pv, idx) => `${pv},${lArr[idx]}`).join("\n"), {
          ...options,
          name,
          meanIncome
        });
      }

      // Check if wrapped in quantiles array: { quantiles: [{p, L}, ...] }
      const quantiles = obj.quantiles;
      if (Array.isArray(quantiles) && quantiles.length >= 2) {
        const name = typeof obj.name === "string" ? obj.name : options.name;
        const meanIncome = typeof obj.meanIncome === "number" ? obj.meanIncome : options.meanIncome;
        return this.parseJson(JSON.stringify(quantiles), { ...options, name, meanIncome });
      }
    }

    throw new Error(
      "Unrecognized JSON structure. Expected array of {p, L} objects or {p: [], L: []} object."
    );
  }

  static validateQuantiles(data: QuantileData): QuantileData {
    const p = [...data.p];
    const L = [...data.L];

    if (p.length !== L.length) {
      throw new Error(
        `Length mismatch: population has ${p.length} points, income has ${L.length}.`
      );
    }
    if (p.length < 2) {
      throw new Error("Quantile dataset must contain at least 2 points.");
    }

    // Automatically ensure (0, 0) anchor
    if (Math.abs(p[0]) > 1e-7 || Math.abs(L[0]) > 1e-7) {
      p.unshift(0.0);
      L.unshift(0.0);
    }

    // Automatically ensure (1, 1) anchor
    const lastIdx = p.length - 1;
    if (Math.abs(p[lastIdx] - 1.0) > 1e-7 || Math.abs(L[lastIdx] - 1.0) > 1e-7) {
      p.push(1.0);
      L.push(1.0);
    }

    // Verify ordering and economic invariants
    for (let i = 1; i < p.length; i++) {
      if (p[i] <= p[i - 1]) {
        throw new Error(
          `Population shares must strictly increase: knot ${i} (${p[i]}) <= knot ${i - 1} (${p[i - 1]}).`
        );
      }
      if (L[i] < L[i - 1] - 1e-7) {
        throw new Error(
          `Income shares must be non-decreasing: knot ${i} (${L[i]}) < knot ${i - 1} (${L[i - 1]}).`
        );
      }
      if (L[i] > p[i] + 1e-7) {
        throw new Error(
          `Lorenz curve violates sub-diagonal property at knot ${i}: income (${L[i]}) > population (${p[i]}).`
        );
      }
    }

    return {
      p,
      L,
      name: data.name,
      meanIncome: data.meanIncome
    };
  }

  static toQuantileDataset(data: QuantileData, defaultMeanIncome = 10000): QuantileDataset {
    const validated = this.validateQuantiles(data);
    const meanIncome = validated.meanIncome ?? defaultMeanIncome;

    return {
      meanIncome,
      points: validated.p.map((pv, i) => ({
        populationShare: pv,
        incomeShare: validated.L[i]
      }))
    };
  }

  static toCsv(data: QuantileData): string {
    const rows = ["population,income_share"];
    for (let i = 0; i < data.p.length; i++) {
      rows.push(`${data.p[i].toFixed(4)},${data.L[i].toFixed(6)}`);
    }
    return rows.join("\n");
  }

  static toJson(data: QuantileData): string {
    const list = data.p.map((pv, i) => ({
      p: Number(pv.toFixed(4)),
      L: Number(data.L[i].toFixed(6))
    }));
    return JSON.stringify(
      {
        name: data.name ?? "Lorenz Dataset",
        quantiles: list
      },
      null,
      2
    );
  }

  private static detectDelimiter(line: string): string {
    if (line.includes("\t")) return "\t";
    if (line.includes(";")) return ";";
    return ",";
  }

  private static parseNumericToken(token: string): number {
    const clean = token.replace("%", "").trim();
    const val = parseFloat(clean);
    if (token.includes("%")) {
      return val / 100;
    }
    return val;
  }

  private static normalizeProportions(arr: number[]): number[] {
    const maxVal = Math.max(...arr);
    if (maxVal > 1.05 && maxVal <= 100.5) {
      return arr.map((v) => v / 100);
    }
    return [...arr];
  }

  private static detectIfCumulative(arr: number[]): boolean {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1] - 1e-7) {
        return false;
      }
    }
    return true;
  }

  private static cumulativeSum(arr: number[]): number[] {
    const total = arr.reduce((acc, v) => acc + v, 0);
    const scale = total > 0.8 && total < 1.2 ? total : 1.0;

    const result: number[] = [];
    let running = 0;
    for (let i = 0; i < arr.length; i++) {
      running += arr[i] / scale;
      result.push(Math.min(1.0, running));
    }
    return result;
  }
}
