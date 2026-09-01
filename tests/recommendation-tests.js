/**
 * Recommendation and plan tests.
 *
 * The plan must be deterministic, complete, adapted to the profile, and
 * traceable back to the exercise library.
 */
(function (FB) {
  'use strict';

  var describe = FB.testHarness.describe;

  function profileFor(text, context) {
    var pre = FB.classifier.preprocess(text);
    var lexical = FB.classifier.scoreLexical(pre);
    var combined = FB.classifier.combineScores(lexical.scores, null);
    var ranked = FB.classifier.rankSignals(combined);
    var reportable = FB.classifier.selectReportable(ranked);
    return {
      id: 'test',
      context: context || {},
      scores: combined,
      ranked: ranked,
      reportable: reportable,
      primarySignal: reportable.length ? reportable[0].id : 'low-stress',
      patterns: FB.classifier.detectPatterns(pre),
      pressure: FB.classifier.estimatePressure(combined, pre, context || {}),
      subject: FB.recommendations.extractSubject(pre.normalised)
    };
  }

  describe('Exercise library integrity', function (t) {
    t.it('every exercise has the fields the interface renders', function (assert) {
      FB.exercises.all.forEach(function (exercise) {
        assert.ok(exercise.id, 'missing id');
        assert.ok(exercise.title, exercise.id + ' missing title');
        assert.ok(exercise.duration, exercise.id + ' missing duration');
        assert.ok(exercise.durationSeconds > 0, exercise.id + ' missing durationSeconds');
        assert.ok(exercise.summary, exercise.id + ' missing summary');
        assert.ok(exercise.why, exercise.id + ' missing why');
        assert.ok(exercise.evidenceNote, exercise.id + ' missing evidenceNote');
        assert.greater(exercise.steps.length, 2, exercise.id + ' needs at least three steps');
        assert.greater(exercise.signals.length, 0, exercise.id + ' has no signals');
      });
    });

    t.it('exercise ids are unique', function (assert) {
      var seen = {};
      FB.exercises.all.forEach(function (exercise) {
        assert.notOk(seen[exercise.id], 'duplicate id ' + exercise.id);
        seen[exercise.id] = true;
      });
    });

    t.it('every exercise belongs to a known category and stage', function (assert) {
      var stages = ['calm', 'clarify', 'act'];
      FB.exercises.all.forEach(function (exercise) {
        assert.includes(FB.exercises.categories, exercise.category, exercise.id + ' has unknown category');
        assert.includes(stages, exercise.stage, exercise.id + ' has unknown stage');
      });
    });

    t.it('every referenced signal exists in the taxonomy', function (assert) {
      var known = FB.classifier.SIGNALS.map(function (s) { return s.id; });
      FB.exercises.all.forEach(function (exercise) {
        exercise.signals.forEach(function (signal) {
          assert.includes(known, signal, exercise.id + ' references unknown signal ' + signal);
        });
      });
    });

    t.it('every stage has at least three options so a swap is always possible', function (assert) {
      ['calm', 'clarify', 'act'].forEach(function (stage) {
        assert.greater(FB.exercises.byStage(stage).length, 2, stage + ' has too few exercises');
      });
    });

    t.it('no exercise claims to be clinically proven', function (assert) {
      var banned = /clinically proven|guaranteed|cures?\b|treats? (anxiety|depression)|medically proven/i;
      FB.exercises.all.forEach(function (exercise) {
        var blob = [exercise.summary, exercise.why, exercise.evidenceNote].concat(exercise.steps).join(' ');
        assert.notOk(banned.test(blob), exercise.id + ' contains a clinical claim');
      });
    });

    t.it('no user-facing exercise copy contains an em dash', function (assert) {
      FB.exercises.all.forEach(function (exercise) {
        var blob = [exercise.title, exercise.summary, exercise.why, exercise.evidenceNote].concat(exercise.steps).join(' ');
        assert.equal(blob.indexOf('—'), -1, exercise.id + ' contains an em dash');
      });
    });
  });

  describe('Plan construction', function (t) {
    t.it('always returns exactly three ordered stages', function (assert) {
      var plan = FB.recommendations.buildPlan(profileFor('I have three tests next week and I keep putting it off.'));
      assert.equal(plan.steps.length, 3);
      assert.deepEqual(plan.steps.map(function (s) { return s.stage; }), ['calm', 'clarify', 'act']);
    });

    t.it('references exercises that exist', function (assert) {
      var plan = FB.recommendations.buildPlan(profileFor('My exam is tomorrow and I have not started.'));
      plan.steps.forEach(function (step) {
        assert.ok(FB.exercises.get(step.exerciseId), 'missing exercise ' + step.exerciseId);
      });
    });

    t.it('gives each step a rationale', function (assert) {
      var plan = FB.recommendations.buildPlan(profileFor('I cannot make myself start the essay.'));
      plan.steps.forEach(function (step) {
        assert.greater(step.rationale.length, 20, step.stage + ' rationale is too thin');
      });
    });

    t.it('is deterministic for the same profile', function (assert) {
      var text = 'I have three college application deadlines and I keep putting everything off.';
      var a = FB.recommendations.buildPlan(profileFor(text, { topic: 'college', timeframe: 'next-week', pressure: 4 }));
      var b = FB.recommendations.buildPlan(profileFor(text, { topic: 'college', timeframe: 'next-week', pressure: 4 }));
      assert.deepEqual(
        a.steps.map(function (s) { return s.exerciseId; }),
        b.steps.map(function (s) { return s.exerciseId; })
      );
    });

    t.it('adapts to different profiles rather than returning one fixed plan', function (assert) {
      var avoidance = FB.recommendations.buildPlan(profileFor('I keep putting it off and cannot make myself start.'));
      var social = FB.recommendations.buildPlan(profileFor('My best friend has been off with me and my parents keep bringing it up.', { topic: 'friends' }));
      assert.notEqual(
        avoidance.steps.map(function (s) { return s.exerciseId; }).join(),
        social.steps.map(function (s) { return s.exerciseId; }).join(),
        'two very different profiles produced an identical plan'
      );
    });

    t.it('prefers a conversation step when the topic is friends', function (assert) {
      var plan = FB.recommendations.buildPlan(profileFor('My friend has been ignoring me and I do not know what to say.', { topic: 'friends' }));
      var ids = plan.steps.map(function (s) { return s.exerciseId; });
      assert.includes(ids, 'one-conversation');
    });

    t.it('prefers short exercises when the deadline is today', function (assert) {
      var plan = FB.recommendations.buildPlan(profileFor('The paper is due today and I am panicking.', { timeframe: 'today', pressure: 5 }));
      var calm = FB.exercises.get(plan.steps[0].exerciseId);
      assert.atMost(calm.durationSeconds, 180);
    });

    t.it('offers alternatives that exclude the current choice', function (assert) {
      var profile = profileFor('I am overwhelmed and do not know where to start.');
      var plan = FB.recommendations.buildPlan(profile);
      var alternatives = FB.recommendations.alternativesForStage('act', profile, plan.steps[2].exerciseId);
      assert.greater(alternatives.length, 0);
      alternatives.forEach(function (exercise) {
        assert.notEqual(exercise.id, plan.steps[2].exerciseId);
        assert.equal(exercise.stage, 'act');
      });
    });

    t.it('produces a headline that mentions the situation when one is detectable', function (assert) {
      var profile = profileFor('I have three college application deadlines coming up.', { topic: 'college' });
      assert.ok(FB.recommendations.planHeadline(profile).indexOf('college application') !== -1);
    });
  });

  describe('Snapshot language', function (t) {
    t.it('has a reading and a first step for every signal in the taxonomy', function (assert) {
      FB.classifier.SIGNALS.forEach(function (signal) {
        var profile = { primarySignal: signal.id, reportable: [], ranked: [], context: {} };
        assert.ok(FB.recommendations.primaryRead(profile).length > 20, 'no reading for ' + signal.id);
        assert.ok(FB.recommendations.firstStepRead(profile).length > 20, 'no first step for ' + signal.id);
        assert.ok(FB.recommendations.DRIVER_PHRASE[signal.id], 'no driver phrase for ' + signal.id);
      });
    });

    t.it('never uses diagnostic language', function (assert) {
      var banned = /\byou have (anxiety|depression|a disorder|adhd)\b|\byou are (depressed|anxious|mentally ill)\b|\bdiagnos/i;
      FB.classifier.SIGNALS.forEach(function (signal) {
        var profile = { primarySignal: signal.id, reportable: [], ranked: [], context: {} };
        var blob = FB.recommendations.primaryRead(profile) + ' ' + FB.recommendations.firstStepRead(profile);
        assert.notOk(banned.test(blob), 'diagnostic language for ' + signal.id);
      });
    });

    t.it('contains no em dashes', function (assert) {
      FB.classifier.SIGNALS.forEach(function (signal) {
        var profile = { primarySignal: signal.id, reportable: [], ranked: [], context: {} };
        var blob = FB.recommendations.primaryRead(profile) + FB.recommendations.firstStepRead(profile) + FB.recommendations.DRIVER_PHRASE[signal.id];
        assert.equal(blob.indexOf('—'), -1, 'em dash for ' + signal.id);
      });
    });

    t.it('extracts the situation from common phrasings', function (assert) {
      assert.equal(FB.recommendations.extractSubject('i have three college application deadlines coming up'), 'three college application deadlines');
      assert.equal(FB.recommendations.extractSubject('i am worried about my presentation'), 'presentation');
      assert.equal(FB.recommendations.extractSubject('the group project is a mess'), 'group project');
      assert.equal(FB.recommendations.extractSubject('everything feels heavy today'), null);
    });
  });

  describe('Wingman composition', function (t) {
    var ctx = {
      hasAnalysis: true,
      subject: 'three college application deadlines',
      primarySignal: 'avoidance',
      drivers: [{ id: 'avoidance', label: 'Difficulty getting started' }],
      pressure: { value: 8, band: 'high' },
      plan: {
        steps: [
          { stage: 'calm', label: 'Calm', exerciseId: 'paced-breathing', done: false, rationale: 'Start here.' },
          { stage: 'clarify', label: 'Clarify', exerciseId: 'deadline-inventory', done: false, rationale: 'Then this.' },
          { stage: 'act', label: 'Act', exerciseId: 'two-minute-start', done: false, rationale: 'Then this.' }
        ]
      },
      completedExercises: []
    };

    t.it('composes a reply for every intent', function (assert) {
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        var text = FB.fallback.compose(intent.id, ctx, 0);
        assert.greater(text.length, 40, 'reply for ' + intent.id + ' is too short');
      });
    });

    t.it('varies its wording across turns', function (assert) {
      var first = FB.fallback.compose('cannot-start', ctx, 0);
      var second = FB.fallback.compose('cannot-start', ctx, 1);
      assert.notEqual(first, second, 'the same intent repeated itself verbatim');
    });

    t.it('is deterministic for the same intent and turn', function (assert) {
      assert.equal(FB.fallback.compose('overwhelmed', ctx, 3), FB.fallback.compose('overwhelmed', ctx, 3));
    });

    t.it('uses the session context rather than generic filler', function (assert) {
      var text = FB.fallback.compose('cannot-start', ctx, 0);
      assert.ok(text.indexOf('three college application deadlines') !== -1 || text.indexOf('Paced breathing') !== -1,
        'reply did not reference the session context');
    });

    t.it('matches the obvious intents lexically', function (assert) {
      assert.equal(FB.fallback.matchIntentLexically('I still cannot make myself start.').intent, 'cannot-start');
      assert.equal(FB.fallback.matchIntentLexically('Can you help me break this down?').intent, 'break-it-down');
      assert.equal(FB.fallback.matchIntentLexically('Can you help me think about this differently?').intent, 'reframe');
      assert.equal(FB.fallback.matchIntentLexically('Are you a real therapist?').intent, 'about-app');
    });

    t.it('falls back to the general intent when nothing matches', function (assert) {
      var match = FB.fallback.matchIntentLexically('purple bicycle sandwich');
      assert.equal(match.intent, 'general');
      assert.equal(match.confidence, null, 'a confidence figure was invented for a rule match');
    });

    t.it('never claims to be a therapist', function (assert) {
      var banned = /\bi am (a |your )?(therapist|counsell?or|doctor|psychiatrist)\b|\bi can diagnose\b/i;
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        for (var turn = 0; turn < 4; turn++) {
          assert.notOk(banned.test(FB.fallback.compose(intent.id, ctx, turn)), 'clinical claim in ' + intent.id);
        }
      });
    });

    t.it('contains no em dashes in any composed reply', function (assert) {
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        for (var turn = 0; turn < 4; turn++) {
          assert.equal(FB.fallback.compose(intent.id, ctx, turn).indexOf('—'), -1, 'em dash in ' + intent.id);
        }
      });
    });

    t.it('opens with something specific when there is an analysis', function (assert) {
      var opening = FB.fallback.openingMessage(ctx);
      assert.ok(opening.indexOf('three college application deadlines') !== -1);
      assert.ok(opening.indexOf('8') !== -1, 'the opening did not mention the pressure estimate');
    });

    t.it('opens honestly when there is nothing to work from', function (assert) {
      var opening = FB.fallback.openingMessage({ hasAnalysis: false });
      assert.ok(opening.indexOf('stress check') !== -1);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Wingman message reading and intent coverage                         */
  /* ------------------------------------------------------------------ */

  describe('Wingman message reading', function (t) {
    t.it('pulls the task out of the wording', function (assert) {
      assert.equal(FB.fallback.readMessage('I have not started my chem final yet').task, 'chem final');
      assert.equal(FB.fallback.readMessage('the group project is a mess').task, 'group project');
      assert.equal(FB.fallback.readMessage('I have three tests next week').task, 'three tests');
    });

    t.it('pulls out who the message is about, ready to say back', function (assert) {
      var read = FB.fallback.readMessage('my mom keeps asking about it');
      assert.equal(read.personRaw, 'my mom');
      // Echoed in the second person, so the reply does not say "my mom".
      assert.equal(read.person, 'your mom');
      assert.equal(FB.fallback.readMessage('nothing about anyone in particular').person, null);
    });

    t.it('pulls out when it is happening', function (assert) {
      assert.equal(FB.fallback.readMessage('it is due tomorrow').when, 'tomorrow');
      assert.ok(FB.fallback.readMessage('I have to hand it in on friday').when !== null);
    });

    t.it('recognises a short answer to a question', function (assert) {
      assert.ok(FB.fallback.readMessage('yeah').isAffirmative);
      assert.ok(FB.fallback.readMessage('not really').isNegative);
      assert.ok(FB.fallback.readMessage('idk').isShort);
    });

    t.it('never throws on unusual input', function (assert) {
      [null, undefined, '', '   ', 12345, '?????'].forEach(function (value) {
        var read = FB.fallback.readMessage(value);
        assert.ok(read && typeof read.text === 'string', 'failed on ' + JSON.stringify(value));
      });
    });
  });

  describe('Wingman intent coverage', function (t) {
    var cases = [
      ['I still cannot make myself start.', 'cannot-start'],
      ['Can you help me break this down?', 'break-it-down'],
      ['I know what to do but I am overwhelmed.', 'overwhelmed'],
      ['Can you help me think about this differently?', 'reframe'],
      ['I am terrified I am going to fail this.', 'fear'],
      ['There is not enough time left.', 'no-time'],
      ['My mom keeps bringing it up.', 'people'],
      ['Everyone else is way ahead of me.', 'comparison'],
      ['It has to be perfect and I keep rewriting it.', 'perfectionism'],
      ['I keep getting distracted and I cannot focus.', 'focus'],
      ['I have barely slept all week.', 'tired'],
      ['I wasted the whole day and I feel so lazy.', 'guilt'],
      ['I cannot decide which one to do first.', 'decide'],
      ['I cannot stop thinking about it.', 'rumination-loop'],
      ['I just needed to vent about it.', 'venting'],
      ['I already tried that and it did not work.', 'pushback'],
      ['What is my next step?', 'what-now'],
      ['Why did you pick that step for me?', 'explain-exercise'],
      ['Thanks, that actually helped.', 'positive'],
      ['Are you a real therapist?', 'about-app'],
      ['I have no idea what they want from this.', 'uncertainty'],
      ['hey', 'greeting']
    ];

    // Phrasings taken from how the wording actually arrives, rather than from
    // the anchor sentences, which the patterns were written alongside.
    var realWorld = [
      'everyone in my class seems way further ahead',
      'I am so behind it is not even funny',
      'I feel like the only one struggling',
      'I have five assignments and no idea which to do',
      'why does this always happen to me',
      'I keep saying I will do it later',
      'how do I stop caring so much what people think',
      'I have a presentation friday and I hate speaking',
      'can you just tell me what to do',
      'my brain will not shut up at night',
      'I got a bad grade and I cannot stop replaying it',
      'is my data safe here',
      'I do not even know what the teacher wants',
      'are you a real person'
    ];

    t.it('routes real phrasings somewhere more useful than the generic bucket', function (assert) {
      realWorld.forEach(function (message) {
        assert.notEqual(FB.fallback.matchIntentLexically(message).intent, 'general',
          'fell through to general: ' + message);
      });
    });

    t.it('routes each intent to itself', function (assert) {
      cases.forEach(function (pair) {
        assert.equal(FB.fallback.matchIntentLexically(pair[0]).intent, pair[1],
          'mismatched: ' + pair[0]);
      });
    });

    t.it('has a composer for every declared intent', function (assert) {
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        var pools = FB.fallback.COMPOSERS[intent.id];
        assert.ok(pools, 'no composer for ' + intent.id);
        ['reflect', 'insight', 'move', 'ask'].forEach(function (slot) {
          assert.greater(pools[slot].length, 2, intent.id + ' has too few ' + slot + ' options');
        });
      });
    });

    t.it('writes patterns in the contracted form normalisation produces', function (assert) {
      // normalize.js rewrites "is not" to "isn't" before the matcher sees the
      // text, so a pattern spelling out the long form can never fire.
      FB.fallback.INTENTS.forEach(function (intent) {
        intent.patterns.forEach(function (pattern) {
          var readable = pattern.re.source.replace(/\\s\+/g, ' ').replace(/\\b/g, '');
          FB.normalize.CONTRACTIONS.forEach(function (rule) {
            var probe = new RegExp(rule[0].source, 'i');
            assert.notOk(probe.test(readable),
              intent.id + ' pattern would be normalised away: ' + pattern.re.source);
          });
        });
      });
    });

    t.it('gives every intent anchors for the on-device matcher', function (assert) {
      FB.fallback.INTENTS.forEach(function (intent) {
        assert.greater(intent.anchors.length, 2, intent.id + ' has too few anchors');
      });
    });
  });

  describe('Wingman reply quality', function (t) {
    var ctx = {
      hasAnalysis: true,
      subject: 'three tests',
      primarySignal: 'avoidance',
      drivers: [{ id: 'avoidance', label: 'Difficulty getting started' }],
      pressure: { value: 7, band: 'high' },
      plan: {
        steps: [
          { stage: 'calm', label: 'Calm', exerciseId: 'one-minute-reset', done: false, rationale: 'Start here.' },
          { stage: 'clarify', label: 'Clarify', exerciseId: 'good-enough-definition', done: false, rationale: 'Then this.' },
          { stage: 'act', label: 'Act', exerciseId: 'two-minute-start', done: false, rationale: 'Then this.' }
        ]
      },
      completedExercises: []
    };

    t.it('does not repeat itself over a long run of the same intent', function (assert) {
      var seen = [];
      for (var turn = 0; turn < 6; turn++) {
        var reply = FB.fallback.compose('cannot-start', ctx, turn, {
          message: 'I still cannot start',
          recent: seen
        });
        assert.excludes(seen, reply, 'repeated a reply on turn ' + turn);
        seen.push(reply);
      }
    });

    t.it('quotes the user\'s own words back when they give one', function (assert) {
      var match = FB.fallback.matchIntentLexically('my mom keeps asking about it');
      var reply = FB.fallback.compose(match.intent, ctx, 0, { read: match.read });
      assert.ok(reply.indexOf('your mom') !== -1, 'the reply did not use their wording: ' + reply);
      assert.equal(reply.indexOf('my mom'), -1, 'the reply spoke in the first person: ' + reply);
    });

    t.it('never says my when echoing a person back', function (assert) {
      ['my mum', 'my dad', 'my parents', 'my coach', 'my best friend'].forEach(function (phrase) {
        var match = FB.fallback.matchIntentLexically(phrase + ' keeps bringing it up');
        for (var turn = 0; turn < 3; turn++) {
          var reply = FB.fallback.compose(match.intent, ctx, turn, { read: match.read });
          assert.equal(reply.indexOf(phrase), -1, 'said "' + phrase + '" back: ' + reply);
        }
      });
    });

    t.it('always ends with something the user can answer', function (assert) {
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        for (var turn = 0; turn < 3; turn++) {
          var reply = FB.fallback.compose(intent.id, ctx, turn);
          assert.ok(/[?.]$/.test(reply.trim()), intent.id + ' ended oddly: ' + reply);
        }
      });
    });

    t.it('references the session in every reply that has one to reference', function (assert) {
      var markers = ['three tests', 'One-minute reset', 'difficulty getting started', '7 out of 10',
        'Good enough definition', 'Two-minute start'];
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        for (var turn = 0; turn < 3; turn++) {
          var reply = FB.fallback.compose(intent.id, ctx, turn);
          var grounded = markers.some(function (marker) { return reply.indexOf(marker) !== -1; });
          // A long, specific answer is allowed to stand on its own.
          assert.ok(grounded || reply.length >= 260,
            'ungrounded short reply for ' + intent.id + ': ' + reply);
        }
      });
    });

    t.it('stays honest about what it is when asked', function (assert) {
      var reply = FB.fallback.compose('about-app', ctx, 0, { message: 'are you a real therapist?' });
      assert.ok(/not therapy|not a therapist|study and stress tool/i.test(reply),
        'did not decline the therapist framing: ' + reply);
    });

    t.it('works with no session context at all', function (assert) {
      FB.fallback.INTENTS.concat([{ id: 'general' }]).forEach(function (intent) {
        var reply = FB.fallback.compose(intent.id, { hasAnalysis: false }, 0);
        assert.greater(reply.length, 20, intent.id + ' produced nothing without a session');
      });
    });

    t.it('offers suggestions that fit the state of the session', function (assert) {
      var cold = FB.fallback.suggestionsFor({ hasAnalysis: false });
      assert.equal(cold.length, 4);
      var warm = FB.fallback.suggestionsFor(ctx);
      assert.equal(warm.length, 4);
      assert.notEqual(cold.join('|'), warm.join('|'), 'suggestions ignored the session');
    });
  });
})(typeof window !== 'undefined' ? window.FB : global.FB);
