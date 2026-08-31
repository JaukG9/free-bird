#!/usr/bin/env node
/**
 * Offline test and evaluation runner.
 *
 *   node tests/run-node.js            run the test suites
 *   node tests/run-node.js --eval     run the evaluation and print metrics
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

function runEvaluation(FB, args) {
  console.log('Running evaluation in rule-engine mode over ' + FB.evaluationData.CASES.length + ' cases.\n');

  return FB.evaluate.run({ mode: 'rules' }).then(function (report) {
    console.log(FB.evaluate.format(report));

    const jsonIndex = args.indexOf('--json');
    if (jsonIndex !== -1 && args[jsonIndex + 1]) {
      const target = path.resolve(process.cwd(), args[jsonIndex + 1]);
      fs.writeFileSync(target, JSON.stringify(report, null, 2), 'utf8');
      console.log('\nRaw report written to ' + target);
    }
    return report;
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
