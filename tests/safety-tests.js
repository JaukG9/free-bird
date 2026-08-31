/**
 * Safety scan tests.
 *
 * The scan is the one part of Free Bird where a mistake matters most, so these
 * tests are written as behaviour contracts rather than as accuracy targets.
 * They cover three things: it fires on clear crisis language, it does not fire
 * on ordinary school hyperbole, and it blocks the coaching pipeline when it
 * does fire.
 */
(function (FB) {
  'use strict';

  var describe = FB.testHarness.describe;

  var CRISIS_EXAMPLES = [
    'I want to kill myself',
    'I have been thinking about ending my life',
    'I do not want to live anymore',
    'I have been hurting myself when it gets bad',
    'I have been cutting myself again',
    'Everyone would be better off without me',
    'There is no point in living',
    'I took all the pills in the cabinet',
    'I cannot keep myself safe tonight',
    'I am not safe at home',
    'I am going to hurt someone',
    'I wrote a goodbye note'
  ];

  var ORDINARY_EXAMPLES = [
    'This chemistry course is killing me',
    'I was dying of boredom in that lecture',
    'I absolutely killed that presentation',
    'I am dying to finish this semester',
    'I am dead tired after practice',
    'I could murder a coffee right now',
    'The deadline is killing my weekend',
    'I have three tests next week and I keep putting everything off',
    'My friend has been off with me and I do not know why',
    'I am so stressed about my college applications',
    'I am terrified I am going to fail this exam',
    'I feel like I am drowning in homework'
  ];

  describe('Safety scan, crisis language', function (t) {
    CRISIS_EXAMPLES.forEach(function (text) {
      t.it('flags: ' + text, function (assert) {
        var result = FB.safety.scan(text);
        assert.equal(result.level, 'crisis', 'got level ' + result.level + ' for: ' + text);
        assert.ok(FB.safety.isBlocking(result));
      });
    });
  });

  describe('Safety scan, ordinary student language', function (t) {
    ORDINARY_EXAMPLES.forEach(function (text) {
      t.it('does not flag: ' + text, function (assert) {
        var result = FB.safety.scan(text);
        assert.notOk(FB.safety.isBlocking(result), 'incorrectly blocked: ' + text + ' (' + result.reason + ')');
      });
    });
  });

  describe('Safety scan, structure', function (t) {
    t.it('returns level none for empty input', function (assert) {
      assert.equal(FB.safety.scan('').level, 'none');
      assert.equal(FB.safety.scan(null).level, 'none');
      assert.equal(FB.safety.scan(undefined).level, 'none');
    });

    t.it('never returns a numeric risk score', function (assert) {
      var result = FB.safety.scan('I want to kill myself');
      assert.equal(typeof result.score, 'undefined');
      assert.equal(typeof result.risk, 'undefined');
      assert.equal(typeof result.probability, 'undefined');
    });

    t.it('reports which patterns matched, for the explanation panel', function (assert) {
      var result = FB.safety.scan('I have been hurting myself');
      assert.ok(Array.isArray(result.matched));
      assert.greater(result.matched.length, 0);
    });

    t.it('is case insensitive', function (assert) {
      assert.equal(FB.safety.scan('I WANT TO KILL MYSELF').level, 'crisis');
    });

    t.it('handles curly apostrophes', function (assert) {
      assert.equal(FB.safety.scan('I don’t want to live anymore').level, 'crisis');
    });

    t.it('treats hopelessness as concern rather than a hard stop', function (assert) {
      var result = FB.safety.scan('I feel completely hopeless about all of this');
      assert.equal(result.level, 'concern');
      assert.notOk(FB.safety.isBlocking(result));
    });

    t.it('steps a crisis phrase down to concern when it is about someone else', function (assert) {
      var result = FB.safety.scan('I am worried about my friend, she said she wanted to end her life');
      assert.equal(result.level, 'concern');
    });

    t.it('masks hyperbole spans rather than deleting the whole text', function (assert) {
      var masked = FB.safety.maskHyperbole('this is killing me and i want to die');
      assert.ok(masked.indexOf('want to die') !== -1, 'real signal was masked away');
    });
  });

  describe('Safety in the pipeline', function (t) {
    t.it('blocks the analysis and returns no plan', function (assert) {
      return FB.pipeline.analyze('I do not want to live anymore', {}).then(function (profile) {
        assert.equal(profile.blocked, true);
        assert.equal(typeof profile.plan, 'undefined');
        assert.equal(typeof profile.pressure, 'undefined');
        assert.equal(profile.safety.level, 'crisis');
      });
    });

    t.it('produces a full profile for ordinary input', function (assert) {
      return FB.pipeline.analyze('I have three tests next week and I keep putting it off.', { pressure: 4 }).then(function (profile) {
        assert.equal(profile.blocked, false);
        assert.ok(profile.plan);
        assert.equal(profile.plan.steps.length, 3);
        assert.ok(profile.pressure.value >= 1);
      });
    });

    t.it('blocks a Wingman message that contains crisis language', function (assert) {
      return FB.pipeline.respond('I want to kill myself', { hasAnalysis: false }, 0).then(function (reply) {
        assert.equal(reply.blocked, true);
        assert.equal(typeof reply.text, 'undefined');
      });
    });

    t.it('answers an ordinary Wingman message', function (assert) {
      return FB.pipeline.respond('I still cannot make myself start.', { hasAnalysis: false, drivers: [] }, 0).then(function (reply) {
        assert.equal(reply.blocked, false);
        assert.ok(reply.text.length > 40);
        assert.equal(reply.method, 'rules');
      });
    });
  });
})(typeof window !== 'undefined' ? window.FB : global.FB);
