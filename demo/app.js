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
      const stepSize = 1 / sampleCount;
      for (let i = 0; i <= sampleCount; i++) {
        const percentile = i * stepSize;
        if (this.derivative(percentile) < -tolerance) {
          return false;
        }
      }
      return true;
    }
    isConvex(sampleCount = 200, tolerance = 1e-8) {
      const stepSize = 1 / sampleCount;
      for (let i = 0; i <= sampleCount; i++) {
        const percentile = i * stepSize;
        if (this.secondDerivative(percentile) < -tolerance) {
          return false;
        }
      }
      return true;
    }
    findConvexityViolations(sampleCount = 200, tolerance = 1e-8) {
      const violations = [];
      const stepSize = 1 / sampleCount;
      for (let i = 0; i <= sampleCount; i++) {
        const percentile = i * stepSize;
        if (this.secondDerivative(percentile) < -tolerance) {
          violations.push(percentile);
        }
      }
      return violations;
    }
    clampPopulation(p) {
      if (p < 0) return 0;
      if (p > 1) return 1;
      return p;
    }
    // Binary search for the knot bracket [p_i, p_{i+1}) containing p
    findKnotInterval(p) {
      const knotCount = this.points.length;
      if (p <= this.points[0].populationShare) {
        return 0;
      }
      if (p >= this.points[knotCount - 1].populationShare) {
        return knotCount - 2;
      }
      let lowerIdx = 0;
      let upperIdx = knotCount - 2;
      while (lowerIdx < upperIdx) {
        const midIdx = Math.floor((lowerIdx + upperIdx) / 2);
        if (p < this.points[midIdx].populationShare) {
          upperIdx = midIdx - 1;
        } else if (p >= this.points[midIdx + 1].populationShare) {
          lowerIdx = midIdx + 1;
        } else {
          return midIdx;
        }
      }
      return lowerIdx;
    }
    getDataset() {
      return this.dataset;
    }
    // Ensure knots are anchored at (0,0) and (1,1) with strictly increasing p and non-decreasing L
    // TODO: Allow negative L(p) coordinates in the lower tail so we can fit net wealth datasets with household debt
    validateDataset(dataset) {
      if (!dataset.points || dataset.points.length < 2) {
        throw new Error("Quantile dataset must contain at least 2 points.");
      }
      if (dataset.meanIncome <= 0) {
        throw new Error(`Mean income must be positive, received ${dataset.meanIncome}.`);
      }
      const firstKnot = dataset.points[0];
      const lastKnot = dataset.points[dataset.points.length - 1];
      if (Math.abs(firstKnot.populationShare) > 1e-9 || Math.abs(firstKnot.incomeShare) > 1e-9) {
        throw new Error(
          `First knot must start at (0, 0), received (${firstKnot.populationShare}, ${firstKnot.incomeShare}).`
        );
      }
      if (Math.abs(lastKnot.populationShare - 1) > 1e-9 || Math.abs(lastKnot.incomeShare - 1) > 1e-9) {
        throw new Error(
          `Last knot must end at (1, 1), received (${lastKnot.populationShare}, ${lastKnot.incomeShare}).`
        );
      }
      for (let i = 1; i < dataset.points.length; i++) {
        const prevKnot = dataset.points[i - 1];
        const currKnot = dataset.points[i];
        if (currKnot.populationShare <= prevKnot.populationShare) {
          throw new Error(
            `Population shares must be strictly increasing: knot ${i} (${currKnot.populationShare}) <= knot ${i - 1} (${prevKnot.populationShare}).`
          );
        }
        if (currKnot.incomeShare < prevKnot.incomeShare) {
          throw new Error(
            `Income shares must be non-decreasing: knot ${i} (${currKnot.incomeShare}) < knot ${i - 1} (${prevKnot.incomeShare}).`
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
    // Solve mu * L'(H) = povertyLine using safeguarded Newton-Raphson with bisection fallback
    // TODO: Support Foster-Greer-Thorbecke (FGT) poverty gap (alpha=1) and severity (alpha=2) integrals
    getPovertyHeadcount(povertyLine, meanIncome, tolerance = 1e-7, maxIterations = 60) {
      if (povertyLine <= 0) {
        return 0;
      }
      const effectiveMean = meanIncome ?? this.model.getDataset().meanIncome;
      if (effectiveMean <= 0) {
        throw new Error(`Mean income must be strictly positive, received ${effectiveMean}.`);
      }
      const minMarginalIncome = effectiveMean * this.model.derivative(0);
      if (povertyLine <= minMarginalIncome) {
        return 0;
      }
      const maxMarginalIncome = effectiveMean * this.model.derivative(1);
      if (povertyLine >= maxMarginalIncome) {
        return 1;
      }
      let leftBound = 0;
      let rightBound = 1;
      let candidatePercentile = Math.max(
        1e-4,
        Math.min(
          1 - 1e-4,
          (povertyLine - minMarginalIncome) / Math.max(1e-6, maxMarginalIncome - minMarginalIncome)
        )
      );
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const currentIncome = effectiveMean * this.model.derivative(candidatePercentile);
        const residual = currentIncome - povertyLine;
        if (Math.abs(residual) <= tolerance * Math.max(1, povertyLine)) {
          return candidatePercentile;
        }
        if (residual < 0) {
          leftBound = candidatePercentile;
        } else {
          rightBound = candidatePercentile;
        }
        const bracketWidth = rightBound - leftBound;
        if (bracketWidth <= tolerance) {
          return 0.5 * (leftBound + rightBound);
        }
        const residualSlope = effectiveMean * this.model.secondDerivative(candidatePercentile);
        let stepAccepted = false;
        if (residualSlope > 1e-12) {
          const newtonStep = candidatePercentile - residual / residualSlope;
          if (newtonStep > leftBound + 1e-12 && newtonStep < rightBound - 1e-12) {
            candidatePercentile = newtonStep;
            stepAccepted = true;
          }
        }
        if (!stepAccepted) {
          candidatePercentile = 0.5 * (leftBound + rightBound);
        }
      }
      return 0.5 * (leftBound + rightBound);
    }
    // Check the estimated Gini falls inside Gastwirth's (1972) distribution-free bounds [G_L, G_U]
    // TODO: Add non-parametric bootstrap resampling to estimate confidence intervals alongside [G_L, G_U]
    certifyGastwirthBounds(estimatedGini) {
      const dataset = this.model.getDataset();
      const points = dataset.points;
      const bracketCount = points.length - 1;
      let chordArea = 0;
      const secantSlopes = [];
      for (let i = 1; i <= bracketCount; i++) {
        const stepWidth = points[i].populationShare - points[i - 1].populationShare;
        const incomeIncrement = points[i].incomeShare - points[i - 1].incomeShare;
        secantSlopes.push(incomeIncrement / stepWidth);
        chordArea += 0.5 * stepWidth * (points[i].incomeShare + points[i - 1].incomeShare);
      }
      const lowerBound = Math.max(0, 1 - 2 * chordArea);
      let maxDispersionSpread = 0;
      for (let i = 0; i < bracketCount; i++) {
        const stepWidth = points[i + 1].populationShare - points[i].populationShare;
        const prevSlope = i > 0 ? secantSlopes[i - 1] : 0;
        const nextSlope = i < bracketCount - 1 ? secantSlopes[i + 1] : secantSlopes[i] * 1.5;
        maxDispersionSpread += 0.5 * stepWidth * stepWidth * (nextSlope - prevSlope);
      }
      const upperBound = Math.min(1, lowerBound + maxDispersionSpread);
      const intervalWidth = upperBound - lowerBound;
      const giniEstimate = estimatedGini ?? this.computeGini(200).giniIndex;
      const isCertified = giniEstimate >= lowerBound - 1e-7 && giniEstimate <= upperBound + 1e-7;
      const maxError = 0.5 * intervalWidth;
      return {
        lowerBound,
        upperBound,
        intervalWidth,
        estimatedGini: giniEstimate,
        isCertified,
        maxError
      };
    }
    // Compute income shares held by standard policy brackets (top 10%/5%/1%, bottom 40%/50%, middle 40%)
    computeTopIncomeShares() {
      const shareAt40 = this.model.evaluate(0.4);
      const shareAt50 = this.model.evaluate(0.5);
      const shareAt90 = this.model.evaluate(0.9);
      const shareAt95 = this.model.evaluate(0.95);
      const shareAt99 = this.model.evaluate(0.99);
      const shareAt999 = this.model.evaluate(0.999);
      const shareAt9999 = this.model.evaluate(0.9999);
      return {
        top10PercentShare: Math.max(0, Math.min(1, 1 - shareAt90)),
        top5PercentShare: Math.max(0, Math.min(1, 1 - shareAt95)),
        top1PercentShare: Math.max(0, Math.min(1, 1 - shareAt99)),
        top01PercentShare: Math.max(0, Math.min(1, 1 - shareAt999)),
        top001PercentShare: Math.max(0, Math.min(1, 1 - shareAt9999)),
        bottom40PercentShare: Math.max(0, Math.min(1, shareAt40)),
        bottom50PercentShare: Math.max(0, Math.min(1, shareAt50)),
        middle40PercentShare: Math.max(0, Math.min(1, shareAt90 - shareAt50))
      };
    }
    // Compute Kakwani poverty headcount elasticities with respect to poverty line z and mean income mu
    computePovertyElasticities(povertyLine, meanIncome) {
      const effectiveMean = meanIncome ?? this.model.getDataset().meanIncome;
      if (effectiveMean <= 0) {
        throw new Error(`Mean income must be positive, received ${effectiveMean}.`);
      }
      if (povertyLine <= 0) {
        return {
          povertyHeadcount: 0,
          povertyLine,
          meanIncome: effectiveMean,
          marginalIncome: 0,
          incomeDensity: 0,
          dH_dz: 0,
          dH_dmu: 0,
          elasticityZ: 0,
          elasticityMu: 0
        };
      }
      const headcount = this.getPovertyHeadcount(povertyLine, effectiveMean);
      const firstDerivative = this.model.derivative(headcount);
      const secondDerivative = this.model.secondDerivative(headcount);
      const marginalIncome = effectiveMean * firstDerivative;
      const incomeDensity = effectiveMean * secondDerivative;
      let dH_dz = 0;
      let dH_dmu = 0;
      let elasticityZ = 0;
      let elasticityMu = 0;
      if (headcount > 1e-6 && headcount < 1 - 1e-6 && incomeDensity > 1e-12) {
        dH_dz = 1 / incomeDensity;
        dH_dmu = -povertyLine / (effectiveMean * incomeDensity);
        elasticityZ = povertyLine / headcount * dH_dz;
        elasticityMu = effectiveMean / headcount * dH_dmu;
      }
      return {
        povertyHeadcount: headcount,
        povertyLine,
        meanIncome: effectiveMean,
        marginalIncome,
        incomeDensity,
        dH_dz,
        dH_dmu,
        elasticityZ,
        elasticityMu
      };
    }
    // Evaluate complete inequality metrics including Gini, Sen index, Palma ratio, and bounds
    computeComprehensiveMetrics(stepCount = 200, povertyLine) {
      const giniResult = this.computeGini(stepCount);
      const senWelfare = this.computeSenWelfare(stepCount);
      const palmaRatio = this.computePalmaRatio();
      const gastwirthCertificate = this.certifyGastwirthBounds(giniResult.giniIndex);
      const topIncomeShares = this.computeTopIncomeShares();
      let povertyHeadcount = void 0;
      let povertyElasticities = void 0;
      if (povertyLine !== void 0) {
        povertyHeadcount = this.getPovertyHeadcount(povertyLine);
        povertyElasticities = this.computePovertyElasticities(povertyLine);
      }
      return {
        giniIndex: giniResult.giniIndex,
        senWelfareIndex: senWelfare.senWelfareIndex,
        palmaRatio,
        areaUnderCurve: giniResult.areaUnderCurve,
        meanIncome: this.model.getDataset().meanIncome,
        povertyHeadcount,
        povertyLine,
        gastwirthCertificate,
        topIncomeShares,
        povertyElasticities
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
      const nonEmptyLines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("//"));
      if (nonEmptyLines.length < 2) {
        throw new Error("Dataset must contain at least two data points.");
      }
      const firstLine = nonEmptyLines[0];
      const delimiter = this.detectDelimiter(firstLine);
      let startRowIndex = 0;
      const headerTokens = firstLine.split(delimiter).map((token) => token.trim().toLowerCase());
      const hasHeaderRow = headerTokens.some((token) => isNaN(parseFloat(token.replace("%", ""))));
      if (hasHeaderRow) {
        startRowIndex = 1;
      }
      const rawPopValues = [];
      const rawIncomeValues = [];
      for (let i = startRowIndex; i < nonEmptyLines.length; i++) {
        const line = nonEmptyLines[i];
        const tokens = line.split(delimiter).map((token) => token.trim());
        if (tokens.length < 2) continue;
        const popValue = this.parseNumericToken(tokens[0]);
        const incomeValue = this.parseNumericToken(tokens[1]);
        if (isNaN(popValue) || isNaN(incomeValue)) {
          throw new Error(`Invalid numerical value on line ${i + 1}: "${line}"`);
        }
        rawPopValues.push(popValue);
        rawIncomeValues.push(incomeValue);
      }
      if (rawPopValues.length < 2) {
        throw new Error("Insufficient valid data points parsed from input table.");
      }
      const normalizedPop = this.normalizeProportions(rawPopValues);
      let normalizedIncome = this.normalizeProportions(rawIncomeValues);
      const isCumulative = options.assumeCumulative ?? this.detectIfCumulative(normalizedIncome);
      if (!isCumulative) {
        normalizedIncome = this.cumulativeSum(normalizedIncome);
      }
      const parsedData = {
        p: normalizedPop,
        L: normalizedIncome,
        name: options.name ?? "Custom Ingested Dataset",
        meanIncome: options.meanIncome
      };
      return this.validateQuantiles(parsedData);
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
          const pVal = Number(item.p ?? item.population);
          const lVal = Number(item.L ?? item.income);
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
        const pArr = obj.p ?? obj.population;
        const lArr = obj.L ?? obj.income;
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
    integrate(model, lowerLimit = 0, upperLimit = 1, stepCount = 100) {
      if (stepCount < 2) {
        throw new Error(`stepCount must be at least 2, received ${stepCount}.`);
      }
      if (lowerLimit >= upperLimit) {
        throw new Error(
          `Lower bound a (${lowerLimit}) must be strictly less than upper bound b (${upperLimit}).`
        );
      }
      const subintervalCount = stepCount % 2 === 0 ? stepCount : stepCount + 1;
      const stepWidth = (upperLimit - lowerLimit) / subintervalCount;
      let weightedSum = model.evaluate(lowerLimit) + model.evaluate(upperLimit);
      for (let i = 1; i < subintervalCount; i++) {
        const percentile = lowerLimit + i * stepWidth;
        const curveValue = model.evaluate(percentile);
        weightedSum += (i % 2 === 1 ? 4 : 2) * curveValue;
      }
      const areaUnderCurve = weightedSum * stepWidth / 3;
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
      const knotCount = this.points.length;
      const intervalWidths = new Float64Array(knotCount - 1);
      const secantSlopes = new Float64Array(knotCount - 1);
      for (let i = 0; i < knotCount - 1; i++) {
        intervalWidths[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
        secantSlopes[i] = (this.points[i + 1].incomeShare - this.points[i].incomeShare) / intervalWidths[i];
      }
      const slopes = new Float64Array(knotCount);
      for (let i = 1; i < knotCount - 1; i++) {
        if (secantSlopes[i - 1] * secantSlopes[i] <= 0) {
          slopes[i] = 0;
        } else {
          slopes[i] = 2 * secantSlopes[i - 1] * secantSlopes[i] / (secantSlopes[i - 1] + secantSlopes[i]);
        }
      }
      slopes[0] = Math.max(0, 1.5 * secantSlopes[0] - 0.5 * slopes[1]);
      slopes[knotCount - 1] = Math.max(
        0,
        1.5 * secantSlopes[knotCount - 2] - 0.5 * slopes[knotCount - 2]
      );
      let repaired = false;
      if (shouldEnforceConvexity) {
        repaired = this.repairConvexity(slopes, secantSlopes, knotCount);
      }
      this.knotSlopes = Array.from(slopes);
      this.wasConvexityRepaired = repaired;
      this.aCoeffs = new Array(knotCount - 1);
      this.bCoeffs = new Array(knotCount - 1);
      this.cCoeffs = new Array(knotCount - 1);
      this.dCoeffs = new Array(knotCount - 1);
      for (let i = 0; i < knotCount - 1; i++) {
        this.aCoeffs[i] = this.points[i].incomeShare;
        this.bCoeffs[i] = slopes[i];
        this.cCoeffs[i] = (3 * secantSlopes[i] - 2 * slopes[i] - slopes[i + 1]) / intervalWidths[i];
        this.dCoeffs[i] = (slopes[i] + slopes[i + 1] - 2 * secantSlopes[i]) / (intervalWidths[i] * intervalWidths[i]);
      }
    }
    repairConvexity(slopes, secantSlopes, knotCount) {
      let anyRepaired = false;
      const maxPasses = 5;
      for (let pass = 0; pass < maxPasses; pass++) {
        let passRepaired = false;
        for (let i = 0; i < knotCount - 1; i++) {
          const secant = secantSlopes[i];
          if (2 * slopes[i] + slopes[i + 1] > 3 * secant && slopes[i] > 0) {
            slopes[i] = Math.max(0, (3 * secant - slopes[i + 1]) / 2);
            passRepaired = true;
          }
          if (slopes[i] + 2 * slopes[i + 1] < 3 * secant) {
            slopes[i + 1] = (3 * secant - slopes[i]) / 2;
            passRepaired = true;
          }
          if (slopes[i] > secant) {
            slopes[i] = secant;
            passRepaired = true;
          }
          if (slopes[i + 1] < secant) {
            slopes[i + 1] = secant;
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
      const bracketIdx = this.findKnotInterval(clampedP);
      const localOffset = clampedP - this.points[bracketIdx].populationShare;
      return this.aCoeffs[bracketIdx] + this.bCoeffs[bracketIdx] * localOffset + this.cCoeffs[bracketIdx] * localOffset * localOffset + this.dCoeffs[bracketIdx] * localOffset * localOffset * localOffset;
    }
    derivative(p) {
      const clampedP = this.clampPopulation(p);
      const bracketIdx = this.findKnotInterval(clampedP);
      const localOffset = clampedP - this.points[bracketIdx].populationShare;
      return this.bCoeffs[bracketIdx] + 2 * this.cCoeffs[bracketIdx] * localOffset + 3 * this.dCoeffs[bracketIdx] * localOffset * localOffset;
    }
    secondDerivative(p) {
      const clampedP = this.clampPopulation(p);
      const bracketIdx = this.findKnotInterval(clampedP);
      const localOffset = clampedP - this.points[bracketIdx].populationShare;
      return 2 * this.cCoeffs[bracketIdx] + 6 * this.dCoeffs[bracketIdx] * localOffset;
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
      const systemSize = diag.length;
      if (rhs.length !== systemSize) {
        throw new Error(`RHS length (${rhs.length}) must match diagonal length (${systemSize}).`);
      }
      if (systemSize === 0) {
        return [];
      }
      if (systemSize === 1) {
        if (Math.abs(diag[0]) < 1e-15) {
          throw new Error("Cannot solve 1x1 system with zero diagonal element.");
        }
        return [rhs[0] / diag[0]];
      }
      if (lower.length !== systemSize - 1) {
        throw new Error(`Lower diagonal length (${lower.length}) must be n - 1 (${systemSize - 1}).`);
      }
      if (upper.length !== systemSize - 1) {
        throw new Error(`Upper diagonal length (${upper.length}) must be n - 1 (${systemSize - 1}).`);
      }
      const modifiedSuperDiag = new Float64Array(systemSize - 1);
      const modifiedRhs = new Float64Array(systemSize);
      if (Math.abs(diag[0]) < 1e-15) {
        throw new Error("Zero pivot encountered at row 0.");
      }
      modifiedSuperDiag[0] = upper[0] / diag[0];
      modifiedRhs[0] = rhs[0] / diag[0];
      for (let i = 1; i < systemSize; i++) {
        const pivotDenom = diag[i] - lower[i - 1] * modifiedSuperDiag[i - 1];
        if (Math.abs(pivotDenom) < 1e-15) {
          throw new Error(`Zero pivot encountered at row ${i}.`);
        }
        if (i < systemSize - 1) {
          modifiedSuperDiag[i] = upper[i] / pivotDenom;
        }
        modifiedRhs[i] = (rhs[i] - lower[i - 1] * modifiedRhs[i - 1]) / pivotDenom;
      }
      const solution = new Array(systemSize);
      solution[systemSize - 1] = modifiedRhs[systemSize - 1];
      for (let i = systemSize - 2; i >= 0; i--) {
        solution[i] = modifiedRhs[i] - modifiedSuperDiag[i] * solution[i + 1];
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
      const knotCount = this.points.length;
      const intervalWidths = new Float64Array(knotCount - 1);
      const secantSlopes = new Float64Array(knotCount - 1);
      for (let i = 0; i < knotCount - 1; i++) {
        intervalWidths[i] = this.points[i + 1].populationShare - this.points[i].populationShare;
        secantSlopes[i] = (this.points[i + 1].incomeShare - this.points[i].incomeShare) / intervalWidths[i];
      }
      const solver = new TridiagonalSolver();
      const curvatures = new Float64Array(knotCount);
      if (this.boundaryType === "natural") {
        curvatures[0] = 0;
        curvatures[knotCount - 1] = 0;
        if (knotCount > 2) {
          const interiorCount = knotCount - 2;
          const subDiagonal = new Float64Array(interiorCount - 1);
          const mainDiagonal = new Float64Array(interiorCount);
          const superDiagonal = new Float64Array(interiorCount - 1);
          const rhsVector = new Float64Array(interiorCount);
          for (let i = 0; i < interiorCount; i++) {
            const knotIdx = i + 1;
            mainDiagonal[i] = 2 * (intervalWidths[knotIdx - 1] + intervalWidths[knotIdx]);
            rhsVector[i] = 6 * (secantSlopes[knotIdx] - secantSlopes[knotIdx - 1]);
            if (i > 0) {
              subDiagonal[i - 1] = intervalWidths[knotIdx - 1];
            }
            if (i < interiorCount - 1) {
              superDiagonal[i] = intervalWidths[knotIdx];
            }
          }
          const interiorCurvatures = solver.solveVectors(
            Array.from(subDiagonal),
            Array.from(mainDiagonal),
            Array.from(superDiagonal),
            Array.from(rhsVector)
          );
          for (let i = 0; i < interiorCount; i++) {
            curvatures[i + 1] = interiorCurvatures[i];
          }
        }
      } else {
        const startSlope = options.clampStartSlope ?? 0;
        const endSlope = options.clampEndSlope ?? secantSlopes[knotCount - 2];
        const subDiagonal = new Float64Array(knotCount - 1);
        const mainDiagonal = new Float64Array(knotCount);
        const superDiagonal = new Float64Array(knotCount - 1);
        const rhsVector = new Float64Array(knotCount);
        mainDiagonal[0] = 2 * intervalWidths[0];
        superDiagonal[0] = intervalWidths[0];
        rhsVector[0] = 6 * (secantSlopes[0] - startSlope);
        for (let i = 1; i < knotCount - 1; i++) {
          subDiagonal[i - 1] = intervalWidths[i - 1];
          mainDiagonal[i] = 2 * (intervalWidths[i - 1] + intervalWidths[i]);
          superDiagonal[i] = intervalWidths[i];
          rhsVector[i] = 6 * (secantSlopes[i] - secantSlopes[i - 1]);
        }
        subDiagonal[knotCount - 2] = intervalWidths[knotCount - 2];
        mainDiagonal[knotCount - 1] = 2 * intervalWidths[knotCount - 2];
        rhsVector[knotCount - 1] = 6 * (endSlope - secantSlopes[knotCount - 2]);
        const solvedCurvatures = solver.solveVectors(
          Array.from(subDiagonal),
          Array.from(mainDiagonal),
          Array.from(superDiagonal),
          Array.from(rhsVector)
        );
        for (let i = 0; i < knotCount; i++) {
          curvatures[i] = solvedCurvatures[i];
        }
      }
      this.secondDerivatives = Array.from(curvatures);
      this.aCoeffs = new Array(knotCount - 1);
      this.bCoeffs = new Array(knotCount - 1);
      this.cCoeffs = new Array(knotCount - 1);
      this.dCoeffs = new Array(knotCount - 1);
      for (let i = 0; i < knotCount - 1; i++) {
        this.aCoeffs[i] = this.points[i].incomeShare;
        this.cCoeffs[i] = curvatures[i] / 2;
        this.dCoeffs[i] = (curvatures[i + 1] - curvatures[i]) / (6 * intervalWidths[i]);
        this.bCoeffs[i] = secantSlopes[i] - (2 * curvatures[i] + curvatures[i + 1]) * intervalWidths[i] / 6;
      }
    }
    evaluate(p) {
      const clampedP = this.clampPopulation(p);
      const bracketIdx = this.findKnotInterval(clampedP);
      const localOffset = clampedP - this.points[bracketIdx].populationShare;
      return this.aCoeffs[bracketIdx] + this.bCoeffs[bracketIdx] * localOffset + this.cCoeffs[bracketIdx] * localOffset * localOffset + this.dCoeffs[bracketIdx] * localOffset * localOffset * localOffset;
    }
    derivative(p) {
      const clampedP = this.clampPopulation(p);
      const bracketIdx = this.findKnotInterval(clampedP);
      const localOffset = clampedP - this.points[bracketIdx].populationShare;
      return this.bCoeffs[bracketIdx] + 2 * this.cCoeffs[bracketIdx] * localOffset + 3 * this.dCoeffs[bracketIdx] * localOffset * localOffset;
    }
    secondDerivative(p) {
      const clampedP = this.clampPopulation(p);
      const bracketIdx = this.findKnotInterval(clampedP);
      const localOffset = clampedP - this.points[bracketIdx].populationShare;
      return 2 * this.cCoeffs[bracketIdx] + 6 * this.dCoeffs[bracketIdx] * localOffset;
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
    if (z <= 0) {
      throw new Error(`Gamma function undefined for non-positive numbers (received ${z}).`);
    }
    const p = [
      0.9999999999998099,
      676.5203681218851,
      -1259.139216722403,
      771.3234287776531,
      -176.6150291621406,
      12.50734327868691,
      -0.138571095836526,
      9984369578019572e-21,
      1505632735149312e-22
    ];
    const g = 7;
    if (z < 0.5) {
      return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    const x = z - 1;
    let aSum = p[0];
    for (let i = 1; i < p.length; i++) {
      aSum += p[i] / (x + i);
    }
    const t = x + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(aSum);
  }
  function clampTinyDenominator(value, minMagnitude = 1e-30) {
    return Math.abs(value) < minMagnitude ? minMagnitude : value;
  }
  function betacf(a, b, x) {
    const maxIterations = 200;
    const convergenceTol = 1e-12;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let cFactor = 1;
    let dFactor = 1 / clampTinyDenominator(1 - qab * x / qap);
    let fractionValue = dFactor;
    for (let m = 1; m <= maxIterations; m++) {
      const twoM = 2 * m;
      const evenCoeff = m * (b - m) * x / ((qam + twoM) * (a + twoM));
      dFactor = 1 / clampTinyDenominator(1 + evenCoeff * dFactor);
      cFactor = clampTinyDenominator(1 + evenCoeff / cFactor);
      fractionValue *= dFactor * cFactor;
      const oddCoeff = -((a + m) * (qab + m) * x) / ((a + twoM) * (qap + twoM));
      dFactor = 1 / clampTinyDenominator(1 + oddCoeff * dFactor);
      cFactor = clampTinyDenominator(1 + oddCoeff / cFactor);
      const stepDelta = dFactor * cFactor;
      fractionValue *= stepDelta;
      if (Math.abs(stepDelta - 1) < convergenceTol) {
        break;
      }
    }
    return fractionValue;
  }
  function regularizedIncompleteBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x > (a + 1) / (a + b + 2)) {
      return 1 - regularizedIncompleteBeta(b, a, 1 - x);
    }
    const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
    return Math.min(1, Math.max(0, front * betacf(a, b, x)));
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
    sampleQuantiles(bracketCount, meanIncome = 5e4) {
      if (bracketCount < 2) {
        throw new Error(`Subinterval count k must be at least 2, received ${bracketCount}.`);
      }
      const points = [{ populationShare: 0, incomeShare: 0 }];
      for (let i = 1; i < bracketCount; i++) {
        const percentile = i / bracketCount;
        points.push({ populationShare: percentile, incomeShare: this.evaluateLorenz(percentile) });
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
    sampleQuantiles(bracketCount, meanIncome = 5e4) {
      if (bracketCount < 2) {
        throw new Error(`Subinterval count k must be at least 2, received ${bracketCount}.`);
      }
      const points = [{ populationShare: 0, incomeShare: 0 }];
      for (let i = 1; i < bracketCount; i++) {
        const percentile = i / bracketCount;
        points.push({ populationShare: percentile, incomeShare: this.evaluateLorenz(percentile) });
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
      let currentX = initialGuess;
      for (let iter = 1; iter <= maxIterations; iter++) {
        const fVal = fn(currentX);
        const derivativeVal = dfn(currentX);
        if (Math.abs(fVal) <= tolerance) {
          return {
            root: currentX,
            populationPercentile: currentX,
            iterations: iter,
            converged: true,
            finalError: Math.abs(fVal)
          };
        }
        if (Math.abs(derivativeVal) < 1e-15) {
          if (Number.isFinite(lowerBound) && Number.isFinite(upperBound)) {
            currentX = (lowerBound + upperBound) / 2;
            continue;
          }
          throw new Error(`Derivative too close to zero at x = ${currentX} (df = ${derivativeVal}).`);
        }
        const newtonStep = fVal / derivativeVal;
        let nextX = currentX - newtonStep;
        if (nextX < lowerBound || nextX > upperBound) {
          nextX = Math.max(lowerBound, Math.min(upperBound, currentX - 0.5 * newtonStep));
        }
        if (Math.abs(nextX - currentX) <= tolerance && Math.abs(fn(nextX)) <= tolerance) {
          return {
            root: nextX,
            populationPercentile: nextX,
            iterations: iter,
            converged: true,
            finalError: Math.abs(fn(nextX))
          };
        }
        currentX = nextX;
      }
      return {
        root: currentX,
        populationPercentile: currentX,
        iterations: maxIterations,
        converged: false,
        finalError: Math.abs(fn(currentX))
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

  // src/solvers/BisectionSolver.ts
  var BisectionSolver = class {
    name = "Bisection Method";
    solve(fn, lowerBound, upperBound, tolerance = 1e-8, maxIterations = 100) {
      let leftBound = lowerBound;
      let rightBound = upperBound;
      let fLeft = fn(leftBound);
      const fRight = fn(rightBound);
      if (Math.abs(fLeft) <= tolerance) {
        return {
          root: leftBound,
          populationPercentile: leftBound,
          iterations: 0,
          converged: true,
          finalError: Math.abs(fLeft)
        };
      }
      if (Math.abs(fRight) <= tolerance) {
        return {
          root: rightBound,
          populationPercentile: rightBound,
          iterations: 0,
          converged: true,
          finalError: Math.abs(fRight)
        };
      }
      if (fLeft * fRight > 0) {
        throw new Error(
          `Root is not bracketed: f(${leftBound})=${fLeft} and f(${rightBound})=${fRight} have the same sign.`
        );
      }
      let midpoint = leftBound;
      let fMid = fLeft;
      for (let iter = 1; iter <= maxIterations; iter++) {
        midpoint = leftBound + (rightBound - leftBound) / 2;
        fMid = fn(midpoint);
        const halfInterval = (rightBound - leftBound) / 2;
        if (Math.abs(fMid) <= tolerance || halfInterval <= tolerance) {
          return {
            root: midpoint,
            populationPercentile: midpoint,
            iterations: iter,
            converged: true,
            finalError: Math.abs(fMid)
          };
        }
        if (fLeft * fMid < 0) {
          rightBound = midpoint;
        } else {
          leftBound = midpoint;
          fLeft = fMid;
        }
      }
      return {
        root: midpoint,
        populationPercentile: midpoint,
        iterations: maxIterations,
        converged: false,
        finalError: Math.abs(fMid)
      };
    }
    findRoot(model, targetIncomeShare, lowerBound = 0, upperBound = 1, tolerance = 1e-8, maxIterations = 100) {
      return this.solve(
        (p) => model.evaluate(p) - targetIncomeShare,
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
      const tailRatio = (1 - clampedP) / (1 - this.splicePoint);
      const tailExponent = 1 - 1 / this.tailAlpha;
      return 1 - (1 - this.lSplice) * Math.pow(tailRatio, tailExponent);
    }
    derivative(p) {
      const clampedP = this.clampPopulation(p);
      if (clampedP <= 0) {
        return this.bodyModel.derivative(0);
      }
      if (clampedP <= this.splicePoint) {
        return this.bodyModel.derivative(clampedP);
      }
      const safeRemainingPop = Math.max(1e-12, 1 - clampedP);
      const tailRatio = safeRemainingPop / (1 - this.splicePoint);
      const scaleFactor = (1 - this.lSplice) / (1 - this.splicePoint) * (1 - 1 / this.tailAlpha);
      return scaleFactor * Math.pow(tailRatio, -1 / this.tailAlpha);
    }
    secondDerivative(p) {
      const clampedP = this.clampPopulation(p);
      if (clampedP <= this.splicePoint) {
        return this.bodyModel.secondDerivative(clampedP);
      }
      const tailWidthSquared = Math.pow(1 - this.splicePoint, 2);
      const scaleFactor = (1 - this.lSplice) / tailWidthSquared * ((this.tailAlpha - 1) / (this.tailAlpha * this.tailAlpha));
      const safeRemainingPop = Math.max(1e-12, 1 - clampedP);
      const tailRatio = safeRemainingPop / (1 - this.splicePoint);
      return scaleFactor * Math.pow(tailRatio, -(this.tailAlpha + 1) / this.tailAlpha);
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
      const remainingPop = 1 - this.splicePoint;
      const remainingIncome = 1 - this.lSplice;
      const paretoAreaFactor = this.tailAlpha * remainingIncome / (2 * this.tailAlpha - 1);
      return remainingPop * (1 - paretoAreaFactor);
    }
    analyticalTotalArea(bodySubintervals = 200) {
      const subintervalCount = bodySubintervals % 2 === 0 ? bodySubintervals : bodySubintervals + 1;
      const stepWidth = this.splicePoint / subintervalCount;
      let bodySum = this.bodyModel.evaluate(0) + this.bodyModel.evaluate(this.splicePoint);
      for (let i = 1; i < subintervalCount; i++) {
        const percentile = i * stepWidth;
        bodySum += (i % 2 === 1 ? 4 : 2) * this.bodyModel.evaluate(percentile);
      }
      const bodyArea = bodySum * stepWidth / 3;
      return bodyArea + this.analyticalTailArea();
    }
    analyticalGini(bodySubintervals = 200) {
      const totalArea = this.analyticalTotalArea(bodySubintervals);
      return 1 - 2 * totalArea;
    }
    selectDefaultSplicePoint() {
      const knotCount = this.points.length;
      if (knotCount >= 4) {
        return this.points[knotCount - 2].populationShare;
      }
      return 0.8;
    }
    // Solve (1 - L*) / (1 - p*) * (1 - 1/alpha) = L'(p*) for alpha, clamping if L'(p*) >= secant slope
    computeAnalyticalAlpha(pStar, lStar, dStar) {
      const remainingPop = 1 - pStar;
      const remainingIncome = 1 - lStar;
      if (remainingIncome <= 0) {
        return 2;
      }
      const tailSecantSlope = remainingIncome / remainingPop;
      const alphaDenominator = remainingIncome - remainingPop * dStar;
      if (alphaDenominator <= 1e-7 || dStar >= tailSecantSlope) {
        const clampedDerivative = 0.92 * tailSecantSlope;
        const safeDenominator = remainingIncome - remainingPop * clampedDerivative;
        return Math.max(1.05, remainingIncome / safeDenominator);
      }
      const calibratedAlpha = remainingIncome / alphaDenominator;
      return Math.max(1.05, calibratedAlpha);
    }
  };

  // src/diagnostics/SensitivityAnalyzer.ts
  var WID_BENCHMARKS = {
    bulgaria: {
      datasetName: "Bulgarian NSI (2022 HBS Deciles)",
      officialGini: 0.384,
      widTop10: 0.342,
      widTop1: 0.128,
      widTop01: 0.042
    },
    eurostat: {
      datasetName: "Eurostat EU-27 (2022 SILC)",
      officialGini: 0.296,
      widTop10: 0.354,
      widTop1: 0.114,
      widTop01: 0.035
    },
    us_census: {
      datasetName: "US Census Bureau CPS (2022 ASEC)",
      officialGini: 0.488,
      widTop10: 0.458,
      widTop1: 0.191,
      widTop01: 0.075
    }
  };
  var SensitivityAnalyzer = class {
    static integrator = new SimpsonsIntegrator();
    static rootFinder = new BisectionSolver();
    // Scans Pareto splicing knot p* across [startP, endP] and records Gini, alpha, and curvature jump
    static sweepParetoSplice(dataset, startP = 0.6, endP = 0.95, stepSize = 0.05, bodyModelType = "pchip") {
      const records = [];
      const baseSpline = bodyModelType === "cubicspline" ? new CubicSplineLorenzCurve(dataset) : new PchipLorenzCurve(dataset);
      const stepCount = Math.max(1, Math.round((endP - startP) / stepSize));
      for (let i = 0; i <= stepCount; i++) {
        const pStar = Math.min(endP, Number((startP + i * stepSize).toFixed(4)));
        try {
          const hybrid = new HybridLorenzCurve(dataset, {
            bodyModel: baseSpline,
            splicePoint: pStar
          });
          const engine = new InequalityEngine(hybrid, this.integrator, this.rootFinder);
          const giniResult = engine.computeGini(200);
          const certificate = engine.certifyGastwirthBounds(giniResult.giniIndex);
          const tailAlpha = hybrid.getTailAlpha();
          const top1PercentShare = Math.max(0, Math.min(1, 1 - hybrid.evaluate(0.99)));
          const top01PercentShare = Math.max(0, Math.min(1, 1 - hybrid.evaluate(0.999)));
          const splineCurvature = baseSpline.secondDerivative(pStar);
          const hybridCurvature = hybrid.secondDerivative(Math.min(0.9999, pStar + 1e-5));
          const secondDerivativeJump = Math.abs(hybridCurvature - splineCurvature);
          records.push({
            pStar,
            giniIndex: giniResult.giniIndex,
            tailAlpha,
            top1PercentShare,
            top01PercentShare,
            secondDerivativeJump,
            isCertified: certificate.isCertified
          });
        } catch {
          continue;
        }
      }
      return records;
    }
    // Analyzes poverty headcount sensitivity across varying thresholds
    static computePovertySensitivityTable(model, povertyLines, meanIncome) {
      const engine = new InequalityEngine(model, this.integrator, this.rootFinder);
      return povertyLines.map((line) => engine.computePovertyElasticities(line, meanIncome));
    }
    // Decomposes high-net-worth upper-tail wealth shares
    static decomposeTopWealth(model) {
      const engine = new InequalityEngine(model, this.integrator, this.rootFinder);
      return engine.computeTopIncomeShares();
    }
    // Compares model reconstructed top-income shares against official World Inequality Database (WID) benchmarks
    static compareWithWID(datasetKey, splineModel, hybridModel) {
      const wid = WID_BENCHMARKS[datasetKey];
      if (!wid) {
        throw new Error(`Unknown benchmark dataset key '${datasetKey}'.`);
      }
      const splineShares = this.decomposeTopWealth(splineModel);
      const hybridShares = this.decomposeTopWealth(hybridModel);
      const splineTop10 = splineShares.top10PercentShare;
      const splineTop1 = splineShares.top1PercentShare;
      const hybridTop10 = hybridShares.top10PercentShare;
      const hybridTop1 = hybridShares.top1PercentShare;
      const top1ErrorSpline = Math.abs(splineTop1 - wid.widTop1) / wid.widTop1;
      const top1ErrorHybrid = Math.abs(hybridTop1 - wid.widTop1) / wid.widTop1;
      return {
        datasetName: wid.datasetName,
        splineTop10,
        splineTop1,
        hybridTop10,
        hybridTop1,
        widTop10: wid.widTop10,
        widTop1: wid.widTop1,
        top1ErrorSpline,
        top1ErrorHybrid
      };
    }
  };

  // src/diagnostics/ModelSelectionEvaluator.ts
  var ModelSelectionEvaluator = class {
    static EPSILON_RSS = 1e-14;
    // Gaussian log-likelihood: ln(L) = -0.5*n*ln(2*pi) - 0.5*n*ln(RSS/n) - 0.5*n
    static computeLogLikelihood(sampleSize, rss) {
      if (sampleSize <= 0) {
        throw new Error("Sample size must be strictly positive.");
      }
      const clampedRss = Math.max(rss, this.EPSILON_RSS);
      return -0.5 * sampleSize * Math.log(2 * Math.PI) - 0.5 * sampleSize * Math.log(clampedRss / sampleSize) - 0.5 * sampleSize;
    }
    // Standard Akaike Information Criterion: AIC = 2*k - 2*ln(L)
    static computeAIC(sampleSize, rss, paramCount) {
      const logLikelihood = this.computeLogLikelihood(sampleSize, rss);
      return 2 * paramCount - 2 * logLikelihood;
    }
    // Hurvich-Tsai small-sample correction: AICc = AIC + 2*k*(k+1) / (n - k - 1)
    static computeAICc(sampleSize, rss, paramCount) {
      const aic = this.computeAIC(sampleSize, rss, paramCount);
      const degreesOfFreedom = sampleSize - paramCount - 1;
      if (degreesOfFreedom <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return aic + 2 * paramCount * (paramCount + 1) / degreesOfFreedom;
    }
    // Schwarz Bayesian Information Criterion: BIC = k*ln(n) - 2*ln(L)
    static computeBIC(sampleSize, rss, paramCount) {
      const logLikelihood = this.computeLogLikelihood(sampleSize, rss);
      return paramCount * Math.log(sampleSize) - 2 * logLikelihood;
    }
    // Compute residual fit metrics and information criteria for one fitted Lorenz model
    static evaluateModel(dataset, model, parameterCount, modelName = "LorenzModel") {
      const points = dataset.points;
      const sampleSize = points.length;
      if (sampleSize === 0) {
        throw new Error("Dataset contains no quantile points.");
      }
      let rss = 0;
      let absoluteErrorSum = 0;
      let meanObserved = 0;
      for (const knot of points) {
        meanObserved += knot.incomeShare;
      }
      meanObserved /= sampleSize;
      let totalSumSquares = 0;
      for (const knot of points) {
        const percentile = knot.populationShare;
        const actualShare = knot.incomeShare;
        const predictedShare = model.evaluate(percentile);
        const residual = actualShare - predictedShare;
        rss += residual * residual;
        absoluteErrorSum += Math.abs(residual);
        totalSumSquares += (actualShare - meanObserved) * (actualShare - meanObserved);
      }
      const mse = rss / sampleSize;
      const rmse = Math.sqrt(mse);
      const mae = absoluteErrorSum / sampleSize;
      const rSquared = totalSumSquares > 0 ? Math.max(0, 1 - rss / totalSumSquares) : 1;
      const logLikelihood = this.computeLogLikelihood(sampleSize, rss);
      const aic = this.computeAIC(sampleSize, rss, parameterCount);
      const aicc = this.computeAICc(sampleSize, rss, parameterCount);
      const bic = this.computeBIC(sampleSize, rss, parameterCount);
      return {
        modelName,
        parameterCount,
        sampleSize,
        rss,
        mse,
        rmse,
        mae,
        rSquared,
        logLikelihood,
        aic,
        aicc,
        bic,
        deltaAic: 0,
        akaikeWeight: 1,
        evidenceRatio: 1
      };
    }
    // Ranks candidate models by AICc and computes Akaike weights and evidence ratios
    static compareModels(dataset, candidates) {
      if (candidates.length === 0) {
        return [];
      }
      const evaluatedRecords = candidates.map(
        (spec) => this.evaluateModel(dataset, spec.model, spec.parameterCount, spec.name)
      );
      let minAicc = Number.POSITIVE_INFINITY;
      for (const record of evaluatedRecords) {
        if (record.aicc < minAicc) {
          minAicc = record.aicc;
        }
      }
      const relativeLikelihoods = [];
      let sumLikelihoods = 0;
      for (const record of evaluatedRecords) {
        const deltaAicc = record.aicc - minAicc;
        const relLikelihood = Math.exp(-0.5 * deltaAicc);
        relativeLikelihoods.push(relLikelihood);
        sumLikelihoods += relLikelihood;
      }
      const rankedResults = evaluatedRecords.map((record, idx) => {
        const deltaAic = record.aicc - minAicc;
        const akaikeWeight = relativeLikelihoods[idx] / sumLikelihoods;
        const evidenceRatio = akaikeWeight > 0 ? 1 / akaikeWeight : Number.POSITIVE_INFINITY;
        return {
          ...record,
          deltaAic,
          akaikeWeight,
          evidenceRatio
        };
      });
      return rankedResults.sort((a, b) => a.deltaAic - b.deltaAic);
    }
    // Searches candidate splicing knots p* for the best trade-off between AICc fit and curvature jump
    static findOptimalKnot(dataset, options = {}) {
      const candidateKnots = options.candidateKnots ?? [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
      const curvatureWeight = options.curvatureWeight ?? 2;
      const bodyModelType = options.bodyModelType ?? "pchip";
      const baseSpline = bodyModelType === "cubicspline" ? new CubicSplineLorenzCurve(dataset) : new PchipLorenzCurve(dataset);
      const records = [];
      let bestKnot = candidateKnots[0];
      let bestAlpha = 2;
      let minScore = Number.POSITIVE_INFINITY;
      const sampleSize = dataset.points.length;
      const hybridParamCount = 2;
      for (const pStar of candidateKnots) {
        try {
          const hybrid = new HybridLorenzCurve(dataset, {
            bodyModel: baseSpline,
            splicePoint: pStar
          });
          const alpha = hybrid.getTailAlpha();
          const isAdmissible = alpha > 1 && alpha < 12;
          let rss = 0;
          for (const knot of dataset.points) {
            const residual = knot.incomeShare - hybrid.evaluate(knot.populationShare);
            rss += residual * residual;
          }
          const aic = this.computeAIC(sampleSize, rss, hybridParamCount);
          const aicc = this.computeAICc(sampleSize, rss, hybridParamCount);
          const bic = this.computeBIC(sampleSize, rss, hybridParamCount);
          const splineCurvature = baseSpline.secondDerivative(pStar);
          const hybridCurvature = hybrid.secondDerivative(Math.min(0.9999, pStar + 1e-5));
          const curvatureJump = Math.abs(hybridCurvature - splineCurvature);
          let alphaPenalty = 0;
          if (alpha > 5) {
            alphaPenalty = 5 * (alpha - 5);
          } else if (alpha < 1.1) {
            alphaPenalty = 20 * (1.1 - alpha);
          }
          const penalizedScore = aicc + curvatureWeight * Math.log(1 + curvatureJump) + alphaPenalty;
          const record = {
            pStar,
            tailAlpha: alpha,
            curvatureJump,
            rss,
            aic,
            aicc,
            bic,
            penalizedScore,
            isAdmissible
          };
          records.push(record);
          if (isAdmissible && penalizedScore < minScore) {
            minScore = penalizedScore;
            bestKnot = pStar;
            bestAlpha = alpha;
          }
        } catch {
          continue;
        }
      }
      if (records.length === 0) {
        throw new Error("No admissible splicing knot found across candidate set.");
      }
      return {
        optimalKnot: bestKnot,
        minScore,
        optimalAlpha: bestAlpha,
        records
      };
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
          currency: "EUR",
          benchmarkGini: BULGARIAN_NSI_2022.metadata.officialGini,
          benchmarkLabel: "NSI 2022 HBS Microdata",
          benchmarkType: "empirical"
        };
      case "bg_nsi_quintiles":
        return {
          dataset: {
            meanIncome: BULGARIAN_NSI_QUINTILES_2022.dataset.meanIncome,
            points: BULGARIAN_NSI_QUINTILES_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: BULGARIAN_NSI_QUINTILES_2022.metadata.povertyLine,
          // 3092 EUR
          currency: "EUR",
          benchmarkGini: BULGARIAN_NSI_QUINTILES_2022.metadata.officialGini,
          benchmarkLabel: "NSI 2022 Summary Deciles",
          benchmarkType: "empirical"
        };
      case "eurostat_2022":
        return {
          dataset: {
            meanIncome: EUROSTAT_EU27_2022.dataset.meanIncome,
            points: EUROSTAT_EU27_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: EUROSTAT_EU27_2022.metadata.povertyLine,
          // 12300 EUR
          currency: "EUR",
          benchmarkGini: EUROSTAT_EU27_2022.metadata.officialGini,
          benchmarkLabel: "Eurostat EU-SILC (EU-27)",
          benchmarkType: "empirical"
        };
      case "us_census_2022":
        return {
          dataset: {
            meanIncome: US_CENSUS_CPS_2022.dataset.meanIncome,
            points: US_CENSUS_CPS_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: US_CENSUS_CPS_2022.metadata.povertyLine,
          // 28180 EUR
          currency: "EUR",
          benchmarkGini: US_CENSUS_CPS_2022.metadata.officialGini,
          benchmarkLabel: "US Census Bureau CPS ASEC",
          benchmarkType: "empirical"
        };
      case "syn_lognormal": {
        const syn = new LogNormalDistribution(0.7);
        return {
          dataset: syn.sampleQuantiles(10, 25e3),
          poverty: 12e3,
          currency: "EUR",
          benchmarkGini: syn.theoreticalGini,
          benchmarkLabel: "Exact Closed-Form (erf(\u03C3/2))",
          benchmarkType: "synthetic"
        };
      }
      case "syn_singh_maddala": {
        const syn = new SinghMaddalaDistribution(2.8, 1.7);
        return {
          dataset: syn.sampleQuantiles(10, 24e3),
          poverty: 11500,
          currency: "EUR",
          benchmarkGini: syn.theoreticalGini,
          benchmarkLabel: "Exact Analytical (Beta/Gamma)",
          benchmarkType: "synthetic"
        };
      }
      case "syn_dagum": {
        const syn = new DagumDistribution(3.5, 0.7);
        return {
          dataset: syn.sampleQuantiles(10, 26e3),
          poverty: 12500,
          currency: "EUR",
          benchmarkGini: syn.theoreticalGini,
          benchmarkLabel: "Exact Analytical (Beta/Gamma)",
          benchmarkType: "synthetic"
        };
      }
      default:
        return {
          dataset: {
            meanIncome: BULGARIAN_NSI_2022.dataset.meanIncome,
            points: BULGARIAN_NSI_2022.dataset.points.map((pt) => ({ ...pt }))
          },
          poverty: BULGARIAN_NSI_2022.metadata.povertyLine,
          currency: "EUR",
          benchmarkGini: BULGARIAN_NSI_2022.metadata.officialGini,
          benchmarkLabel: "Bulgarian NSI 2022",
          benchmarkType: "empirical"
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
  function evaluateModelSelection(state2) {
    const pchip = new PchipLorenzCurve(state2.dataset);
    const cubic = new CubicSplineLorenzCurve(state2.dataset);
    const hybrid = new HybridLorenzCurve(state2.dataset, {
      bodyModel: pchip,
      splicePoint: state2.splicingThreshold
    });
    const candidates = [
      {
        name: `Proposed Hybrid (p* = ${state2.splicingThreshold.toFixed(2)})`,
        model: hybrid,
        parameterCount: 3
      },
      {
        name: "Monotone PCHIP Spline",
        model: pchip,
        parameterCount: 2
      },
      {
        name: "Natural Cubic Spline",
        model: cubic,
        parameterCount: 2
      }
    ];
    const comparison = ModelSelectionEvaluator.compareModels(state2.dataset, candidates);
    const knotOptimization = ModelSelectionEvaluator.findOptimalKnot(state2.dataset, {
      candidateKnots: [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
      curvatureWeight: 2,
      bodyModelType: "pchip"
    });
    return { comparison, knotOptimization };
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
  function renderTable(tableBody, points, validation, onUpdate, onDelete) {
    if (!tableBody) return;
    tableBody.innerHTML = "";
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
      <td class="text-center py-1" style="width: 46px;">
        ${isFirst || isLast ? `<span class="badge badge-secondary badge-na" title="Anchor boundary fixed">N/A</span>` : `<button class="btn btn-sm btn-outline-secondary py-0 px-1" data-delete="${index}" title="Remove knot" style="line-height: 1.2;">&times;</button>`}
      </td>
    `;
      tableBody.appendChild(tr);
    });
    tableBody.oninput = (e) => {
      const target = e.target;
      const idx = parseInt(target.getAttribute("data-idx") || "-1", 10);
      const field = target.getAttribute("data-field");
      const val = parseFloat(target.value);
      if (!isNaN(val) && idx >= 0) {
        onUpdate(idx, field, val);
      }
    };
    tableBody.onclick = (e) => {
      const target = e.target;
      const delIdx = target.getAttribute("data-delete");
      if (delIdx !== null) {
        const idx = parseInt(delIdx, 10);
        onDelete(idx);
      }
    };
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
  function validateEconomicParameters(meanIncome, povertyLine, splicePoint) {
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
    if (isNaN(splicePoint) || !isFinite(splicePoint) || splicePoint < 0.5 || splicePoint > 0.98) {
      spliceError = "Pareto splicing threshold p* must lie between 0.50 and 0.98.";
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

  // demo/src/domElements.ts
  function getDemoElements() {
    return {
      selectPreset: document.getElementById("selectPreset"),
      selectModelType: document.getElementById("selectModelType"),
      rangeSplice: document.getElementById("rangeSplice"),
      numSplice: document.getElementById("numSplice"),
      inputMeanIncome: document.getElementById("inputMeanIncome"),
      inputPoverty: document.getElementById("inputPoverty"),
      labelCurrency: document.getElementById("labelCurrency"),
      labelPovertyCurrency: document.getElementById("labelPovertyCurrency"),
      fileInput: document.getElementById("fileInput"),
      tableBody: document.getElementById("quantilesTableBody"),
      btnAddRow: document.getElementById("btnAddRow"),
      btnAutoRepair: document.getElementById("btnAutoRepair"),
      btnTogglePaste: document.getElementById("btnTogglePaste"),
      boxPasteArea: document.getElementById("boxPasteArea"),
      txtRawInput: document.getElementById("txtRawInput"),
      btnApplyPaste: document.getElementById("btnApplyPaste"),
      alertContainer: document.getElementById("alertContainer"),
      alertContent: document.getElementById("alertContent"),
      canvasLorenz: document.getElementById("canvasLorenz"),
      canvasDerivative: document.getElementById("canvasDerivative"),
      outGini: document.getElementById("outGini"),
      outGastwirth: document.getElementById("outGastwirth"),
      outPalma: document.getElementById("outPalma"),
      outSen: document.getElementById("outSen"),
      outHeadcount: document.getElementById("outHeadcount"),
      outAlpha: document.getElementById("outAlpha"),
      outBenchmarkGini: document.getElementById("outBenchmarkGini"),
      outErrorGini: document.getElementById("outErrorGini"),
      outTop1AndElasticity: document.getElementById("outTop1AndElasticity"),
      outTop10And01: document.getElementById("outTop10And01"),
      labelBenchmarkGini: document.getElementById("labelBenchmarkGini"),
      labelErrorGini: document.getElementById("labelErrorGini"),
      badgeStatus: document.getElementById("badgeStatus"),
      modelDescription: document.getElementById("modelDescription"),
      btnAutoSelectKnot: document.getElementById("btnAutoSelectKnot"),
      badgeOptimalKnot: document.getElementById("badgeOptimalKnot"),
      modelSelectionTableBody: document.getElementById("modelSelectionTableBody"),
      badgeBestModel: document.getElementById("badgeBestModel")
    };
  }

  // demo/src/metricsRenderer.ts
  function appendAlertLine(container, label, message) {
    const row = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = label;
    row.appendChild(strong);
    row.appendChild(document.createTextNode(` ${message}`));
    container.appendChild(row);
  }
  function createTableCell(text, className) {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = text;
    return cell;
  }
  function updateModelDescription(el2, state2) {
    if (!el2.modelDescription) return;
    if (state2.modelType === "hybrid") {
      el2.modelDescription.textContent = "Tail-spliced hybrid model: shape-preserving PCHIP body spliced onto an asymptotic Pareto tail with C^1 derivative continuity.";
    } else if (state2.modelType === "pchip") {
      el2.modelDescription.textContent = "Shape-preserving piecewise cubic Hermite interpolating polynomial (PCHIP) with harmonic slope weighting and iterative convexity cone projection.";
    } else {
      el2.modelDescription.textContent = "Natural C^2 cubic spline: smooth twice-differentiable polynomial solved via Thomas algorithm. May exhibit oscillatory overshoot on coarse data.";
    }
  }
  function collectValidationEntries(state2) {
    const entries = [];
    for (const err of state2.validation.errors) {
      entries.push({ label: "Knot Error:", message: err.message, isError: true });
    }
    if (state2.paramValidation.meanIncomeError) {
      entries.push({
        label: "Parameter Error:",
        message: state2.paramValidation.meanIncomeError,
        isError: true
      });
    }
    if (state2.paramValidation.povertyLineError) {
      entries.push({
        label: "Parameter Error:",
        message: state2.paramValidation.povertyLineError,
        isError: true
      });
    }
    if (state2.paramValidation.spliceError) {
      entries.push({
        label: "Splicing Error:",
        message: state2.paramValidation.spliceError,
        isError: true
      });
    }
    for (const warn of state2.validation.warnings) {
      entries.push({ label: "Warning:", message: warn, isError: false });
    }
    if (state2.paramValidation.povertyLineWarning) {
      entries.push({
        label: "Notice:",
        message: state2.paramValidation.povertyLineWarning,
        isError: false
      });
    }
    return entries;
  }
  function setStatusBadge(badge, status, text, title) {
    if (!badge) return;
    badge.className = status === "pass" ? "badge badge-dark" : "badge badge-error";
    badge.textContent = text;
    if (title) {
      badge.title = title;
    } else {
      badge.removeAttribute("title");
    }
  }
  function renderValidationErrorBadge(el2, state2) {
    const errors = collectValidationEntries(state2).filter((entry) => entry.isError).map((entry) => entry.message);
    if (errors.length === 0) {
      setStatusBadge(el2.badgeStatus, "error", "Validation error");
      return;
    }
    const summary = errors.length === 1 ? errors[0] : `${errors[0]} (+${errors.length - 1} more)`;
    setStatusBadge(el2.badgeStatus, "error", summary, errors.join("\n"));
  }
  function updateAlerts(el2, state2) {
    if (!el2.alertContainer || !el2.alertContent) return;
    el2.alertContent.replaceChildren();
    const entries = collectValidationEntries(state2);
    if (entries.length > 0) {
      el2.alertContainer.style.display = "block";
      for (const entry of entries) {
        appendAlertLine(el2.alertContent, entry.label, entry.message);
      }
    } else {
      el2.alertContainer.style.display = "none";
    }
  }
  function renderMacroMetrics(el2, state2, metrics) {
    if (el2.outGini) el2.outGini.textContent = metrics.giniIndex.toFixed(4);
    if (el2.outGastwirth) {
      el2.outGastwirth.textContent = `[${state2.currentGastwirth.lowerBound.toFixed(4)}, ${state2.currentGastwirth.upperBound.toFixed(4)}]`;
    }
    if (el2.outPalma) {
      el2.outPalma.textContent = isFinite(metrics.palmaRatio) ? metrics.palmaRatio.toFixed(2) : "N/A";
    }
    if (el2.outSen) {
      el2.outSen.textContent = `${Math.round(metrics.senWelfareIndex).toLocaleString()} ${state2.currency}`;
    }
    if (el2.outHeadcount) {
      el2.outHeadcount.textContent = `${(state2.currentHeadcount * 100).toFixed(1)}%`;
    }
    if (el2.outAlpha) {
      if (state2.modelType === "hybrid" && state2.currentModel instanceof HybridLorenzCurve) {
        el2.outAlpha.textContent = state2.currentModel.getTailAlpha().toFixed(2);
      } else {
        el2.outAlpha.textContent = "N/A";
      }
    }
    if (el2.outBenchmarkGini && el2.labelBenchmarkGini && el2.outErrorGini && el2.labelErrorGini) {
      if (state2.benchmarkGini !== null) {
        const trueG = state2.benchmarkGini;
        const diff = metrics.giniIndex - trueG;
        const relErr = Math.abs(diff) / trueG * 100;
        const sign = diff >= 0 ? "+" : "";
        if (state2.benchmarkType === "synthetic") {
          el2.labelBenchmarkGini.textContent = "Analytical Gini (G*)";
          el2.outBenchmarkGini.textContent = `${trueG.toFixed(4)}`;
          el2.labelErrorGini.textContent = "Estimation Error (|\u0394G|)";
          el2.outErrorGini.textContent = `${sign}${diff.toFixed(4)} (${relErr.toFixed(2)}%)`;
        } else {
          el2.labelBenchmarkGini.textContent = "Official Agency Gini";
          el2.outBenchmarkGini.textContent = `${trueG.toFixed(4)}`;
          el2.labelErrorGini.textContent = "Disparity vs Official";
          el2.outErrorGini.textContent = `${sign}${diff.toFixed(4)} (${relErr.toFixed(2)}%)`;
        }
      } else {
        el2.labelBenchmarkGini.textContent = "Benchmark Ground Truth";
        el2.outBenchmarkGini.textContent = "N/A (Custom Data)";
        el2.labelErrorGini.textContent = "Gastwirth Max Error Bound";
        el2.outErrorGini.textContent = `\xB1${state2.currentGastwirth.maxError.toFixed(4)}`;
      }
    }
    if (el2.outTop1AndElasticity && el2.outTop10And01) {
      if (metrics.topIncomeShares) {
        const t1 = (metrics.topIncomeShares.top1PercentShare * 100).toFixed(2);
        const t10 = (metrics.topIncomeShares.top10PercentShare * 100).toFixed(1);
        const t01 = (metrics.topIncomeShares.top01PercentShare * 100).toFixed(2);
        const ez = metrics.povertyElasticities ? metrics.povertyElasticities.elasticityZ.toFixed(2) : "N/A";
        el2.outTop1AndElasticity.textContent = `${t1}% (\u03B5_z: +${ez})`;
        el2.outTop10And01.textContent = `${t10}% / ${t01}%`;
      } else {
        el2.outTop1AndElasticity.textContent = "\u2014";
        el2.outTop10And01.textContent = "\u2014";
      }
    }
    if (state2.currentGastwirth.isCertified) {
      setStatusBadge(el2.badgeStatus, "pass", "Validations Pass");
    } else {
      const boundsMsg = `Outside Gastwirth bounds: Gini ${metrics.giniIndex.toFixed(4)} not in [${state2.currentGastwirth.lowerBound.toFixed(4)}, ${state2.currentGastwirth.upperBound.toFixed(4)}]`;
      setStatusBadge(el2.badgeStatus, "error", boundsMsg, boundsMsg);
    }
  }
  function renderModelSelectionTable(el2, comparison) {
    if (el2.modelSelectionTableBody) {
      el2.modelSelectionTableBody.replaceChildren();
      for (const rec of comparison) {
        const tr = document.createElement("tr");
        const isBest = rec.deltaAic === 0;
        if (isBest) tr.className = "best-model-row";
        const deltaAicStr = rec.deltaAic === 0 ? "0.00" : `+${rec.deltaAic.toFixed(2)}`;
        const weightPct = `${(rec.akaikeWeight * 100).toFixed(1)}%`;
        const evidenceStr = isFinite(rec.evidenceRatio) ? rec.evidenceRatio <= 1.01 ? "1.0\xD7" : `${rec.evidenceRatio.toFixed(1)}\xD7` : "\u2014";
        const nameCell = document.createElement("td");
        nameCell.className = "model-name";
        nameCell.appendChild(document.createTextNode(rec.modelName));
        if (isBest) {
          nameCell.appendChild(document.createTextNode(" "));
          const badge = document.createElement("span");
          badge.className = "badge badge-secondary ms-1";
          badge.style.fontSize = "0.62rem";
          badge.textContent = "Lowest AICc";
          nameCell.appendChild(badge);
        }
        tr.appendChild(nameCell);
        tr.appendChild(createTableCell(String(rec.parameterCount), "text-center font-monospace"));
        tr.appendChild(
          createTableCell(`${(rec.rmse * 1e4).toFixed(2)}\u2031`, "text-end font-monospace")
        );
        tr.appendChild(createTableCell(rec.logLikelihood.toFixed(2), "text-end font-monospace"));
        tr.appendChild(createTableCell(rec.aicc.toFixed(2), "text-end font-monospace"));
        tr.appendChild(createTableCell(deltaAicStr, "text-end font-monospace"));
        tr.appendChild(createTableCell(weightPct, "text-end font-monospace"));
        tr.appendChild(createTableCell(evidenceStr, "text-end font-monospace"));
        el2.modelSelectionTableBody.appendChild(tr);
      }
    }
    if (el2.badgeBestModel && comparison.length > 0) {
      const best = comparison[0];
      el2.badgeBestModel.textContent = `Lowest In-Sample AICc: ${best.modelName} (w\u1D62 = ${(best.akaikeWeight * 100).toFixed(1)}%)`;
    }
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
        errorMessage: err instanceof Error ? err.message : "Failed to parse quantile data."
      };
    }
  }
  function setupFileInput(fileInput, getMeanIncome, onResult) {
    if (!fileInput) return;
    fileInput.addEventListener("change", (e) => {
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

  // demo/src/eventHandlers.ts
  function bindDemoEvents(el2, state2, cb) {
    if (el2.selectPreset) {
      const onPreset = () => cb.applyPreset(el2.selectPreset.value);
      el2.selectPreset.addEventListener("change", onPreset);
      el2.selectPreset.addEventListener("input", onPreset);
    }
    if (el2.selectModelType) {
      el2.selectModelType.addEventListener("change", (e) => {
        state2.modelType = e.target.value;
        cb.recompute();
      });
    }
    if (el2.rangeSplice) {
      const onRangeSplice = (e) => {
        cb.clearOptimalKnotBadge();
        cb.syncSplicingThreshold(parseFloat(e.target.value));
      };
      el2.rangeSplice.addEventListener("input", onRangeSplice);
      el2.rangeSplice.addEventListener("change", onRangeSplice);
    }
    if (el2.numSplice) {
      const onNumSplice = (e) => {
        cb.clearOptimalKnotBadge();
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) cb.syncSplicingThreshold(val);
      };
      el2.numSplice.addEventListener("input", onNumSplice);
      el2.numSplice.addEventListener("change", onNumSplice);
    }
    if (el2.inputPoverty) {
      const onPoverty = (e) => {
        const val = parseFloat(e.target.value);
        state2.povertyLine = isNaN(val) ? 0 : val;
        cb.recompute();
      };
      el2.inputPoverty.addEventListener("input", onPoverty);
      el2.inputPoverty.addEventListener("change", onPoverty);
    }
    if (el2.inputMeanIncome) {
      const onMean = (e) => {
        const val = parseFloat(e.target.value);
        state2.dataset.meanIncome = isNaN(val) ? 0 : val;
        cb.recompute();
      };
      el2.inputMeanIncome.addEventListener("input", onMean);
      el2.inputMeanIncome.addEventListener("change", onMean);
    }
    if (el2.btnAddRow) {
      el2.btnAddRow.addEventListener("click", () => {
        const pts = state2.dataset.points;
        const lastSec = pts[pts.length - 2];
        const newP = lastSec ? Math.min(0.95, (lastSec.populationShare + 1) / 2) : 0.5;
        const newL = lastSec ? Math.min(0.95, (lastSec.incomeShare + 1) / 2) : 0.5;
        pts.splice(pts.length - 1, 0, { populationShare: newP, incomeShare: newL });
        pts.sort((a, b) => a.populationShare - b.populationShare);
        cb.updateTable();
        cb.recompute();
      });
    }
    if (el2.btnAutoRepair) {
      el2.btnAutoRepair.addEventListener("click", () => {
        state2.dataset.points = autoRepairQuantiles(state2.dataset.points);
        if (isNaN(state2.splicingThreshold) || state2.splicingThreshold < 0.6 || state2.splicingThreshold > 0.95) {
          cb.syncSplicingThreshold(0.8);
        }
        if (isNaN(state2.dataset.meanIncome) || state2.dataset.meanIncome <= 0) {
          const defaultMean = 5032;
          state2.dataset.meanIncome = defaultMean;
          if (el2.inputMeanIncome) {
            el2.inputMeanIncome.value = String(defaultMean);
            el2.inputMeanIncome.setAttribute("value", String(defaultMean));
          }
        }
        if (isNaN(state2.povertyLine) || state2.povertyLine <= 0) {
          const defaultPov = 3092;
          state2.povertyLine = defaultPov;
          if (el2.inputPoverty) {
            el2.inputPoverty.value = String(defaultPov);
            el2.inputPoverty.setAttribute("value", String(defaultPov));
          }
        }
        cb.updateTable();
        cb.recompute();
        const btn = el2.btnAutoRepair;
        const origText = btn.textContent || "Auto-Repair Knots";
        btn.textContent = "Repaired";
        btn.classList.add("btn-outline-light");
        btn.classList.remove("btn-dark");
        setTimeout(() => {
          btn.textContent = origText;
          btn.classList.remove("btn-outline-light");
          btn.classList.add("btn-dark");
        }, 1200);
      });
    }
    if (el2.btnTogglePaste && el2.boxPasteArea) {
      el2.btnTogglePaste.addEventListener("click", () => {
        const isHidden = el2.boxPasteArea.style.display === "none";
        el2.boxPasteArea.style.display = isHidden ? "block" : "none";
        el2.btnTogglePaste.textContent = isHidden ? "Close Text Paste" : "Paste Raw Text";
      });
    }
    if (el2.btnApplyPaste && el2.txtRawInput) {
      el2.btnApplyPaste.addEventListener("click", () => {
        const res = parseRawContent(
          el2.txtRawInput.value,
          "manual_entry.csv",
          state2.dataset.meanIncome || 1e4
        );
        if (res.success && res.dataset) {
          state2.dataset = {
            meanIncome: res.dataset.meanIncome,
            points: res.dataset.points.map((pt) => ({ ...pt }))
          };
          state2.benchmarkGini = null;
          state2.benchmarkLabel = null;
          state2.benchmarkType = null;
          if (el2.boxPasteArea) el2.boxPasteArea.style.display = "none";
          if (el2.btnTogglePaste) el2.btnTogglePaste.textContent = "Paste Raw Text";
          cb.updateTable();
          cb.recompute();
        } else {
          alert("Failed to parse content: " + (res.errorMessage || "Unknown error."));
        }
      });
    }
    setupFileInput(
      el2.fileInput,
      () => state2.dataset.meanIncome || 1e4,
      (res) => {
        if (res.success && res.dataset) {
          state2.dataset = {
            meanIncome: res.dataset.meanIncome,
            points: res.dataset.points.map((pt) => ({ ...pt }))
          };
          state2.benchmarkGini = null;
          state2.benchmarkLabel = null;
          state2.benchmarkType = null;
          cb.updateTable();
          cb.recompute();
        } else {
          alert("File error: " + (res.errorMessage || "Could not read data."));
        }
      }
    );
    if (el2.btnAutoSelectKnot) {
      el2.btnAutoSelectKnot.addEventListener("click", () => {
        try {
          const msResult = evaluateModelSelection(state2);
          const optKnot = msResult.knotOptimization.optimalKnot;
          cb.syncSplicingThreshold(optKnot);
          if (el2.badgeOptimalKnot) {
            el2.badgeOptimalKnot.textContent = `Optimal p* = ${optKnot.toFixed(2)} | Score ${msResult.knotOptimization.minScore.toFixed(1)}, \u03B1 = ${msResult.knotOptimization.optimalAlpha.toFixed(2)}`;
            el2.badgeOptimalKnot.style.display = "inline-block";
          }
          cb.recompute();
        } catch (optErr) {
          console.error("Auto knot selection failed:", optErr);
          cb.clearOptimalKnotBadge();
        }
      });
    }
    window.addEventListener("resize", () => {
      renderLorenzChart(el2.canvasLorenz, state2);
      renderDerivativeChart(el2.canvasDerivative, state2);
    });
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
    splicingThreshold: 0.9,
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
    },
    benchmarkGini: initialPreset.benchmarkGini,
    benchmarkLabel: initialPreset.benchmarkLabel,
    benchmarkType: initialPreset.benchmarkType
  };
  var el = getDemoElements();
  function recompute() {
    state.validation = validateQuantilePoints(state.dataset.points);
    state.paramValidation = validateEconomicParameters(
      state.dataset.meanIncome || 1e4,
      state.povertyLine,
      state.splicingThreshold
    );
    updateAlerts(el, state);
    updateModelDescription(el, state);
    if (!state.validation.isValid || !state.paramValidation.isValid) {
      renderValidationErrorBadge(el, state);
      renderLorenzChart(el.canvasLorenz, state);
      renderDerivativeChart(el.canvasDerivative, state);
      return;
    }
    try {
      const result = evaluateInequality(state);
      state.currentModel = result.model;
      state.currentGastwirth = result.metrics.gastwirthCertificate;
      state.currentHeadcount = result.metrics.povertyHeadcount ?? 0;
      renderMacroMetrics(el, state, result.metrics);
      try {
        const msResult = evaluateModelSelection(state);
        renderModelSelectionTable(el, msResult.comparison);
      } catch (msErr) {
        console.warn("Model selection evaluation warning:", msErr);
      }
      renderLorenzChart(el.canvasLorenz, state);
      renderDerivativeChart(el.canvasDerivative, state);
    } catch (err) {
      console.error("Recompute error:", err);
      const errMsg = err instanceof Error ? err.message : "Solver Error";
      setStatusBadge(el.badgeStatus, "error", errMsg, errMsg);
    }
  }
  function updateTable() {
    renderTable(
      el.tableBody,
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
    if (el.rangeSplice) {
      el.rangeSplice.value = formatted;
      el.rangeSplice.setAttribute("value", formatted);
      el.rangeSplice.setAttribute("aria-valuetext", formatted);
      el.rangeSplice.style.setProperty("--attr-min", el.rangeSplice.min || "0.60");
      el.rangeSplice.style.setProperty("--attr-max", el.rangeSplice.max || "0.95");
      el.rangeSplice.style.setProperty("--control-value", formatted);
    }
    if (el.numSplice) {
      el.numSplice.value = formatted;
      el.numSplice.setAttribute("value", formatted);
    }
    recompute();
  }
  function clearOptimalKnotBadge() {
    if (el.badgeOptimalKnot) {
      el.badgeOptimalKnot.style.display = "none";
      el.badgeOptimalKnot.textContent = "";
    }
  }
  function applyPreset(key) {
    clearOptimalKnotBadge();
    const loaded = loadPreset(key);
    state.dataset = {
      meanIncome: loaded.dataset.meanIncome,
      points: loaded.dataset.points.map((pt) => ({ ...pt }))
    };
    state.povertyLine = loaded.poverty;
    state.currency = loaded.currency;
    state.benchmarkGini = loaded.benchmarkGini;
    state.benchmarkLabel = loaded.benchmarkLabel;
    state.benchmarkType = loaded.benchmarkType;
    const meanVal = String(Math.round(state.dataset.meanIncome || 1e4));
    const povVal = String(Math.round(state.povertyLine));
    if (el.inputMeanIncome) {
      el.inputMeanIncome.value = meanVal;
      el.inputMeanIncome.setAttribute("value", meanVal);
    }
    if (el.inputPoverty) {
      el.inputPoverty.value = povVal;
      el.inputPoverty.setAttribute("value", povVal);
    }
    if (el.labelCurrency) el.labelCurrency.textContent = state.currency;
    if (el.labelPovertyCurrency) el.labelPovertyCurrency.textContent = state.currency;
    const pts = state.dataset.points;
    if (pts.length >= 3) {
      syncSplicingThreshold(pts[pts.length - 2].populationShare);
    }
    updateTable();
    recompute();
  }
  bindDemoEvents(el, state, {
    recompute,
    updateTable,
    syncSplicingThreshold,
    applyPreset,
    clearOptimalKnotBadge
  });
  if (el.selectPreset && el.selectPreset.value) {
    applyPreset(el.selectPreset.value);
  } else {
    applyPreset("bg_nsi_2022");
  }
  syncSplicingThreshold(state.splicingThreshold);
  if (typeof document !== "undefined") {
    const initUI = () => {
      if (el.selectPreset && el.selectPreset.value) {
        applyPreset(el.selectPreset.value);
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
