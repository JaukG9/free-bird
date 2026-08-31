/**
 * A very small test harness.
 *
 * No dependencies, no build step. It runs in the browser (tests/index.html)
 * and under Node (tests/run-node.js) without changing a line of the app.
 */
(function (FB) {
  'use strict';

  var suites = [];

  function describe(name, fn) {
    var suite = { name: name, tests: [] };
    suites.push(suite);
    fn({
      it: function (label, testFn) {
        suite.tests.push({ label: label, fn: testFn });
      }
    });
  }

  function fail(message) {
    var error = new Error(message);
    error.isAssertion = true;
    throw error;
  }

  var assert = {
    ok: function (value, message) {
      if (!value) fail(message || 'Expected a truthy value, received ' + JSON.stringify(value));
    },
    notOk: function (value, message) {
      if (value) fail(message || 'Expected a falsy value, received ' + JSON.stringify(value));
    },
    equal: function (actual, expected, message) {
      if (actual !== expected) {
        fail(message || 'Expected ' + JSON.stringify(expected) + ', received ' + JSON.stringify(actual));
      }
    },
    notEqual: function (actual, expected, message) {
      if (actual === expected) fail(message || 'Expected something other than ' + JSON.stringify(expected));
    },
    includes: function (list, value, message) {
      if (!list || list.indexOf(value) === -1) {
        fail(message || 'Expected list to include ' + JSON.stringify(value) + ', got ' + JSON.stringify(list));
      }
    },
    excludes: function (list, value, message) {
      if (list && list.indexOf(value) !== -1) {
        fail(message || 'Expected list not to include ' + JSON.stringify(value));
      }
    },
    greater: function (actual, threshold, message) {
      if (!(actual > threshold)) {
        fail(message || 'Expected ' + actual + ' to be greater than ' + threshold);
      }
    },
    atMost: function (actual, threshold, message) {
      if (!(actual <= threshold)) {
        fail(message || 'Expected ' + actual + ' to be at most ' + threshold);
      }
    },
    deepEqual: function (actual, expected, message) {
      var a = JSON.stringify(actual);
      var b = JSON.stringify(expected);
      if (a !== b) fail(message || 'Expected ' + b + ', received ' + a);
    }
  };

  /**
   * Run every registered suite. Async tests are supported by returning a
   * promise from the test function.
   */
  function run(onResult) {
    var results = [];

    return suites.reduce(function (chain, suite) {
      return chain.then(function () {
        return suite.tests.reduce(function (inner, test) {
          return inner.then(function () {
            var entry = { suite: suite.name, label: test.label, passed: true, error: null };
            try {
              var maybePromise = test.fn(assert);
              if (maybePromise && typeof maybePromise.then === 'function') {
                return maybePromise.then(function () {
                  results.push(entry);
                  if (onResult) onResult(entry);
                }, function (err) {
                  entry.passed = false;
                  entry.error = err && err.message ? err.message : String(err);
                  results.push(entry);
                  if (onResult) onResult(entry);
                });
              }
            } catch (err) {
              entry.passed = false;
              entry.error = err && err.message ? err.message : String(err);
            }
            results.push(entry);
            if (onResult) onResult(entry);
            return null;
          });
        }, Promise.resolve());
      });
    }, Promise.resolve()).then(function () {
      return {
        results: results,
        total: results.length,
        passed: results.filter(function (r) { return r.passed; }).length,
        failed: results.filter(function (r) { return !r.passed; }).length
      };
    });
  }

  function reset() { suites = []; }

  FB.testHarness = {
    describe: describe,
    run: run,
    reset: reset,
    assert: assert,
    suites: function () { return suites; }
  };
})(typeof window !== 'undefined' ? (window.FB = window.FB || {}) : (global.FB = global.FB || {}));
