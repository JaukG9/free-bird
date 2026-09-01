#!/usr/bin/env node
/**
 * Offline test and evaluation runner.
 *
 *   node tests/run-node.js            run the test suites
 *   node tests/run-node.js --eval     evaluate both sets and compare them
 *   node tests/run-node.js --eval --dataset holdout   score one set only
 *   node tests/run-node.js --eval --json report.json   also write the raw report
 *
 * No dependencies and no build step. The application source is loaded exactly
 * as the browser loads it, inside a vm context with a minimal `window`, so the
 * code under test is the code that ships.
 *
 * One shim: ai/model.js calls dynamic `import()` to fetch Transformers.js from
 * a CDN. Node's vm cannot service that call, and downloading a model has no
 * place in a test run, so the import is replaced with a rejected promise. The
 * effect is that Node always measures the rule engine, which is exactly the
 * "offline coaching mode" path. Blended metrics require the browser runner at
 * tests/index.html.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
  'ai/normalize.js',
  'data/exercises.js',
  'ai/classifier.js',
  'ai/safety.js',
  'ai/model.js',
  'ai/recommendations.js',
  'ai/fallback.js',
  'ai/pipeline.js',
  'data/evaluation-data.js',
  'data/evaluation-holdout.js',
  'tests/test-harness.js',
  'tests/classifier-tests.js',
  'tests/safety-tests.js',
  'tests/recommendation-tests.js',
  'tests/evaluate.js'
];

function buildContext() {
  const windowObj = {};
  const sandbox = {
    window: windowObj,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Date,
    Math,
    JSON
  };
  windowObj.setTimeout = setTimeout;
  windowObj.clearTimeout = clearTimeout;
  windowObj.console = console;
  sandbox.global = sandbox;
  return vm.createContext(sandbox);
}

function loadSource(context, relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  let code = fs.readFileSync(fullPath, 'utf8');

  if (relativePath === 'ai/model.js') {
    // See the header comment: the browser-only CDN import is stubbed out.
    code = code.replace(
      /return import\([\s\S]*?source\.url\)/,
      'return Promise.reject(new Error("Dynamic import is not available in the Node runner"))'
    );
  }

  try {
    vm.runInContext(code, context, { filename: relativePath });
  } catch (err) {
    console.error('Failed to load ' + relativePath);
    throw err;
  }
}

function colour(text, code) {
  return process.stdout.isTTY ? '[' + code + 'm' + text + '[0m' : text;
}

function runTests(FB) {
  let lastSuite = null;

  return FB.testHarness.run(function (result) {
    if (result.suite !== lastSuite) {
      lastSuite = result.suite;
      console.log('\n' + colour(result.suite, '1'));
    }
    if (result.passed) {
      console.log('  ' + colour('pass', '32') + '  ' + result.label);
    } else {
      console.log('  ' + colour('FAIL', '31') + '  ' + result.label);
      console.log('        ' + result.error);
    }
  }).then(function (summary) {
    console.log('\n' + '-'.repeat(60));
    const line = summary.passed + ' passed, ' + summary.failed + ' failed, ' + summary.total + ' total';
    console.log(summary.failed ? colour(line, '31') : colour(line, '32'));
    return summary;
  });
}

/**
 * Evaluate both sets and print them side by side.
 *
 * The two are never merged into one figure. The development set says whether a
 * change broke something that used to work; the held-out set estimates how the
 * system does on wording it has not seen. The distance between them is the
 * most informative thing either one reports.
 *
 *   --dataset dev|holdout|all   score only one set (default: both, compared)
 */
function runEvaluation(FB, args) {
  const pick = args.indexOf('--dataset');
  const only = pick !== -1 ? args[pick + 1] : null;

  function report(dataset) {
    const n = FB.evaluate.casesFor(dataset).length;
    console.log('Evaluating the ' + FB.evaluate.datasetLabel(dataset) + ' in rule-engine mode over ' + n + ' cases.\n');
    return FB.evaluate.run({ mode: 'rules', dataset: dataset }).then(function (r) {
      console.log(FB.evaluate.format(r));
      return r;
    });
  }

  function writeJson(payload) {
    const jsonIndex = args.indexOf('--json');
    if (jsonIndex !== -1 && args[jsonIndex + 1]) {
      const target = path.resolve(process.cwd(), args[jsonIndex + 1]);
      fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
      console.log('\nRaw report written to ' + target);
    }
  }

  if (only) {
    return report(only).then(function (r) { writeJson(r); return r; });
  }

  return report('dev').then(function (dev) {
    console.log('\n' + '='.repeat(60) + '\n');
    return report('holdout').then(function (holdout) {
      function pct(v) { return v === null || v === undefined ? '  n/a' : (v * 100).toFixed(1) + '%'; }
      function pad(t, w) { t = String(t); while (t.length < w) t += ' '; return t; }

      console.log('\n' + '='.repeat(60));
      console.log('DEVELOPMENT vs HELD-OUT');
      console.log('='.repeat(60));
      console.log(pad('Metric', 30) + pad('Dev', 10) + pad('Held-out', 10) + 'Gap');

      [
        ['Primary signal accuracy', function (r) { return r.primarySignal.accuracy; }],
        ['Macro F1', function (r) { return r.primarySignal.macroF1; }],
        ['Secondary signal recall', function (r) { return r.secondarySignals.recall; }],
        ['Pressure band, exact', function (r) { return r.pressureBand.accuracy; }],
        ['Pressure band, within one', function (r) { return r.pressureBand.withinOneBand; }],
        ['Safety accuracy', function (r) { return r.safety.accuracy; }]
      ].forEach(function (row) {
        const a = row[1](dev);
        const b = row[1](holdout);
        const gap = (a === null || b === null) ? '' : ((b - a) * 100).toFixed(1) + ' pts';
        console.log(pad(row[0], 30) + pad(pct(a), 10) + pad(pct(b), 10) + gap);
      });

      console.log('\nThe held-out set was consulted while fixing a recall problem it exposed,');
      console.log('so its figures are optimistic by an unknown amount. See README section 15.');

      writeJson({ dev: dev, holdout: holdout });
      return { dev: dev, holdout: holdout };
    });
  });
}

function main() {
  const args = process.argv.slice(2);
  const context = buildContext();

  SOURCES.forEach(function (source) { loadSource(context, source); });
  const FB = context.window.FB;

  if (!FB || !FB.classifier) {
    console.error('The application source did not load correctly.');
    process.exit(1);
  }

  const wantsEval = args.indexOf('--eval') !== -1;

  const task = wantsEval ? runEvaluation(FB, args) : runTests(FB);

  task.then(function (result) {
    if (!wantsEval && result && result.failed > 0) process.exit(1);
  }).catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}

main();
