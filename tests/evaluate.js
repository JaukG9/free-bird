/**
 * Evaluation runner.
 *
 * Computes accuracy, per-class precision, recall and F1, macro averages, and a
 * confusion matrix over data/evaluation-data.js. It computes them at run time
 * and prints them. It does not store, cache, or hardcode any figure, and no
 * number produced here is written into the README by anything other than a
 * person copying an actual run.
 *
 * Two modes:
 *   'rules'   the deterministic engine only, which is what runs in offline
 *             coaching mode and what the Node script can measure
 *   'blended' the rule engine combined with the on-device embedding model,
 *             which requires the model to be loaded and therefore only runs in
 *             a browser
 */
(function (FB) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Metric maths                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Per-class precision, recall and F1 from a list of {expected, predicted}.
   * Macro averages weight every class equally, which is the honest choice here
   * because the dataset is small and deliberately not balanced.
   */
  function classificationReport(pairs, labels) {
    var stats = {};
    labels.forEach(function (label) {
      stats[label] = { tp: 0, fp: 0, fn: 0, support: 0 };
    });

    pairs.forEach(function (pair) {
      if (stats[pair.expected]) stats[pair.expected].support++;

      if (pair.expected === pair.predicted) {
        if (stats[pair.expected]) stats[pair.expected].tp++;
      } else {
        if (stats[pair.predicted]) stats[pair.predicted].fp++;
        if (stats[pair.expected]) stats[pair.expected].fn++;
      }
    });

    var perClass = labels.map(function (label) {
      var s = stats[label];
      var precision = (s.tp + s.fp) ? s.tp / (s.tp + s.fp) : null;
      var recall = (s.tp + s.fn) ? s.tp / (s.tp + s.fn) : null;
      var f1 = (precision !== null && recall !== null && (precision + recall) > 0)
        ? (2 * precision * recall) / (precision + recall)
        : (precision === null && recall === null ? null : 0);
      return {
        label: label,
        support: s.support,
        tp: s.tp, fp: s.fp, fn: s.fn,
        precision: precision,
        recall: recall,
        f1: f1
      };
    });

    var scored = perClass.filter(function (c) { return c.support > 0; });
    var correct = pairs.filter(function (p) { return p.expected === p.predicted; }).length;

    function macro(key) {
      var values = scored.map(function (c) { return c[key]; }).filter(function (v) { return v !== null; });
      if (!values.length) return null;
      return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    }

    function weighted(key) {
      var totalSupport = scored.reduce(function (sum, c) { return sum + c.support; }, 0);
      if (!totalSupport) return null;
      return scored.reduce(function (sum, c) {
        return sum + ((c[key] === null ? 0 : c[key]) * c.support);
      }, 0) / totalSupport;
    }

    return {
      n: pairs.length,
      accuracy: pairs.length ? correct / pairs.length : null,
      correct: correct,
      perClass: perClass,
      macroPrecision: macro('precision'),
      macroRecall: macro('recall'),
      macroF1: macro('f1'),
      weightedF1: weighted('f1')
    };
  }

  function confusionMatrix(pairs, labels) {
    var matrix = {};
    labels.forEach(function (rowLabel) {
      matrix[rowLabel] = {};
      labels.forEach(function (colLabel) { matrix[rowLabel][colLabel] = 0; });
    });
    pairs.forEach(function (pair) {
      if (matrix[pair.expected] && typeof matrix[pair.expected][pair.predicted] === 'number') {
        matrix[pair.expected][pair.predicted]++;
      }
    });
    return matrix;
  }

  /* ------------------------------------------------------------------ */
  /* Runner                                                              */
  /* ------------------------------------------------------------------ */

  function analyseCase(testCase, mode) {
    return FB.pipeline.analyze(testCase.text, testCase.context || {}, {
      forceLexical: mode !== 'blended'
    });
  }

  /**
   * @param {{mode?: 'rules'|'blended', onProgress?: function}} options
   * @returns {Promise<object>} report
   */
  function run(options) {
    options = options || {};
    var mode = options.mode === 'blended' ? 'blended' : 'rules';
    var cases = FB.evaluationData.CASES;

    if (mode === 'blended' && !FB.model.semanticReady()) {
      return Promise.reject(new Error('Blended mode needs the on-device model. Load it first, then run again.'));
    }

    var signalPairs = [];
    var bandPairs = [];
    var safetyPairs = [];
    var secondary = { expected: 0, found: 0 };
    var latencies = [];
    var perCase = [];

    return cases.reduce(function (chain, testCase, index) {
      return chain.then(function () {
        if (options.onProgress) options.onProgress(index + 1, cases.length);

        return analyseCase(testCase, mode).then(function (profile) {
          var predictedSafety = profile.safety ? profile.safety.level : 'none';
          safetyPairs.push({ expected: testCase.expectedSafety, predicted: predictedSafety, id: testCase.id });

          var record = {
            id: testCase.id,
            text: testCase.text,
            expectedSafety: testCase.expectedSafety,
            predictedSafety: predictedSafety,
            blocked: !!profile.blocked
          };

          // Blocked cases have no analysis by design, so they are excluded
          // from the signal and band metrics rather than counted as errors.
          if (!profile.blocked && testCase.expectedPrimary) {
            var predicted = profile.primarySignal;
            signalPairs.push({ expected: testCase.expectedPrimary, predicted: predicted, id: testCase.id });
            bandPairs.push({ expected: testCase.expectedBand, predicted: profile.pressure.band, id: testCase.id });
            latencies.push(profile.latencyMs);

            var reported = profile.reportable.map(function (s) { return s.id; });
            (testCase.expectedSecondary || []).forEach(function (signal) {
              secondary.expected++;
              if (reported.indexOf(signal) !== -1) secondary.found++;
            });

            record.expectedPrimary = testCase.expectedPrimary;
            record.predictedPrimary = predicted;
            record.expectedBand = testCase.expectedBand;
            record.predictedBand = profile.pressure.band;
            record.pressure = profile.pressure.value;
            record.reported = reported;
            record.correct = predicted === testCase.expectedPrimary;
          }

          perCase.push(record);
        });
      });
    }, Promise.resolve()).then(function () {
      var signalLabels = FB.classifier.SIGNALS.map(function (s) { return s.id; });
      var bandLabels = ['low', 'moderate', 'high', 'very high'];
      var safetyLabels = ['none', 'concern', 'crisis'];

      var bandReport = classificationReport(bandPairs, bandLabels);
      var withinOne = bandPairs.filter(function (pair) {
        var a = bandLabels.indexOf(pair.expected);
        var b = bandLabels.indexOf(pair.predicted);
        return Math.abs(a - b) <= 1;
      }).length;

      return {
        generatedAt: new Date().toISOString(),
        mode: mode,
        modelId: mode === 'blended' ? FB.model.MODEL_ID : null,
        caseCount: cases.length,

        primarySignal: Object.assign(
          classificationReport(signalPairs, signalLabels),
          { confusion: confusionMatrix(signalPairs, signalLabels), labels: signalLabels }
        ),

        secondarySignals: {
          expected: secondary.expected,
          found: secondary.found,
          recall: secondary.expected ? secondary.found / secondary.expected : null
        },

        pressureBand: Object.assign(bandReport, {
          confusion: confusionMatrix(bandPairs, bandLabels),
          labels: bandLabels,
          withinOneBand: bandPairs.length ? withinOne / bandPairs.length : null
        }),

        safety: Object.assign(
          classificationReport(safetyPairs, safetyLabels),
          { confusion: confusionMatrix(safetyPairs, safetyLabels), labels: safetyLabels }
        ),

        latency: latencies.length ? {
          count: latencies.length,
          meanMs: latencies.reduce(function (a, b) { return a + b; }, 0) / latencies.length,
          maxMs: Math.max.apply(null, latencies)
        } : null,

        perCase: perCase
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formatting                                                          */
  /* ------------------------------------------------------------------ */

  function pct(value) {
    return value === null || value === undefined ? 'n/a' : (value * 100).toFixed(1) + '%';
  }

  function pad(text, width) {
    var s = String(text);
    while (s.length < width) s += ' ';
    return s;
  }

  /** A plain-text report suitable for pasting into a pull request or a README. */
  function format(report) {
    var lines = [];

    lines.push('Free Bird evaluation');
    lines.push('Generated: ' + report.generatedAt);
    lines.push('Mode: ' + report.mode + (report.modelId ? ' (' + report.modelId + ')' : ' (rule engine only)'));
    lines.push('Cases in dataset: ' + report.caseCount);
    lines.push('');

    lines.push('PRIMARY SIGNAL');
    lines.push('  Scored cases:  ' + report.primarySignal.n);
    lines.push('  Accuracy:      ' + pct(report.primarySignal.accuracy) + '  (' + report.primarySignal.correct + '/' + report.primarySignal.n + ')');
    lines.push('  Macro P/R/F1:  ' + pct(report.primarySignal.macroPrecision) + ' / ' + pct(report.primarySignal.macroRecall) + ' / ' + pct(report.primarySignal.macroF1));
    lines.push('  Weighted F1:   ' + pct(report.primarySignal.weightedF1));
    lines.push('');
    lines.push('  ' + pad('class', 20) + pad('support', 9) + pad('prec', 9) + pad('recall', 9) + 'f1');
    report.primarySignal.perClass.forEach(function (c) {
      if (!c.support && !c.fp) return;
      lines.push('  ' + pad(c.label, 20) + pad(c.support, 9) + pad(pct(c.precision), 9) + pad(pct(c.recall), 9) + pct(c.f1));
    });
    lines.push('');

    lines.push('  Confusion matrix (rows expected, columns predicted)');
    var active = report.primarySignal.labels.filter(function (label) {
      var row = report.primarySignal.confusion[label];
      var rowSum = Object.keys(row).reduce(function (sum, k) { return sum + row[k]; }, 0);
      var colSum = report.primarySignal.labels.reduce(function (sum, r) { return sum + report.primarySignal.confusion[r][label]; }, 0);
      return rowSum > 0 || colSum > 0;
    });
    lines.push('  ' + pad('', 20) + active.map(function (l) { return pad(l.slice(0, 7), 8); }).join(''));
    active.forEach(function (rowLabel) {
      lines.push('  ' + pad(rowLabel, 20) + active.map(function (colLabel) {
        return pad(report.primarySignal.confusion[rowLabel][colLabel], 8);
      }).join(''));
    });
    lines.push('');

    lines.push('SECONDARY SIGNALS');
    lines.push('  Recall: ' + pct(report.secondarySignals.recall) + '  (' + report.secondarySignals.found + '/' + report.secondarySignals.expected + ' expected secondary signals appeared in the reported set)');
    lines.push('');

    lines.push('PRESSURE BAND');
    lines.push('  Exact accuracy:    ' + pct(report.pressureBand.accuracy));
    lines.push('  Within one band:   ' + pct(report.pressureBand.withinOneBand));
    lines.push('  Macro F1:          ' + pct(report.pressureBand.macroF1));
    lines.push('');

    lines.push('SAFETY SCAN');
    lines.push('  Accuracy:      ' + pct(report.safety.accuracy) + '  (' + report.safety.correct + '/' + report.safety.n + ')');
    lines.push('  Macro F1:      ' + pct(report.safety.macroF1));
    report.safety.perClass.forEach(function (c) {
      lines.push('  ' + pad(c.label, 12) + 'support ' + pad(c.support, 5) + 'prec ' + pad(pct(c.precision), 9) + 'recall ' + pad(pct(c.recall), 9) + 'f1 ' + pct(c.f1));
    });
    lines.push('  Note: crisis recall is the figure that matters most. A false positive shows a support screen to someone who did not need it. A false negative does not show it to someone who did.');
    lines.push('');

    if (report.latency) {
      lines.push('LATENCY');
      lines.push('  Mean: ' + report.latency.meanMs.toFixed(1) + ' ms   Max: ' + report.latency.maxMs + ' ms   (' + report.latency.count + ' analyses)');
      lines.push('');
    }

    var misses = report.perCase.filter(function (c) { return c.correct === false; });
    if (misses.length) {
      lines.push('MISCLASSIFIED PRIMARY SIGNALS');
      misses.forEach(function (c) {
        lines.push('  ' + c.id + ': expected ' + c.expectedPrimary + ', predicted ' + c.predictedPrimary);
        lines.push('      "' + c.text.slice(0, 90) + (c.text.length > 90 ? '...' : '') + '"');
      });
      lines.push('');
    }

    var safetyMisses = report.perCase.filter(function (c) { return c.expectedSafety !== c.predictedSafety; });
    if (safetyMisses.length) {
      lines.push('SAFETY DISAGREEMENTS');
      safetyMisses.forEach(function (c) {
        lines.push('  ' + c.id + ': expected ' + c.expectedSafety + ', got ' + c.predictedSafety);
      });
      lines.push('');
    }

    lines.push('Dataset limitation: these cases were written and labelled by the project author.');
    lines.push('They are a development set, not an independent benchmark, and the figures above');
    lines.push('should be read as a regression check rather than as evidence of real-world accuracy.');

    return lines.join('\n');
  }

  FB.evaluate = {
    run: run,
    format: format,
    classificationReport: classificationReport,
    confusionMatrix: confusionMatrix
  };
})(typeof window !== 'undefined' ? (window.FB = window.FB || {}) : (global.FB = global.FB || {}));
