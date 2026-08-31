/**
 * Classifier behaviour tests.
 *
 * These check the properties the app depends on, not a target accuracy number.
 * Accuracy is measured separately by tests/evaluate.js against the labelled
 * dataset, so that no metric is ever asserted into existence here.
 */
(function (FB) {
  'use strict';

  var describe = FB.testHarness.describe;

  function analyse(text, context) {
    var pre = FB.classifier.preprocess(text);
    var lexical = FB.classifier.scoreLexical(pre);
    var combined = FB.classifier.combineScores(lexical.scores, null);
    var ranked = FB.classifier.rankSignals(combined);
    return {
      pre: pre,
      scores: combined,
      ranked: ranked,
      reportable: FB.classifier.selectReportable(ranked),
      patterns: FB.classifier.detectPatterns(pre),
      pressure: FB.classifier.estimatePressure(combined, pre, context || {})
    };
  }

  function topId(result) {
    return result.reportable.length ? result.reportable[0].id : null;
  }

  describe('Preprocessing', function (t) {
    t.it('trims and normalises whitespace', function (assert) {
      var pre = FB.classifier.preprocess('  I  have\n\ntwo   tests  ');
      assert.equal(pre.normalised, 'i have two tests');
      assert.equal(pre.original, 'I  have\n\ntwo   tests');
    });

    t.it('handles null and undefined without throwing', function (assert) {
      assert.equal(FB.classifier.preprocess(null).normalised, '');
      assert.equal(FB.classifier.preprocess(undefined).wordCount, 0);
    });

    t.it('marks very long input as truncated and caps what the model sees', function (assert) {
      var long = new Array(3000).join('stress ');
      var pre = FB.classifier.preprocess(long);
      assert.ok(pre.truncated);
      assert.atMost(pre.forModel.length, FB.classifier.MAX_CHARS);
    });

    t.it('normalises curly apostrophes so contractions still match', function (assert) {
      var pre = FB.classifier.preprocess('I can’t start');
      assert.equal(pre.normalised.indexOf("can't") !== -1, true);
    });
  });

  describe('Lexical scoring', function (t) {
    t.it('produces scores between 0 and 1 for every signal', function (assert) {
      var result = analyse('I have three tests next week and I keep putting everything off.');
      FB.classifier.SIGNALS.forEach(function (signal) {
        var score = result.scores[signal.id];
        assert.ok(score >= 0 && score <= 1, signal.id + ' score out of range: ' + score);
      });
    });

    t.it('is deterministic for identical input', function (assert) {
      var a = analyse('The deadline is tomorrow and I have not started.');
      var b = analyse('The deadline is tomorrow and I have not started.');
      assert.deepEqual(a.scores, b.scores);
      assert.deepEqual(a.ranked.map(function (r) { return r.id; }), b.ranked.map(function (r) { return r.id; }));
    });

    t.it('detects avoidance in procrastination wording', function (assert) {
      var result = analyse('I keep putting it off and I cannot make myself start.');
      assert.equal(topId(result), 'avoidance');
    });

    t.it('detects deadline pressure', function (assert) {
      var result = analyse('My essay is due tomorrow and I am running out of time.');
      assert.includes(result.reportable.map(function (s) { return s.id; }), 'deadline-pressure');
    });

    t.it('detects overwhelm', function (assert) {
      var result = analyse('There is just too much going on and I do not know where to start.');
      assert.equal(topId(result), 'overwhelm');
    });

    t.it('detects fear of failure', function (assert) {
      var result = analyse('I am terrified I will fail and let everyone down.');
      assert.includes(result.reportable.map(function (s) { return s.id; }), 'fear-of-failure');
    });

    t.it('detects sleep strain', function (assert) {
      var result = analyse('I have been up until 3am all week and I am exhausted.');
      assert.includes(result.reportable.map(function (s) { return s.id; }), 'sleep-strain');
    });

    t.it('reports low stress when nothing points at pressure', function (assert) {
      var result = analyse('Things are going pretty well, I feel calm and on top of my work.');
      assert.equal(topId(result), 'low-stress');
    });

    t.it('never reports low stress alongside real signals', function (assert) {
      var result = analyse('Everything is fine except I have four deadlines and cannot sleep.');
      var ids = result.reportable.map(function (s) { return s.id; });
      if (ids.length > 1) assert.excludes(ids, 'low-stress');
    });

    t.it('caps repeated words so one term cannot dominate', function (assert) {
      var once = analyse('I have a deadline.');
      var many = analyse('deadline deadline deadline deadline deadline deadline deadline deadline');
      assert.ok(many.scores['deadline-pressure'] < 1);
      assert.ok(many.scores['deadline-pressure'] >= once.scores['deadline-pressure']);
    });

    t.it('reports at most three signals', function (assert) {
      var result = analyse('Three tests, an argument with my friend, no sleep, a deadline tomorrow, and I am scared I will fail and I cannot start.');
      assert.atMost(result.reportable.length, 3);
    });
  });

  describe('Pattern detection', function (t) {
    t.it('flags all-or-nothing wording only when repeated', function (assert) {
      var single = analyse('Everything is due next week.');
      var repeated = analyse('Everything always goes wrong and nothing I do is ever enough.');
      var ids = function (r) { return r.patterns.map(function (p) { return p.id; }); };
      assert.excludes(ids(single), 'all-or-nothing');
      assert.includes(ids(repeated), 'all-or-nothing');
    });

    t.it('flags worst-case wording', function (assert) {
      var result = analyse('If I fail this my whole future is over.');
      assert.includes(result.patterns.map(function (p) { return p.id; }), 'catastrophising');
    });

    t.it('flags comparison wording', function (assert) {
      var result = analyse('Everyone else seems so far ahead of me.');
      assert.includes(result.patterns.map(function (p) { return p.id; }), 'comparison');
    });

    t.it('returns no more than four patterns', function (assert) {
      var result = analyse('Everything always goes wrong, my whole future is over, I am so stupid, everyone else is better than me, there is no time, they must think I am useless, and no one knows.');
      assert.atMost(result.patterns.length, 4);
    });
  });

  describe('Pressure estimate', function (t) {
    t.it('stays within 1 and 10', function (assert) {
      var high = analyse('I am panicking, I cannot cope, everything is due tomorrow!!!', { pressure: 5, timeframe: 'today' });
      var low = analyse('Nothing much going on, feeling calm.', { pressure: 1, timeframe: 'none' });
      assert.ok(high.pressure.value >= 1 && high.pressure.value <= 10);
      assert.ok(low.pressure.value >= 1 && low.pressure.value <= 10);
    });

    t.it('rises with the self-reported slider', function (assert) {
      var text = 'I have a test coming up and I am behind on the reading.';
      var low = analyse(text, { pressure: 1 });
      var high = analyse(text, { pressure: 5 });
      assert.greater(high.pressure.value, low.pressure.value);
    });

    t.it('rises when the deadline is closer', function (assert) {
      var text = 'I have a test and I am behind on the reading.';
      var far = analyse(text, { pressure: 3, timeframe: 'later' });
      var near = analyse(text, { pressure: 3, timeframe: 'today' });
      assert.greater(near.pressure.value, far.pressure.value);
    });

    t.it('keeps a clearly calm entry low even with a high slider', function (assert) {
      var result = analyse('Everything is calm and under control, nothing much is going on.', { pressure: 5 });
      assert.atMost(result.pressure.value, 4);
    });

    t.it('exposes a breakdown that adds up to something explainable', function (assert) {
      var result = analyse('My exam is tomorrow and I have not started.', { pressure: 4, timeframe: 'tomorrow' });
      assert.equal(result.pressure.breakdown.length, 4);
      result.pressure.breakdown.forEach(function (row) {
        assert.ok(typeof row.value === 'number');
        assert.ok(typeof row.note === 'string');
      });
    });

    t.it('assigns a band consistent with the value', function (assert) {
      assert.equal(FB.classifier.pressureBand(2), 'low');
      assert.equal(FB.classifier.pressureBand(5), 'moderate');
      assert.equal(FB.classifier.pressureBand(8), 'high');
      assert.equal(FB.classifier.pressureBand(10), 'very high');
    });
  });

  describe('Semantic scoring maths', function (t) {
    t.it('cosine of a vector with itself is 1', function (assert) {
      var v = [0.2, 0.5, -0.1, 0.9];
      assert.ok(Math.abs(FB.classifier.cosine(v, v) - 1) < 1e-9);
    });

    t.it('cosine of orthogonal vectors is 0', function (assert) {
      assert.equal(FB.classifier.cosine([1, 0], [0, 1]), 0);
    });

    t.it('handles a zero vector without dividing by zero', function (assert) {
      assert.equal(FB.classifier.cosine([0, 0], [1, 1]), 0);
    });

    t.it('blending with no semantic scores returns the lexical scores unchanged', function (assert) {
      var lexical = {};
      FB.classifier.SIGNALS.forEach(function (s, i) { lexical[s.id] = i / 20; });
      var combined = FB.classifier.combineScores(lexical, null);
      assert.deepEqual(combined, lexical);
    });

    t.it('blend weights sum to one', function (assert) {
      var sum = FB.classifier.BLEND.lexical + FB.classifier.BLEND.semantic;
      assert.ok(Math.abs(sum - 1) < 1e-9, 'weights sum to ' + sum);
    });
  });

  describe('Input validation', function (t) {
    t.it('rejects empty input', function (assert) {
      assert.equal(FB.pipeline.validate('').ok, false);
      assert.equal(FB.pipeline.validate('').code, 'empty');
    });

    t.it('rejects whitespace-only input', function (assert) {
      var result = FB.pipeline.validate('    \n\t  ');
      assert.equal(result.ok, false);
      assert.equal(result.code, 'whitespace');
    });

    t.it('rejects input that is too short to work with', function (assert) {
      assert.equal(FB.pipeline.validate('stressed').code, 'short');
    });

    t.it('accepts a normal entry', function (assert) {
      var result = FB.pipeline.validate('I have three tests next week and I have not started revising.');
      assert.equal(result.ok, true);
      assert.equal(result.code, 'ok');
    });

    t.it('accepts long input but warns that it will be truncated', function (assert) {
      var text = new Array(2600).join('a');
      var result = FB.pipeline.validate(text);
      assert.equal(result.ok, true);
      assert.equal(result.code, 'truncate');
    });

    t.it('rejects input beyond the hard limit', function (assert) {
      var text = new Array(FB.pipeline.HARD_MAX_CHARS + 50).join('b');
      assert.equal(FB.pipeline.validate(text).ok, false);
    });

    t.it('never throws on unexpected types', function (assert) {
      assert.equal(FB.pipeline.validate(null).ok, false);
      assert.equal(FB.pipeline.validate(undefined).ok, false);
      assert.equal(FB.pipeline.validate(12345).code, 'short');
    });
  });
})(typeof window !== 'undefined' ? window.FB : global.FB);
