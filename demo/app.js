"use strict";
(() => {
  // src/core/LorenzModel.ts
  var LorenzModel = class {
    dataset;
    points;
    constructor(dataset) {
      this.validateDataset(dataset);
      this.dataset = dataset;
      this.points = dataset.points;
    }
    quantileIncome(p) {
      const clampedP = this.clampPopulation(p);
      return this.dataset.meanIncome * this.derivative(clampedP);
    }
    topShare(topFraction) {
      if (topFraction <= 0 || topFraction >= 1) {
        throw new Error(`Top fraction must be in (0, 1), received ${topFraction}.`);
      }
      return 1 - this.evaluate(1 - topFraction);
    }
    isMonotonic(sampleCount = 200, tolerance = 1e-8) {
      const step = 1 / sampleCount;
      for (let i = 0; i <= sampleCount; i++) {
        const p = i * step;
        if (this.derivative(p) < -tolerance) {
          return false;
        }
      }
      return true;
    }
    isConvex(sampleCount = 200, tolerance = 1e-8) {
      const step = 1 / sampleCount;
      for (let i = 0; i <= sampleCount; i++) {
        const p = i * step;
        if (this.secondDerivative(p) < -tolerance) {
          return false;
        }
      }
      return true;
    }
    findConvexityViolations(sampleCount = 200, tolerance = 1e-8) {
      const violations = [];
      const step = 1 / sampleCount;
      for (let i = 0; i <= sampleCount; i++) {
        const p = i * step;
        if (this.secondDerivative(p) < -tolerance) {
          violations.push(p);
        }
      }
      return violations;
    }
    clampPopulation(p) {
      if (p < 0) return 0;
      if (p > 1) return 1;
      return p;
    }
    findKnotInterval(p) {
      const n = this.points.length;
      if (p <= this.points[0].populationShare) {
        return 0;
      }
      if (p >= this.points[n - 1].populationShare) {
        return n - 2;
      }
      let low = 0;
      let high = n - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (p < this.points[mid].populationShare) {
          high = mid - 1;
        } else if (p >= this.points[mid + 1].populationShare) {
          low = mid + 1;
        } else {
          return mid;
        }
      }
      return Math.max(0, Math.min(n - 2, low));
    }
    getDataset() {
      return this.dataset;
    }
    validateDataset(dataset) {
      if (!dataset.points || dataset.points.length < 2) {
        throw new Error("Quantile dataset must contain at least 2 points.");
      }
      if (dataset.meanIncome <= 0) {
        throw new Error(`Mean income must be positive, received ${dataset.meanIncome}.`);
      }
      const first = dataset.points[0];
      const last = dataset.points[dataset.points.length - 1];
      if (Math.abs(first.populationShare) > 1e-9 || Math.abs(first.incomeShare) > 1e-9) {
        throw new Error(
          `First knot must start at (0, 0), received (${first.populationShare}, ${first.incomeShare}).`
        );
      }
      if (Math.abs(last.populationShare - 1) > 1e-9 || Math.abs(last.incomeShare - 1) > 1e-9) {
        throw new Error(
          `Last knot must end at (1, 1), received (${last.populationShare}, ${last.incomeShare}).`
        );
      }
      for (let i = 1; i < dataset.points.length; i++) {
        const prev = dataset.points[i - 1];
        const curr = dataset.points[i];
        if (curr.populationShare <= prev.populationShare) {
          throw new Error(
            `Population shares must be strictly increasing: knot ${i} (${curr.populationShare}) <= knot ${i - 1} (${prev.populationShare}).`
          );
        }
        if (curr.incomeShare < prev.incomeShare) {
          throw new Error(
            `Income shares must be non-decreasing: knot ${i} (${curr.incomeShare}) < knot ${i - 1} (${prev.incomeShare}).`
          );
        }
      }
    }
  };

  // src/core/InequalityEngine.ts
  var InequalityEngine = class {
    model;
    integrator;
    rootFinder;
    constructor(model, integrator, rootFinder) {
      this.model = model;
      this.integrator = integrator;
      this.rootFinder = rootFinder;
    }
    computeGini(stepCount = 100) {
      return this.integrator.integrate(this.model, 0, 1, stepCount);
    }
    computeSenWelfare(stepCount = 100) {
      const gini = this.computeGini(stepCount);
      const meanIncome = this.model.getDataset().meanIncome;
      const senWelfareIndex = meanIncome * (1 - gini.giniIndex);
      return {
        senWelfareIndex,
        meanIncome,
        giniIndex: gini.giniIndex
      };
    }
    computePalmaRatio() {
      const top10Share = 1 - this.model.evaluate(0.9);
      const bottom40Share = this.model.evaluate(0.4);
      if (bottom40Share <= 0) {
        return Infinity;
      }
      return top10Share / bottom40Share;
    }
    findPercentileHoldingShare(targetShare) {
      if (targetShare < 0 || targetShare > 1) {
        throw new Error(`Target income share must be in [0, 1], received ${targetShare}.`);
      }
      const result = this.rootFinder.findRoot(this.model, targetShare, 0, 1, 1e-7);
      return result.root;
    }
    getIncomeAtPercentile(p) {
      return this.model.quantileIncome(p);
    }
    // Solves for poverty headcount ratio H where marginal income equals povertyLine.
    getPovertyHeadcount(povertyLine, meanIncome, tolerance = 1e-7, maxIterations = 60) {
      if (povertyLine <= 0) {
        return 0;
      }
      const mu = meanIncome ?? this.model.getDataset().meanIncome;
      if (mu <= 0) {
        throw new Error(`Mean income must be strictly positive, received ${mu}.`);
      }
      const y0 = mu * this.model.derivative(0);
      if (povertyLine <= y0) {
        return 0;
      }
      const y1 = mu * this.model.derivative(1);
      if (povertyLine >= y1) {
        return 1;
      }
      let a = 0;
      let b = 1;
      let p = Math.max(1e-4, Math.min(1 - 1e-4, (povertyLine - y0) / Math.max(1e-6, y1 - y0)));
      for (let iter = 0; iter < maxIterations; iter++) {
        const currentIncome = mu * this.model.derivative(p);
        const residual = currentIncome - povertyLine;
        if (Math.abs(residual) <= tolerance * Math.max(1, povertyLine)) {
          return p;
        }
        if (residual < 0) {
          a = p;
        } else {
          b = p;
        }
        const intervalWidth = b - a;
        if (intervalWidth <= tolerance) {
          return 0.5 * (a + b);
        }
        const dResidual = mu * this.model.secondDerivative(p);
        let stepAccepted = false;
        if (dResidual > 1e-12) {
          const pNewton = p - residual / dResidual;
          if (pNewton > a + 1e-12 && pNewton < b - 1e-12) {
            p = pNewton;
            stepAccepted = true;
          }
        }
        if (!stepAccepted) {
          p = 0.5 * (a + b);
        }
      }
      return 0.5 * (a + b);
    }
    // Certifies that estimated Gini lies within Gastwirth bounds [G_L, G_U].
    certifyGastwirthBounds(estimatedGini) {
      const dataset = this.model.getDataset();
      const points = dataset.points;
      const k = points.length - 1;
      let chordArea = 0;
      const secants = [];
      for (let i = 1; i <= k; i++) {
        const hi = points[i].populationShare - points[i - 1].populationShare;
        const deltaL = points[i].incomeShare - points[i - 1].incomeShare;
        secants.push(deltaL / hi);
        chordArea += 0.5 * hi * (points[i].incomeShare + points[i - 1].incomeShare);
      }
      const lowerBound = Math.max(0, 1 - 2 * chordArea);
      let deltaG = 0;
      for (let i = 0; i < k; i++) {
        const hi = points[i + 1].populationShare - points[i].populationShare;
        const sPrev = i > 0 ? secants[i - 1] : 0;
        const sNext = i < k - 1 ? secants[i + 1] : secants[i] * 1.5;
        deltaG += 0.5 * hi * hi * (sNext - sPrev);
      }
      const upperBound = Math.min(1, lowerBound + deltaG);
      const intervalWidth = upperBound - lowerBound;
      const gEst = estimatedGini ?? this.computeGini(200).giniIndex;
      const isCertified = gEst >= lowerBound - 1e-7 && gEst <= upperBound + 1e-7;
      const maxError = 0.5 * intervalWidth;
      return {
        lowerBound,
        upperBound,
        intervalWidth,
        estimatedGini: gEst,
        isCertified,
        maxError
      };
    }
    // Evaluates complete inequality metrics including Gini, Sen index, Palma ratio, and bounds.
    computeComprehensiveMetrics(stepCount = 200, povertyLine) {
      const giniResult = this.computeGini(stepCount);
      const senWelfare = this.computeSenWelfare(stepCount);
      const palmaRatio = this.computePalmaRatio();
      const gastwirthCertificate = this.certifyGastwirthBounds(giniResult.giniIndex);
      let povertyHeadcount = void 0;
      if (povertyLine !== void 0) {
        povertyHeadcount = this.getPovertyHeadcount(povertyLine);
      }
      return {
        giniIndex: giniResult.giniIndex,
        senWelfareIndex: senWelfare.senWelfareIndex,
        palmaRatio,
        areaUnderCurve: giniResult.areaUnderCurve,
        meanIncome: this.model.getDataset().meanIncome,
        povertyHeadcount,
        povertyLine,
        gastwirthCertificate
      };
    }
    setIntegrator(integrator) {
      this.integrator = integrator;
    }
    setRootFinder(rootFinder) {
      this.rootFinder = rootFinder;
    }
    setModel(model) {
      this.model = model;
    }
    getModel() {
      return this.model;
    }
    getIntegrator() {
      return this.integrator;
    }
    getRootFinder() {
      return this.rootFinder;
    }
  };

  // src/data/censusDatasets.ts
  var BULGARIAN_NSI_2022 = {
    metadata: {
      country: "Bulgaria",
      year: 2022,
      agency: "National Statistical Institute (NSI)",
      officialGini: 0.384,
      povertyLine: 3092,
      currency: "EUR",
      notes: "Official NSI Household Budget Survey 2022 decile dataset (EUR equivalents)."
    },
    dataset: {
      meanIncome: 5032,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.1, incomeShare: 0.021 },
        { populationShare: 0.2, incomeShare: 0.059 },
        { populationShare: 0.3, incomeShare: 0.11 },
        { populationShare: 0.4, incomeShare: 0.174 },
        { populationShare: 0.5, incomeShare: 0.251 },
        { populationShare: 0.6, incomeShare: 0.342 },
        { populationShare: 0.7, incomeShare: 0.45 },
        { populationShare: 0.8, incomeShare: 0.58 },
        { populationShare: 0.9, incomeShare: 0.744 },
        { populationShare: 1, incomeShare: 1 }
      ]
    }
  };
  var BULGARIAN_NSI_QUINTILES_2022 = {
    metadata: {
      country: "Bulgaria",
      year: 2022,
      agency: "National Statistical Institute (NSI)",
      officialGini: 0.384,
      povertyLine: 3092,
      currency: "EUR",
      notes: "Aggregated 5-quintile format from summary statistical yearbooks (EUR equivalents)."
    },
    dataset: {
      meanIncome: 5032,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.2, incomeShare: 0.059 },
        { populationShare: 0.4, incomeShare: 0.174 },
        { populationShare: 0.6, incomeShare: 0.342 },
        { populationShare: 0.8, incomeShare: 0.58 },
        { populationShare: 1, incomeShare: 1 }
      ]
    }
  };
  var EUROSTAT_EU27_2022 = {
    metadata: {
      country: "European Union (EU-27)",
      year: 2022,
      agency: "Eurostat",
      officialGini: 0.296,
      povertyLine: 12300,
      currency: "EUR (PPS)",
      notes: "Pan-European living conditions survey (EU-SILC)."
    },
    dataset: {
      meanIncome: 20500,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.1, incomeShare: 0.03 },
        { populationShare: 0.2, incomeShare: 0.076 },
        { populationShare: 0.3, incomeShare: 0.134 },
        { populationShare: 0.4, incomeShare: 0.203 },
        { populationShare: 0.5, incomeShare: 0.282 },
        { populationShare: 0.6, incomeShare: 0.371 },
        { populationShare: 0.7, incomeShare: 0.472 },
        { populationShare: 0.8, incomeShare: 0.59 },
        { populationShare: 0.9, incomeShare: 0.735 },
        { populationShare: 1, incomeShare: 1 }
      ]
    }
  };
  var US_CENSUS_CPS_2022 = {
    metadata: {
      country: "United States",
      year: 2022,
      agency: "US Census Bureau",
      officialGini: 0.488,
      povertyLine: 28180,
      currency: "EUR",
      notes: "Current Population Survey Annual Social and Economic Supplement 2022 (converted to EUR @ 1.053 USD/EUR)."
    },
    dataset: {
      meanIncome: 101e3,
      points: [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.1, incomeShare: 0.012 },
        { populationShare: 0.2, incomeShare: 0.03 },
        { populationShare: 0.3, incomeShare: 0.063 },
        { populationShare: 0.4, incomeShare: 0.113 },
        { populationShare: 0.5, incomeShare: 0.177 },
        { populationShare: 0.6, incomeShare: 0.256 },
        { populationShare: 0.7, incomeShare: 0.355 },
        { populationShare: 0.8, incomeShare: 0.486 },
        { populationShare: 0.9, incomeShare: 0.672 },
        { populationShare: 1, incomeShare: 1 }
      ]
    }
  };

  // src/data/DatasetParser.ts
  var DatasetParser = class {
    static parseDelimited(text, options = {}) {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));
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
      const pRaw = [];
      const lRaw = [];
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
      const data = {
        p: pNormalized,
        L: lNormalized,
        name: options.name ?? "Custom Ingested Dataset",
        meanIncome: options.meanIncome
      };
      return this.validateQuantiles(data);
    }
    static parseJson(jsonText, options = {}) {
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error("Invalid JSON formatting in input string.");
      }
      if (Array.isArray(parsed)) {
        if (parsed.length < 2) {
          throw new Error("JSON array must contain at least two quantile objects.");
        }
        const p = [];
        const L = [];
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
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
        const obj = parsed;
        const pArr = obj.p ?? obj.population ?? obj.percentiles;
        const lArr = obj.L ?? obj.income ?? obj.shares;
        if (Array.isArray(pArr) && Array.isArray(lArr) && pArr.length >= 2) {
          const name = typeof obj.name === "string" ? obj.name : options.name;
          const meanIncome = typeof obj.meanIncome === "number" ? obj.meanIncome : options.meanIncome;
          return this.parseDelimited(pArr.map((pv, idx) => `${pv},${lArr[idx]}`).join("\n"), {
            ...options,
            name,
            meanIncome
          });
        }
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
    static validateQuantiles(data) {
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
      if (Math.abs(p[0]) > 1e-7 || Math.abs(L[0]) > 1e-7) {
        p.unshift(0);
        L.unshift(0);
      }
      const lastIdx = p.length - 1;
      if (Math.abs(p[lastIdx] - 1) > 1e-7 || Math.abs(L[lastIdx] - 1) > 1e-7) {
        p.push(1);
        L.push(1);
      }
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
    static toQuantileDataset(data, defaultMeanIncome = 1e4) {
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
    static toCsv(data) {
      const rows = ["population,income_share"];
      for (let i = 0; i < data.p.length; i++) {
        rows.push(`${data.p[i].toFixed(4)},${data.L[i].toFixed(6)}`);
      }
      return rows.join("\n");
    }
    static toJson(data) {
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
    static detectDelimiter(line) {
      if (line.includes("	")) return "	";
      if (line.includes(";")) return ";";
      return ",";
    }
    static parseNumericToken(token) {
      const clean = token.replace("%", "").trim();
      const val = parseFloat(clean);
      if (token.includes("%")) {
        return val / 100;
      }
      return val;
    }
    static normalizeProportions(arr) {
      const maxVal = Math.max(...arr);
      if (maxVal > 1.05 && maxVal <= 100.5) {
        return arr.map((v) => v / 100);
      }
      return [...arr];
    }
    static detectIfCumulative(arr) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] < arr[i - 1] - 1e-7) {
          return false;
        }
      }
      return true;
    }
    static cumulativeSum(arr) {
      const total = arr.reduce((acc, v) => acc + v, 0);
      const scale = total > 0.8 && total < 1.2 ? total : 1;
      const result = [];
      let running = 0;
      for (let i = 0; i < arr.length; i++) {
        running += arr[i] / scale;
        result.push(Math.min(1, running));
      }
      return result;
    }
  };

  // src/integration/SimpsonsIntegrator.ts
  var SimpsonsIntegrator = class {
    name = "Composite Simpson's Rule";
    integrate(model, a = 0, b = 1, stepCount = 100) {
      if (stepCount < 2) {
        throw new Error(`stepCount must be at least 2, received ${stepCount}.`);
      }
      if (a >= b) {
        throw new Error(`Lower bound a (${a}) must be strictly less than upper bound b (${b}).`);
      }
      const n = stepCount % 2 === 0 ? stepCount : stepCount + 1;
      const h = (b - a) / n;
      let sum = model.evaluate(a) + model.evaluate(b);
      for (let i = 1; i < n; i++) {
        const p = a + i * h;
        const val = model.evaluate(p);
        sum += (i % 2 === 1 ? 4 : 2) * val;
      }
      const areaUnderCurve = sum * h / 3;
      const giniIndex = 1 - 2 * areaUnderCurve;
      return {
        giniIndex,
        areaUnderCurve,
        methodUsed: this.name
      };
    }
  };

  // src/interpolation/PchipLorenzCurve.ts
  var PchipLorenzCurve = class extends LorenzModel {
    knotSlopes;
    aCoeffs;
    bCoeffs;
    cCoeffs;
    dCoeffs;
    wasConvexityRepaired;
    constructor(dataset, options = {}) {
      super(dataset);
      const shouldEnforceConvexity = options.enforceConvexity ?? true;
      const n = this.points.length;
      const h = new Float64Array(n - 1);
      const delta = new Float64Array(n - 1);
      for (let i = 0; i < n - 1; i++) {
        h[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
        delta[i] = (this.points[i + 1].incomeShare - this.points[i].incomeShare) / h[i];
      }
      const d = new Float64Array(n);
      for (let i = 1; i < n - 1; i++) {
        if (delta[i - 1] * delta[i] <= 0) {
          d[i] = 0;
        } else {
          d[i] = 2 * delta[i - 1] * delta[i] / (delta[i - 1] + delta[i]);
        }
      }
      d[0] = Math.max(0, 1.5 * delta[0] - 0.5 * d[1]);
      d[n - 1] = Math.max(0, 1.5 * delta[n - 2] - 0.5 * d[n - 2]);
      let repaired = false;
      if (shouldEnforceConvexity) {
        repaired = this.repairConvexity(d, delta, n);
      }
      this.knotSlopes = Array.from(d);
      this.wasConvexityRepaired = repaired;
      this.aCoeffs = new Array(n - 1);
      this.bCoeffs = new Array(n - 1);
      this.cCoeffs = new Array(n - 1);
      this.dCoeffs = new Array(n - 1);
      for (let i = 0; i < n - 1; i++) {
        this.aCoeffs[i] = this.points[i].incomeShare;
        this.bCoeffs[i] = d[i];
        this.cCoeffs[i] = (3 * delta[i] - 2 * d[i] - d[i + 1]) / h[i];
        this.dCoeffs[i] = (d[i] + d[i + 1] - 2 * delta[i]) / (h[i] * h[i]);
      }
    }
    repairConvexity(d, delta, n) {
      let anyRepaired = false;
      const maxPasses = 5;
      for (let pass = 0; pass < maxPasses; pass++) {
        let passRepaired = false;
        for (let i = 0; i < n - 1; i++) {
          const secant = delta[i];
          if (2 * d[i] + d[i + 1] > 3 * secant) {
            const maxAllowedD = Math.max(0, (3 * secant - d[i + 1]) / 2);
            if (maxAllowedD < d[i]) {
              d[i] = maxAllowedD;
              passRepaired = true;
            }
          }
          if (d[i] + 2 * d[i + 1] < 3 * secant) {
            const minAllowedDNext = (3 * secant - d[i]) / 2;
            if (minAllowedDNext > d[i + 1]) {
              d[i + 1] = minAllowedDNext;
              passRepaired = true;
            }
          }
          if (d[i] > secant) {
            d[i] = secant;
            passRepaired = true;
          }
          if (d[i + 1] < secant) {
            d[i + 1] = secant;
            passRepaired = true;
          }
        }
        if (passRepaired) {
          anyRepaired = true;
        } else {
          break;
        }
      }
      return anyRepaired;
    }
    evaluate(p) {
      const clampedP = this.clampPopulation(p);
      const i = this.findKnotInterval(clampedP);
      const dx = clampedP - this.points[i].populationShare;
      return this.aCoeffs[i] + this.bCoeffs[i] * dx + this.cCoeffs[i] * dx * dx + this.dCoeffs[i] * dx * dx * dx;
    }
    derivative(p) {
      const clampedP = this.clampPopulation(p);
      const i = this.findKnotInterval(clampedP);
      const dx = clampedP - this.points[i].populationShare;
      return this.bCoeffs[i] + 2 * this.cCoeffs[i] * dx + 3 * this.dCoeffs[i] * dx * dx;
    }
    secondDerivative(p) {
      const clampedP = this.clampPopulation(p);
      const i = this.findKnotInterval(clampedP);
      const dx = clampedP - this.points[i].populationShare;
      return 2 * this.cCoeffs[i] + 6 * this.dCoeffs[i] * dx;
    }
    getKnotSlopes() {
      return this.knotSlopes;
    }
    wasRepaired() {
      return this.wasConvexityRepaired;
    }
  };

  // src/solvers/TridiagonalSolver.ts
  var TridiagonalSolver = class {
    solve(system) {
      return this.solveVectors(system.lower, system.diag, system.upper, system.rhs);
    }
    solveVectors(lower, diag, upper, rhs) {
      const n = diag.length;
      if (rhs.length !== n) {
        throw new Error(`RHS length (${rhs.length}) must match diagonal length (${n}).`);
      }
      if (n === 0) {
        return [];
      }
      if (n === 1) {
        if (Math.abs(diag[0]) < 1e-15) {
          throw new Error("Cannot solve 1x1 system with zero diagonal element.");
        }
        return [rhs[0] / diag[0]];
      }
      if (lower.length !== n - 1) {
        throw new Error(`Lower diagonal length (${lower.length}) must be n - 1 (${n - 1}).`);
      }
      if (upper.length !== n - 1) {
        throw new Error(`Upper diagonal length (${upper.length}) must be n - 1 (${n - 1}).`);
      }
      const cPrime = new Float64Array(n - 1);
      const dPrime = new Float64Array(n);
      if (Math.abs(diag[0]) < 1e-15) {
        throw new Error("Zero pivot encountered at row 0.");
      }
      cPrime[0] = upper[0] / diag[0];
      dPrime[0] = rhs[0] / diag[0];
      for (let i = 1; i < n; i++) {
        const denom = diag[i] - lower[i - 1] * cPrime[i - 1];
        if (Math.abs(denom) < 1e-15) {
          throw new Error(`Zero pivot encountered at row ${i}.`);
        }
        if (i < n - 1) {
          cPrime[i] = upper[i] / denom;
        }
        dPrime[i] = (rhs[i] - lower[i - 1] * dPrime[i - 1]) / denom;
      }
      const solution = new Array(n);
      solution[n - 1] = dPrime[n - 1];
      for (let i = n - 2; i >= 0; i--) {
        solution[i] = dPrime[i] - cPrime[i] * solution[i + 1];
      }
      return solution;
    }
  };

  // src/interpolation/CubicSplineLorenzCurve.ts
  var CubicSplineLorenzCurve = class extends LorenzModel {
    aCoeffs;
    bCoeffs;
    cCoeffs;
    dCoeffs;
    secondDerivatives;
    boundaryType;
    constructor(dataset, options = {}) {
      super(dataset);
      this.boundaryType = options.boundaryType ?? "natural";
      const n = this.points.length;
      const h = new Float64Array(n - 1);
      const delta = new Float64Array(n - 1);
      for (let i = 0; i < n - 1; i++) {
        h[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
        delta[i] = (this.points[i + 1].incomeShare - this.points[i].incomeShare) / h[i];
      }
      const solver = new TridiagonalSolver();
      const M = new Float64Array(n);
      if (this.boundaryType === "natural") {
        M[0] = 0;
        M[n - 1] = 0;
        if (n > 2) {
          const numInterior = n - 2;
          const lower = new Float64Array(numInterior - 1);
          const diag = new Float64Array(numInterior);
          const upper = new Float64Array(numInterior - 1);
          const rhs = new Float64Array(numInterior);
          for (let i = 0; i < numInterior; i++) {
            const knotIdx = i + 1;
            diag[i] = 2 * (h[knotIdx - 1] + h[knotIdx]);
            rhs[i] = 6 * (delta[knotIdx] - delta[knotIdx - 1]);
            if (i > 0) {
              lower[i - 1] = h[knotIdx - 1];
            }
            if (i < numInterior - 1) {
              upper[i] = h[knotIdx];
            }
          }
          const interiorM = solver.solveVectors(
            Array.from(lower),
            Array.from(diag),
            Array.from(upper),
            Array.from(rhs)
          );
          for (let i = 0; i < numInterior; i++) {
            M[i + 1] = interiorM[i];
          }
        }
      } else {
        const fPrime0 = options.clampStartSlope ?? 0;
        const fPrimeN = options.clampEndSlope ?? delta[n - 2];
        const lower = new Float64Array(n - 1);
        const diag = new Float64Array(n);
        const upper = new Float64Array(n - 1);
        const rhs = new Float64Array(n);
        diag[0] = 2 * h[0];
        upper[0] = h[0];
        rhs[0] = 6 * (delta[0] - fPrime0);
        for (let i = 1; i < n - 1; i++) {
          lower[i - 1] = h[i - 1];
          diag[i] = 2 * (h[i - 1] + h[i]);
          upper[i] = h[i];
          rhs[i] = 6 * (delta[i] - delta[i - 1]);
        }
        lower[n - 2] = h[n - 2];
        diag[n - 1] = 2 * h[n - 2];
        rhs[n - 1] = 6 * (fPrimeN - delta[n - 2]);
        const solvedM = solver.solveVectors(
          Array.from(lower),
          Array.from(diag),
          Array.from(upper),
          Array.from(rhs)
        );
        for (let i = 0; i < n; i++) {
          M[i] = solvedM[i];
        }
      }
      this.secondDerivatives = Array.from(M);
      this.aCoeffs = new Array(n - 1);
      this.bCoeffs = new Array(n - 1);
      this.cCoeffs = new Array(n - 1);
      this.dCoeffs = new Array(n - 1);
      for (let i = 0; i < n - 1; i++) {
        this.aCoeffs[i] = this.points[i].incomeShare;
        this.cCoeffs[i] = M[i] / 2;
        this.dCoeffs[i] = (M[i + 1] - M[i]) / (6 * h[i]);
        this.bCoeffs[i] = delta[i] - (2 * M[i] + M[i + 1]) * h[i] / 6;
      }
    }
    evaluate(p) {
      const clampedP = this.clampPopulation(p);
      const i = this.findKnotInterval(clampedP);
      const dx = clampedP - this.points[i].populationShare;
      return this.aCoeffs[i] + this.bCoeffs[i] * dx + this.cCoeffs[i] * dx * dx + this.dCoeffs[i] * dx * dx * dx;
    }
    derivative(p) {
      const clampedP = this.clampPopulation(p);
      const i = this.findKnotInterval(clampedP);
      const dx = clampedP - this.points[i].populationShare;
      return this.bCoeffs[i] + 2 * this.cCoeffs[i] * dx + 3 * this.dCoeffs[i] * dx * dx;
    }
    secondDerivative(p) {
      const clampedP = this.clampPopulation(p);
      const i = this.findKnotInterval(clampedP);
      const dx = clampedP - this.points[i].populationShare;
      return 2 * this.cCoeffs[i] + 6 * this.dCoeffs[i] * dx;
    }
    getBoundaryType() {
      return this.boundaryType;
    }
    getSecondDerivatives() {
      return this.secondDerivatives;
    }
  };

  // src/simulation/specialFunctions.ts
  function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * absX);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }
  function standardNormalCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }
  function inverseNormalCdf(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [
      -39.69683028665376,
      220.9460984245205,
      -275.9285104469687,
      138.357751867269,
      -30.66479806614716,
      2.506628277459239
    ];
    const b = [
      -54.47609879822406,
      161.5858368580409,
      -155.6989798598866,
      66.80131188771972,
      -13.28068155288572
    ];
    const c = [
      -0.007784894002430293,
      -0.3223964580411365,
      -2.400758277161838,
      -2.549732539343734,
      4.374664141464968,
      2.938163982698783
    ];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q;
    let r;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -((((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1));
    }
  }
  function logGamma(z) {
    const c = [
      57.15623566586292,
      -59.59796035547549,
      14.136097974741746,
      -0.4919138160976202,
      3399464998481189e-20,
      4652362892704858e-20,
      -9837447530487956e-20,
      15808870322437947e-20,
      -21013412297399777e-20,
      0.08333333333333333,
      0.5772156649015329
    ];
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    const x = z - 1;
    let sum = c[10];
    for (let i = 0; i < 9; i++) {
      sum += c[i] / (x + i + 1);
    }
    const t = x + 4.65;
    return (x + 0.5) * Math.log(t) - t + 0.5 * Math.log(2 * Math.PI) + Math.log(sum);
  }
  function regularizedIncompleteBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x > (a + 1) / (a + b + 2)) {
      return 1 - regularizedIncompleteBeta(b, a, 1 - x);
    }
    const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
    let f = 1;
    let c = 1;
    let d = 0;
    const tiny = 1e-30;
    for (let m = 1; m <= 200; m++) {
      let numerator;
      if (m % 2 === 0) {
        const k = m / 2;
        numerator = k * (b - k) * x / ((a + 2 * k - 1) * (a + 2 * k));
      } else {
        const k = (m - 1) / 2;
        numerator = -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1));
      }
      d = 1 + numerator * d;
      if (Math.abs(d) < tiny) d = tiny;
      d = 1 / d;
      c = 1 + numerator / c;
      if (Math.abs(c) < tiny) c = tiny;
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-12) {
        break;
      }
    }
    return Math.min(1, Math.max(0, front * (1 / f)));
  }

  // src/simulation/LogNormalDistribution.ts
  var LogNormalDistribution = class {
    name;
    sigma;
    mu;
    theoreticalGini;
    constructor(sigma = 0.8, mu = 10) {
      if (sigma <= 0) {
        throw new Error(`Scale parameter sigma must be positive, received ${sigma}.`);
      }
      this.sigma = sigma;
      this.mu = mu;
      this.name = `Log-Normal (sigma = ${sigma}, mu = ${mu})`;
      this.theoreticalGini = erf(sigma / 2);
    }
    evaluateLorenz(p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      const inv = inverseNormalCdf(p);
      return standardNormalCdf(inv - this.sigma);
    }
    sampleQuantiles(k, meanIncome = 5e4) {
      if (k < 2) {
        throw new Error(`Subinterval count k must be at least 2, received ${k}.`);
      }
      const points = [{ populationShare: 0, incomeShare: 0 }];
      for (let i = 1; i < k; i++) {
        const p = i / k;
        const l = this.evaluateLorenz(p);
        points.push({ populationShare: p, incomeShare: l });
      }
      points.push({ populationShare: 1, incomeShare: 1 });
      return {
        meanIncome,
        points
      };
    }
  };

  // src/simulation/SinghMaddalaDistribution.ts
  var SinghMaddalaDistribution = class {
    name;
    a;
    q;
    theoreticalGini;
    constructor(a = 2.8, q = 1.7) {
      if (a * q <= 1) {
        throw new Error(`Product a * q must be strictly greater than 1, received ${a * q}.`);
      }
      this.a = a;
      this.q = q;
      this.name = `Singh-Maddala (a = ${a}, q = ${q})`;
      const numerator = Math.exp(logGamma(q) + logGamma(2 * q - 1 / a));
      const denominator = Math.exp(logGamma(q - 1 / a) + logGamma(2 * q));
      this.theoreticalGini = 1 - numerator / denominator;
    }
    evaluateLorenz(p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      const u = 1 - Math.pow(1 - p, 1 / this.q);
      return regularizedIncompleteBeta(1 + 1 / this.a, this.q - 1 / this.a, u);
    }
    sampleQuantiles(k, meanIncome = 5e4) {
      const points = [{ populationShare: 0, incomeShare: 0 }];
      for (let i = 1; i < k; i++) {
        const p = i / k;
        points.push({ populationShare: p, incomeShare: this.evaluateLorenz(p) });
      }
      points.push({ populationShare: 1, incomeShare: 1 });
      return {
        meanIncome,
        points
      };
    }
  };

  // src/simulation/DagumDistribution.ts
  var DagumDistribution = class {
    name;
    a;
    p0;
    theoreticalGini;
    constructor(a = 3.5, p0 = 0.7) {
      if (a <= 1) {
        throw new Error(`Parameter a must be strictly greater than 1, received ${a}.`);
      }
      this.a = a;
      this.p0 = p0;
      this.name = `Dagum (a = ${a}, p0 = ${p0})`;
      const numerator = Math.exp(logGamma(p0) + logGamma(2 * p0 + 1 / a));
      const denominator = Math.exp(logGamma(p0 + 1 / a) + logGamma(2 * p0));
      this.theoreticalGini = numerator / denominator - 1;
    }
    evaluateLorenz(p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      const u = Math.pow(p, 1 / this.p0);
      return regularizedIncompleteBeta(this.p0 + 1 / this.a, 1 - 1 / this.a, u);
    }
    sampleQuantiles(k, meanIncome = 5e4) {
      const points = [{ populationShare: 0, incomeShare: 0 }];
      for (let i = 1; i < k; i++) {
        const p = i / k;
        points.push({ populationShare: p, incomeShare: this.evaluateLorenz(p) });
      }
      points.push({ populationShare: 1, incomeShare: 1 });
      return {
        meanIncome,
        points
      };
    }
  };

  // src/solvers/NewtonRaphsonSolver.ts
  var NewtonRaphsonSolver = class {
    name = "Newton-Raphson";
    solve(fn, dfn, initialGuess, lowerBound = -Infinity, upperBound = Infinity, tolerance = 1e-8, maxIterations = 100) {
      let x = initialGuess;
      for (let iter = 1; iter <= maxIterations; iter++) {
        const fx = fn(x);
        const dfx = dfn(x);
        if (Math.abs(fx) <= tolerance) {
          return {
            root: x,
            populationPercentile: x,
            iterations: iter,
            converged: true,
            finalError: Math.abs(fx)
          };
        }
        if (Math.abs(dfx) < 1e-15) {
          if (Number.isFinite(lowerBound) && Number.isFinite(upperBound)) {
            x = (lowerBound + upperBound) / 2;
            continue;
          }
          throw new Error(`Derivative too close to zero at x = ${x} (df = ${dfx}).`);
        }
        const step = fx / dfx;
        let nextX = x - step;
        if (nextX < lowerBound || nextX > upperBound) {
          nextX = Math.max(lowerBound, Math.min(upperBound, x - 0.5 * step));
        }
        if (Math.abs(nextX - x) <= tolerance && Math.abs(fn(nextX)) <= tolerance) {
          return {
            root: nextX,
            populationPercentile: nextX,
            iterations: iter,
            converged: true,
            finalError: Math.abs(fn(nextX))
          };
        }
        x = nextX;
      }
      return {
        root: x,
        populationPercentile: x,
        iterations: maxIterations,
        converged: false,
        finalError: Math.abs(fn(x))
      };
    }
    findRoot(model, targetIncomeShare, lowerBound = 0, upperBound = 1, tolerance = 1e-8, maxIterations = 100) {
      const initialGuess = (lowerBound + upperBound) / 2;
      return this.solve(
        (p) => model.evaluate(p) - targetIncomeShare,
        (p) => model.derivative(p),
        initialGuess,
        lowerBound,
        upperBound,
        tolerance,
        maxIterations
      );
    }
  };

  // src/tail/HybridLorenzCurve.ts
  var HybridLorenzCurve = class extends LorenzModel {
    bodyModel;
    splicePoint;
    tailAlpha;
    lSplice;
    dSplice;
    constructor(dataset, options = {}) {
      super(dataset);
      this.bodyModel = options.bodyModel ?? new PchipLorenzCurve(dataset);
      const defaultSplice = this.selectDefaultSplicePoint();
      const candidateSplice = options.splicePoint ?? defaultSplice;
      if (candidateSplice <= 0 || candidateSplice >= 1) {
        throw new Error(
          `Splice point must be strictly between 0 and 1, received ${candidateSplice}.`
        );
      }
      this.splicePoint = candidateSplice;
      this.lSplice = this.bodyModel.evaluate(this.splicePoint);
      this.dSplice = this.bodyModel.derivative(this.splicePoint);
      if (options.tailAlpha !== void 0) {
        if (options.tailAlpha <= 1) {
          throw new Error(
            `Tail alpha must be strictly greater than 1, received ${options.tailAlpha}.`
          );
        }
        this.tailAlpha = options.tailAlpha;
      } else {
        this.tailAlpha = this.computeAnalyticalAlpha(this.splicePoint, this.lSplice, this.dSplice);
      }
    }
    evaluate(p) {
      const clampedP = this.clampPopulation(p);
      if (clampedP <= 0) return 0;
      if (clampedP >= 1) return 1;
      if (clampedP <= this.splicePoint) {
        return this.bodyModel.evaluate(clampedP);
      }
      const t = (1 - clampedP) / (1 - this.splicePoint);
      const exponent = 1 - 1 / this.tailAlpha;
      return 1 - (1 - this.lSplice) * Math.pow(t, exponent);
    }
    derivative(p) {
      const clampedP = this.clampPopulation(p);
      if (clampedP <= 0) {
        return this.bodyModel.derivative(0);
      }
      if (clampedP <= this.splicePoint) {
        return this.bodyModel.derivative(clampedP);
      }
      if (clampedP >= 1 - 1e-12) {
        const t2 = 1e-12 / (1 - this.splicePoint);
        const factor2 = (1 - this.lSplice) / (1 - this.splicePoint) * (1 - 1 / this.tailAlpha);
        return factor2 * Math.pow(t2, -1 / this.tailAlpha);
      }
      const t = (1 - clampedP) / (1 - this.splicePoint);
      const factor = (1 - this.lSplice) / (1 - this.splicePoint) * (1 - 1 / this.tailAlpha);
      return factor * Math.pow(t, -1 / this.tailAlpha);
    }
    secondDerivative(p) {
      const clampedP = this.clampPopulation(p);
      if (clampedP <= this.splicePoint) {
        return this.bodyModel.secondDerivative(clampedP);
      }
      const denom = Math.pow(1 - this.splicePoint, 2);
      const factor = (1 - this.lSplice) / denom * ((this.tailAlpha - 1) / (this.tailAlpha * this.tailAlpha));
      if (clampedP >= 1 - 1e-12) {
        const t2 = 1e-12 / (1 - this.splicePoint);
        return factor * Math.pow(t2, -(this.tailAlpha + 1) / this.tailAlpha);
      }
      const t = (1 - clampedP) / (1 - this.splicePoint);
      return factor * Math.pow(t, -(this.tailAlpha + 1) / this.tailAlpha);
    }
    getSplicePoint() {
      return this.splicePoint;
    }
    getTailAlpha() {
      return this.tailAlpha;
    }
    getBodyModel() {
      return this.bodyModel;
    }
    analyticalTailArea() {
      const remainingP = 1 - this.splicePoint;
      const remainingL = 1 - this.lSplice;
      const factor = this.tailAlpha * remainingL / (2 * this.tailAlpha - 1);
      return remainingP * (1 - factor);
    }
    analyticalTotalArea(bodySubintervals = 200) {
      const n = bodySubintervals % 2 === 0 ? bodySubintervals : bodySubintervals + 1;
      const h = this.splicePoint / n;
      let bodySum = this.bodyModel.evaluate(0) + this.bodyModel.evaluate(this.splicePoint);
      for (let i = 1; i < n; i++) {
        const p = i * h;
        bodySum += (i % 2 === 1 ? 4 : 2) * this.bodyModel.evaluate(p);
      }
      const bodyArea = bodySum * h / 3;
      return bodyArea + this.analyticalTailArea();
    }
    analyticalGini(bodySubintervals = 200) {
      const area = this.analyticalTotalArea(bodySubintervals);
      return 1 - 2 * area;
    }
    selectDefaultSplicePoint() {
      const n = this.points.length;
      if (n >= 4) {
        return this.points[n - 2].populationShare;
      }
      return 0.8;
    }
    computeAnalyticalAlpha(pStar, lStar, dStar) {
      const remainingP = 1 - pStar;
      const remainingL = 1 - lStar;
      if (remainingP <= 0 || remainingL <= 0) {
        return 2;
      }
      const secantSlope = remainingL / remainingP;
      const denominator = remainingL - remainingP * dStar;
      if (denominator <= 1e-7 || dStar >= secantSlope) {
        const targetDerivative = 0.92 * secantSlope;
        const safeDenominator = remainingL - remainingP * targetDerivative;
        return Math.max(1.05, remainingL / safeDenominator);
      }
      const alpha = remainingL / denominator;
      return Math.max(1.05, alpha);
    }
  };

  // demo/src/presets.ts
  function loadPreset(key) {
    switch (key) {
      case "bg_nsi_2022":
        return {
          dataset: {
            meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
            points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: BULGARIAN_NSI_2022.metadata.povertyLine,
          // 3092 EUR
          currency: "EUR"
        };
      case "bg_nsi_quintiles":
        return {
          dataset: {
            meanIncome: BULGARIAN_NSI_QUINTILES_2022.dataset.meanIncome,
            points: BULGARIAN_NSI_QUINTILES_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: BULGARIAN_NSI_QUINTILES_2022.metadata.povertyLine,
          // 3092 EUR
          currency: "EUR"
        };
      case "eurostat_2022":
        return {
          dataset: {
            meanIncome: EUROSTAT_EU27_2022.dataset.meanIncome,
            points: EUROSTAT_EU27_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: EUROSTAT_EU27_2022.metadata.povertyLine,
          // 12300 EUR
          currency: "EUR"
        };
      case "us_census_2022":
        return {
          dataset: {
            meanIncome: US_CENSUS_CPS_2022.dataset.meanIncome,
            points: US_CENSUS_CPS_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: US_CENSUS_CPS_2022.metadata.povertyLine,
          // 28180 EUR
          currency: "EUR"
        };
      case "syn_lognormal": {
        const syn = new LogNormalDistribution(0.7);
        return {
          dataset: syn.sampleQuantiles(10, 25e3),
          poverty: 12e3,
          currency: "EUR"
        };
      }
      case "syn_singh_maddala": {
        const syn = new SinghMaddalaDistribution(1.5, 2.8);
        return {
          dataset: syn.sampleQuantiles(10, 24e3),
          poverty: 11500,
          currency: "EUR"
        };
      }
      case "syn_dagum": {
        const syn = new DagumDistribution(3.5, 0.7);
        return {
          dataset: syn.sampleQuantiles(10, 26e3),
          poverty: 12500,
          currency: "EUR"
        };
      }
      default:
        return {
          dataset: {
            meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
            points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: BULGARIAN_NSI_2022.metadata.povertyLine,
          currency: "EUR"
        };
    }
  }

  // demo/src/engineBridge.ts
  function evaluateInequality(state2) {
    let baseSpline;
    let model;
    if (state2.modelType === "cubicspline") {
      baseSpline = new CubicSplineLorenzCurve(state2.dataset);
      model = baseSpline;
    } else {
      baseSpline = new PchipLorenzCurve(state2.dataset);
      if (state2.modelType === "hybrid") {
        model = new HybridLorenzCurve(state2.dataset, {
          bodyModel: baseSpline,
          splicePoint: state2.splicingThreshold
        });
      } else {
        model = baseSpline;
      }
    }
    const integrator = new SimpsonsIntegrator();
    const solver = new NewtonRaphsonSolver();
    const engine = new InequalityEngine(model, integrator, solver);
    const metrics = engine.computeComprehensiveMetrics(200, state2.povertyLine);
    return { metrics, model };
  }

  // demo/src/charts/lorenzChart.ts
  function renderLorenzChart(canvas, state2) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 50 ? rect.width : 580;
    const h = rect.height > 50 ? rect.height : 380;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { left: 52, right: 28, top: 24, bottom: 44 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const toX = (p) => pad.left + p * plotW;
    const toY = (L) => pad.top + (1 - L) * plotH;
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 1;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#6c757d";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const val = i / 5;
      const x = toX(val);
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), x, pad.top + plotH + 16);
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(1), pad.left - 8, y + 4);
      ctx.textAlign = "center";
    }
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#212529";
    ctx.fillText("Cumulative population share (p)", pad.left + plotW / 2, h - 10);
    ctx.save();
    ctx.translate(15, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Cumulative income share L(p)", 0, 0);
    ctx.restore();
    const pts = state2.dataset.points;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(toX(pts[0].populationShare), toY(pts[0].incomeShare));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(toX(pts[i].populationShare), toY(pts[i].incomeShare));
      }
      ctx.lineTo(toX(1), toY(1));
      ctx.lineTo(toX(0), toY(0));
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fill();
      ctx.strokeStyle = "#adb5bd";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#adb5bd";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(1), toY(1));
    ctx.stroke();
    ctx.setLineDash([]);
    if (state2.currentModel && state2.validation.isValid) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const L = state2.currentModel.evaluate(p);
        const x = toX(p);
        const y = toY(L);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (state2.modelType === "hybrid" && state2.currentModel && state2.validation.isValid) {
      const pStar = state2.splicingThreshold;
      const lStar = state2.currentModel.evaluate(pStar);
      const xStar = toX(pStar);
      const yStar = toY(lStar);
      ctx.strokeStyle = "#6c757d";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xStar, pad.top);
      ctx.lineTo(xStar, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      const s = 5.5;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#212529";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xStar, yStar - s);
      ctx.lineTo(xStar + s, yStar);
      ctx.lineTo(xStar, yStar + s);
      ctx.lineTo(xStar - s, yStar);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (state2.currentHeadcount > 0 && state2.currentHeadcount < 1 && state2.currentModel && state2.validation.isValid) {
      const hP = state2.currentHeadcount;
      const hL = state2.currentModel.evaluate(hP);
      const xH = toX(hP);
      const yH = toY(hL);
      ctx.strokeStyle = "#495057";
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xH, pad.top);
      ctx.lineTo(xH, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#212529";
      ctx.fillRect(xH - 3.5, yH - 3.5, 7, 7);
    }
    for (const pt of pts) {
      const x = toX(pt.populationShare);
      const y = toY(pt.incomeShare);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // demo/src/charts/derivativeChart.ts
  function renderDerivativeChart(canvas, state2) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 50 ? rect.width : 580;
    const h = rect.height > 50 ? rect.height : 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { left: 52, right: 28, top: 20, bottom: 38 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const maxY = 3.5;
    const toX = (p) => pad.left + p * plotW;
    const toY = (val) => pad.top + (1 - Math.min(val, maxY) / maxY) * plotH;
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 1;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#6c757d";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const val = i / 5;
      const x = toX(val);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), x, pad.top + plotH + 16);
    }
    const yTicks = [0, 1, 2, 3];
    for (const yt of yTicks) {
      const y = toY(yt);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(yt.toFixed(1), pad.left - 8, y + 4);
      ctx.textAlign = "center";
    }
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#212529";
    ctx.fillText("Population share (p)", pad.left + plotW / 2, h - 8);
    ctx.save();
    ctx.translate(15, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("y(p) / \u03BC", 0, 0);
    ctx.restore();
    if (state2.currentModel && state2.validation.isValid) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const steps = 180;
      for (let i = 1; i <= steps; i++) {
        const p = Math.min(0.99, i / steps);
        const deriv = state2.currentModel.derivative(p);
        const x = toX(p);
        const y = toY(deriv);
        if (i === 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const meanInc = state2.dataset.meanIncome || 1e4;
    const normThreshold = state2.povertyLine / meanInc;
    const yZ = toY(normThreshold);
    ctx.strokeStyle = "#6c757d";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pad.left, yZ);
    ctx.lineTo(pad.left + plotW, yZ);
    ctx.stroke();
    ctx.setLineDash([]);
    if (state2.currentHeadcount > 0 && state2.currentHeadcount < 1 && state2.validation.isValid) {
      const xH = toX(state2.currentHeadcount);
      ctx.strokeStyle = "#adb5bd";
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xH, yZ);
      ctx.lineTo(xH, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(xH - 4, yZ - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.fillRect(xH - 2, yZ - 2, 4, 4);
      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace";
      ctx.fillStyle = "#212529";
      ctx.textAlign = "left";
      const tagText = `H = ${(state2.currentHeadcount * 100).toFixed(1)}%`;
      ctx.fillText(tagText, xH + 8, Math.max(pad.top + 14, yZ - 6));
    }
  }

  // demo/src/tableEditor.ts
  function renderTable(tableBody2, points, validation, onUpdate, onDelete) {
    if (!tableBody2) return;
    tableBody2.innerHTML = "";
    const errorsByRow = /* @__PURE__ */ new Map();
    for (const err of validation.errors) {
      if (!errorsByRow.has(err.rowIndex)) {
        errorsByRow.set(err.rowIndex, /* @__PURE__ */ new Set());
      }
      errorsByRow.get(err.rowIndex).add(err.field);
    }
    points.forEach((pt, index) => {
      const isFirst = index === 0;
      const isLast = index === points.length - 1;
      const rowErrors = errorsByRow.get(index);
      const hasPError = rowErrors ? rowErrors.has("p") || rowErrors.has("all") : false;
      const hasLError = rowErrors ? rowErrors.has("L") || rowErrors.has("all") : false;
      const tr = document.createElement("tr");
      if (rowErrors && rowErrors.size > 0) {
        tr.className = "table-row-invalid";
      }
      const pClass = `form-control form-control-sm font-monospace ${hasPError ? "is-invalid" : ""}`;
      const lClass = `form-control form-control-sm font-monospace ${hasLError ? "is-invalid" : ""}`;
      const lockBadge = isFirst ? `<span class="badge badge-secondary" title="Anchor (0, 0)">0.000</span>` : isLast ? `<span class="badge badge-secondary" title="Anchor (1, 1)">1.000</span>` : "";
      tr.innerHTML = `
      <td class="text-muted text-center py-1" style="width: 32px; font-size: 0.75rem;">${index + 1}</td>
      <td class="py-1">
        ${isFirst || isLast ? lockBadge : `<input type="number" step="0.01" min="0" max="1" class="${pClass}" value="${pt.populationShare.toFixed(3)}" data-idx="${index}" data-field="p">`}
      </td>
      <td class="py-1">
        ${isFirst || isLast ? lockBadge : `<input type="number" step="0.001" min="0" max="1" class="${lClass}" value="${pt.incomeShare.toFixed(4)}" data-idx="${index}" data-field="L">`}
      </td>
      <td class="text-center py-1" style="width: 38px;">
        ${isFirst || isLast ? `<span class="text-muted" style="font-size: 0.8rem;">\u{1F512}</span>` : `<button class="btn btn-sm btn-outline-secondary py-0 px-1" data-delete="${index}" title="Remove knot" style="line-height: 1.2;">&times;</button>`}
      </td>
    `;
      tableBody2.appendChild(tr);
    });
    tableBody2.oninput = (e) => {
      const target = e.target;
      const idx = parseInt(target.getAttribute("data-idx") || "-1", 10);
      const field = target.getAttribute("data-field");
      const val = parseFloat(target.value);
      if (!isNaN(val) && idx >= 0) {
        onUpdate(idx, field, val);
      }
    };
    tableBody2.onclick = (e) => {
      const target = e.target;
      const delIdx = target.getAttribute("data-delete");
      if (delIdx !== null) {
        const idx = parseInt(delIdx, 10);
        onDelete(idx);
      }
    };
  }

  // demo/src/fileIngestion.ts
  function parseRawContent(text, fileName, meanIncome) {
    try {
      const trimmed = text.trim();
      if (!trimmed) {
        return { success: false, errorMessage: "Input content is empty." };
      }
      let parsed;
      if (fileName.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
        parsed = DatasetParser.parseJson(trimmed, { name: fileName });
      } else {
        parsed = DatasetParser.parseDelimited(trimmed, { name: fileName });
      }
      const dataset = DatasetParser.toQuantileDataset(parsed, meanIncome || 1e4);
      return { success: true, dataset };
    } catch (err) {
      return {
        success: false,
        errorMessage: err.message || "Failed to parse quantile data."
      };
    }
  }
  function setupFileInput(fileInput2, getMeanIncome, onResult) {
    if (!fileInput2) return;
    fileInput2.addEventListener("change", (e) => {
      const target = e.target;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result;
          const res = parseRawContent(text, file.name, getMeanIncome());
          onResult(res);
          target.value = "";
        };
        reader.onerror = () => {
          onResult({
            success: false,
            errorMessage: `Failed to read file ${file.name}.`
          });
        };
        reader.readAsText(file);
      }
    });
  }

  // demo/src/validation.ts
  function validateQuantilePoints(points) {
    const errors = [];
    const warnings = [];
    if (points.length < 3) {
      errors.push({
        rowIndex: 0,
        field: "all",
        message: `At least 3 quantile knots are required for spline interpolation. Currently provided: ${points.length}.`
      });
      return { isValid: false, errors, warnings };
    }
    if (Math.abs(points[0].populationShare) > 1e-6 || Math.abs(points[0].incomeShare) > 1e-6) {
      errors.push({
        rowIndex: 0,
        field: "all",
        message: "The initial knot must be anchored exactly at (p=0.00, L=0.00)."
      });
    }
    const lastIdx = points.length - 1;
    if (Math.abs(points[lastIdx].populationShare - 1) > 1e-6 || Math.abs(points[lastIdx].incomeShare - 1) > 1e-6) {
      errors.push({
        rowIndex: lastIdx,
        field: "all",
        message: "The terminal knot must be anchored exactly at (p=1.00, L=1.00)."
      });
    }
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
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
      if (pt.incomeShare > pt.populationShare + 1e-6) {
        errors.push({
          rowIndex: i,
          field: "L",
          message: `Knot ${i + 1}: Income share L (${pt.incomeShare.toFixed(3)}) exceeds population share p (${pt.populationShare.toFixed(3)}). This violates sub-diagonal property.`
        });
      }
      if (i > 0) {
        const prev = points[i - 1];
        if (pt.populationShare <= prev.populationShare) {
          errors.push({
            rowIndex: i,
            field: "p",
            message: `Knot ${i + 1}: Population share p (${pt.populationShare.toFixed(3)}) must be strictly greater than previous knot (${prev.populationShare.toFixed(3)}).`
          });
        } else if (pt.populationShare - prev.populationShare < 5e-3) {
          warnings.push(
            `Knot ${i + 1}: Distance to previous knot is very small (${(pt.populationShare - prev.populationShare).toFixed(4)}), which may produce steep local derivatives.`
          );
        }
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
  function validateEconomicParameters(meanIncome, povertyLine, splicePoint, points) {
    let meanIncomeError = null;
    let povertyLineError = null;
    let povertyLineWarning = null;
    let spliceError = null;
    if (isNaN(meanIncome) || !isFinite(meanIncome) || meanIncome <= 0) {
      meanIncomeError = "Mean income must be a strictly positive number.";
    }
    if (isNaN(povertyLine) || !isFinite(povertyLine) || povertyLine <= 0) {
      povertyLineError = "Poverty threshold must be a strictly positive number.";
    } else if (meanIncome > 0) {
      const ratio = povertyLine / meanIncome;
      if (ratio > 5) {
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
  function autoRepairQuantiles(points) {
    if (points.length < 2) {
      return [
        { populationShare: 0, incomeShare: 0 },
        { populationShare: 0.5, incomeShare: 0.25 },
        { populationShare: 1, incomeShare: 1 }
      ];
    }
    const interior = points.filter((pt, idx) => idx > 0 && idx < points.length - 1).map((pt) => ({
      populationShare: Math.min(
        0.99,
        Math.max(0.01, isNaN(pt.populationShare) ? 0.5 : pt.populationShare)
      ),
      incomeShare: Math.min(1, Math.max(0, isNaN(pt.incomeShare) ? 0.25 : pt.incomeShare))
    }));
    interior.sort((a, b) => a.populationShare - b.populationShare);
    const cleaned = [{ populationShare: 0, incomeShare: 0 }];
    let prevP = 0;
    let prevL = 0;
    for (const pt of interior) {
      let p = pt.populationShare;
      if (p <= prevP) {
        p = Math.min(0.98, prevP + 0.02);
      }
      const L = Math.min(p, Math.max(prevL, pt.incomeShare));
      cleaned.push({ populationShare: p, incomeShare: L });
      prevP = p;
      prevL = L;
    }
    cleaned.push({ populationShare: 1, incomeShare: 1 });
    return cleaned;
  }

  // demo/src/main.ts
  var initialPreset = loadPreset("bg_nsi_2022");
  var state = {
    dataset: {
      meanIncome: initialPreset.dataset.meanIncome,
      points: initialPreset.dataset.points.map((pt) => ({ ...pt }))
    },
    currency: initialPreset.currency,
    modelType: "hybrid",
    splicingThreshold: 0.8,
    povertyLine: initialPreset.poverty,
    currentModel: null,
    currentHeadcount: 0.329,
    currentGastwirth: {
      lowerBound: 0.3538,
      upperBound: 0.3848,
      intervalWidth: 0.031,
      estimatedGini: 0.3621,
      isCertified: true,
      maxError: 0.0155
    },
    validation: { isValid: true, errors: [], warnings: [] },
    paramValidation: {
      meanIncomeError: null,
      povertyLineError: null,
      povertyLineWarning: null,
      spliceError: null,
      isValid: true
    }
  };
  var selectPreset = document.getElementById("selectPreset");
  var selectModelType = document.getElementById("selectModelType");
  var rangeSplice = document.getElementById("rangeSplice");
  var numSplice = document.getElementById("numSplice");
  var inputMeanIncome = document.getElementById("inputMeanIncome");
  var inputPoverty = document.getElementById("inputPoverty");
  var labelCurrency = document.getElementById("labelCurrency");
  var labelPovertyCurrency = document.getElementById("labelPovertyCurrency");
  var fileInput = document.getElementById("fileInput");
  var tableBody = document.getElementById("quantilesTableBody");
  var btnAddRow = document.getElementById("btnAddRow");
  var btnAutoRepair = document.getElementById("btnAutoRepair");
  var btnTogglePaste = document.getElementById("btnTogglePaste");
  var boxPasteArea = document.getElementById("boxPasteArea");
  var txtRawInput = document.getElementById("txtRawInput");
  var btnApplyPaste = document.getElementById("btnApplyPaste");
  var alertContainer = document.getElementById("alertContainer");
  var alertContent = document.getElementById("alertContent");
  var canvasLorenz = document.getElementById("canvasLorenz");
  var canvasDerivative = document.getElementById("canvasDerivative");
  var outGini = document.getElementById("outGini");
  var outGastwirth = document.getElementById("outGastwirth");
  var outPalma = document.getElementById("outPalma");
  var outSen = document.getElementById("outSen");
  var outHeadcount = document.getElementById("outHeadcount");
  var outAlpha = document.getElementById("outAlpha");
  var badgeStatus = document.getElementById("badgeStatus");
  var modelDescription = document.getElementById("modelDescription");
  function updateModelDescription() {
    if (!modelDescription) return;
    if (state.modelType === "hybrid") {
      modelDescription.textContent = "Tail-spliced hybrid model: shape-preserving PCHIP body spliced onto an asymptotic Pareto tail with C^1 derivative continuity.";
    } else if (state.modelType === "pchip") {
      modelDescription.textContent = "Shape-preserving piecewise cubic Hermite interpolating polynomial (PCHIP) with harmonic slope weighting and iterative convexity cone projection.";
    } else {
      modelDescription.textContent = "Natural C^2 cubic spline: smooth twice-differentiable polynomial solved via Thomas algorithm. May exhibit oscillatory overshoot on coarse data.";
    }
  }
  function recompute() {
    state.validation = validateQuantilePoints(state.dataset.points);
    state.paramValidation = validateEconomicParameters(
      state.dataset.meanIncome || 1e4,
      state.povertyLine,
      state.splicingThreshold,
      state.dataset.points
    );
    updateAlerts();
    updateModelDescription();
    if (!state.validation.isValid || !state.paramValidation.isValid) {
      if (badgeStatus) {
        badgeStatus.className = "badge badge-dark border border-dark text-white";
        badgeStatus.textContent = "Validation Issue";
      }
      renderLorenzChart(canvasLorenz, state);
      renderDerivativeChart(canvasDerivative, state);
      return;
    }
    try {
      const result = evaluateInequality(state);
      state.currentModel = result.model;
      state.currentGastwirth = result.metrics.gastwirthCertificate;
      state.currentHeadcount = result.metrics.povertyHeadcount ?? 0;
      if (outGini) outGini.textContent = result.metrics.giniIndex.toFixed(4);
      if (outGastwirth) {
        outGastwirth.textContent = `[${state.currentGastwirth.lowerBound.toFixed(4)}, ${state.currentGastwirth.upperBound.toFixed(4)}]`;
      }
      if (outPalma) {
        outPalma.textContent = isFinite(result.metrics.palmaRatio) ? result.metrics.palmaRatio.toFixed(2) : "N/A";
      }
      if (outSen) {
        outSen.textContent = `${Math.round(result.metrics.senWelfareIndex).toLocaleString()} ${state.currency}`;
      }
      if (outHeadcount) {
        outHeadcount.textContent = `${(state.currentHeadcount * 100).toFixed(1)}%`;
      }
      if (outAlpha) {
        if (state.modelType === "hybrid" && state.currentModel instanceof HybridLorenzCurve) {
          outAlpha.textContent = state.currentModel.getTailAlpha().toFixed(2);
        } else {
          outAlpha.textContent = "N/A";
        }
      }
      if (badgeStatus) {
        badgeStatus.className = "badge badge-dark";
        badgeStatus.textContent = state.currentGastwirth.isCertified ? "Certified [G_L, G_U]" : "Verified";
      }
      renderLorenzChart(canvasLorenz, state);
      renderDerivativeChart(canvasDerivative, state);
    } catch (err) {
      console.error("Recompute error:", err);
      if (badgeStatus) {
        badgeStatus.className = "badge badge-secondary";
        badgeStatus.textContent = "Solver Error";
      }
    }
  }
  function updateAlerts() {
    if (!alertContainer || !alertContent) return;
    const messages = [];
    for (const err of state.validation.errors) {
      messages.push(`<strong>Knot Error:</strong> ${err.message}`);
    }
    if (state.paramValidation.meanIncomeError) {
      messages.push(`<strong>Parameter Error:</strong> ${state.paramValidation.meanIncomeError}`);
    }
    if (state.paramValidation.povertyLineError) {
      messages.push(`<strong>Parameter Error:</strong> ${state.paramValidation.povertyLineError}`);
    }
    if (state.paramValidation.spliceError) {
      messages.push(`<strong>Splicing Error:</strong> ${state.paramValidation.spliceError}`);
    }
    for (const warn of state.validation.warnings) {
      messages.push(`<strong>Warning:</strong> ${warn}`);
    }
    if (state.paramValidation.povertyLineWarning) {
      messages.push(`<strong>Notice:</strong> ${state.paramValidation.povertyLineWarning}`);
    }
    if (messages.length > 0) {
      alertContainer.style.display = "block";
      alertContent.innerHTML = messages.map((m) => `<div>${m}</div>`).join("");
    } else {
      alertContainer.style.display = "none";
      alertContent.innerHTML = "";
    }
  }
  function updateTable() {
    renderTable(
      tableBody,
      state.dataset.points,
      state.validation,
      (index, field, val) => {
        if (field === "p") state.dataset.points[index].populationShare = val;
        if (field === "L") state.dataset.points[index].incomeShare = val;
        recompute();
      },
      (index) => {
        if (index > 0 && index < state.dataset.points.length - 1) {
          state.dataset.points.splice(index, 1);
          updateTable();
          recompute();
        }
      }
    );
  }
  function syncSplicingThreshold(val) {
    const clamped = Math.max(0.6, Math.min(0.95, isNaN(val) ? 0.8 : val));
    state.splicingThreshold = clamped;
    const formatted = clamped.toFixed(2);
    if (rangeSplice) {
      rangeSplice.value = formatted;
      rangeSplice.setAttribute("value", formatted);
    }
    if (numSplice) {
      numSplice.value = formatted;
      numSplice.setAttribute("value", formatted);
    }
    recompute();
  }
  function applyPreset(key) {
    const loaded = loadPreset(key);
    state.dataset = {
      meanIncome: loaded.dataset.meanIncome,
      points: loaded.dataset.points.map((pt) => ({ ...pt }))
    };
    state.povertyLine = loaded.poverty;
    state.currency = loaded.currency;
    const meanVal = String(Math.round(state.dataset.meanIncome || 1e4));
    const povVal = String(Math.round(state.povertyLine));
    if (inputMeanIncome) {
      inputMeanIncome.value = meanVal;
      inputMeanIncome.setAttribute("value", meanVal);
    }
    if (inputPoverty) {
      inputPoverty.value = povVal;
      inputPoverty.setAttribute("value", povVal);
    }
    if (labelCurrency) labelCurrency.textContent = state.currency;
    if (labelPovertyCurrency) labelPovertyCurrency.textContent = state.currency;
    updateTable();
    recompute();
  }
  if (selectPreset) {
    const onPreset = () => applyPreset(selectPreset.value);
    selectPreset.addEventListener("change", onPreset);
    selectPreset.addEventListener("input", onPreset);
  }
  if (selectModelType) {
    selectModelType.addEventListener("change", (e) => {
      state.modelType = e.target.value;
      recompute();
    });
  }
  if (rangeSplice) {
    rangeSplice.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      syncSplicingThreshold(val);
    });
    rangeSplice.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      syncSplicingThreshold(val);
    });
  }
  if (numSplice) {
    numSplice.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) syncSplicingThreshold(val);
    });
    numSplice.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) syncSplicingThreshold(val);
    });
  }
  if (inputPoverty) {
    const onPoverty = (e) => {
      const val = parseFloat(e.target.value);
      state.povertyLine = isNaN(val) ? 0 : val;
      recompute();
    };
    inputPoverty.addEventListener("input", onPoverty);
    inputPoverty.addEventListener("change", onPoverty);
  }
  if (inputMeanIncome) {
    const onMean = (e) => {
      const val = parseFloat(e.target.value);
      state.dataset.meanIncome = isNaN(val) ? 0 : val;
      recompute();
    };
    inputMeanIncome.addEventListener("input", onMean);
    inputMeanIncome.addEventListener("change", onMean);
  }
  if (btnAddRow) {
    btnAddRow.addEventListener("click", () => {
      const pts = state.dataset.points;
      const lastSec = pts[pts.length - 2];
      const newP = lastSec ? Math.min(0.95, (lastSec.populationShare + 1) / 2) : 0.5;
      const newL = lastSec ? Math.min(0.95, (lastSec.incomeShare + 1) / 2) : 0.5;
      pts.splice(pts.length - 1, 0, { populationShare: newP, incomeShare: newL });
      pts.sort((a, b) => a.populationShare - b.populationShare);
      updateTable();
      recompute();
    });
  }
  if (btnAutoRepair) {
    btnAutoRepair.addEventListener("click", () => {
      state.dataset.points = autoRepairQuantiles(state.dataset.points);
      updateTable();
      recompute();
    });
  }
  if (btnTogglePaste && boxPasteArea) {
    btnTogglePaste.addEventListener("click", () => {
      const isHidden = boxPasteArea.style.display === "none";
      boxPasteArea.style.display = isHidden ? "block" : "none";
      btnTogglePaste.textContent = isHidden ? "Close Text Paste" : "Paste Raw Text";
    });
  }
  if (btnApplyPaste && txtRawInput) {
    btnApplyPaste.addEventListener("click", () => {
      const content = txtRawInput.value;
      const res = parseRawContent(content, "manual_entry.csv", state.dataset.meanIncome || 1e4);
      if (res.success && res.dataset) {
        state.dataset = res.dataset;
        if (boxPasteArea) boxPasteArea.style.display = "none";
        if (btnTogglePaste) btnTogglePaste.textContent = "Paste Raw Text";
        updateTable();
        recompute();
      } else {
        alert("Failed to parse content: " + (res.errorMessage || "Unknown error."));
      }
    });
  }
  setupFileInput(
    fileInput,
    () => state.dataset.meanIncome || 1e4,
    (res) => {
      if (res.success && res.dataset) {
        state.dataset = res.dataset;
        updateTable();
        recompute();
      } else {
        alert("File error: " + (res.errorMessage || "Could not read data."));
      }
    }
  );
  window.addEventListener("resize", () => {
    renderLorenzChart(canvasLorenz, state);
    renderDerivativeChart(canvasDerivative, state);
  });
  if (selectPreset && selectPreset.value) {
    applyPreset(selectPreset.value);
  } else {
    applyPreset("bg_nsi_2022");
  }
  syncSplicingThreshold(state.splicingThreshold);
  if (typeof document !== "undefined") {
    const initUI = () => {
      if (selectPreset && selectPreset.value) {
        applyPreset(selectPreset.value);
      }
      syncSplicingThreshold(state.splicingThreshold);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initUI);
    } else {
      setTimeout(initUI, 30);
    }
  }
})();
