/**
 * Recommendation engine.
 *
 * Everything in this file is deterministic. Given the same stress profile it
 * returns the same plan, every time, which is what makes the demo reliable and
 * the behaviour testable. No text here is model-generated: the model's only
 * contribution upstream is which signals scored highest.
 */
(function (FB) {
  'use strict';

  var TOPIC_LABEL = {
    school: 'school',
    college: 'college applications',
    friends: 'friendships',
    family: 'family',
    activities: 'activities outside class',
    work: 'work',
    health: 'health',
    other: 'this'
  };

  /**
   * Nouns worth quoting back to the user so the plan reads as being about
   * their situation rather than about stress in general. Matching is done on
   * the normalised text and the phrase is echoed, never rewritten.
   */
  var SUBJECT_PATTERNS = [
    /\b((?:three|four|five|six|seven|eight|nine|ten|two|\d+)\s+(?:college\s+application\s+deadlines?|college\s+applications?|applications?|tests?|exams?|essays?|assignments?|projects?|papers?|finals?|deadlines?|midterms?))\b/,
    /\b((?:college|university|scholarship)\s+applications?)\b/,
    /\b((?:my|the)\s+(?:presentation|speech|recital|audition|interview|tryout|performance|competition))\b/,
    /\b((?:my|the)\s+(?:final|midterm|exam|test|essay|paper|project|thesis|portfolio|assignment))\b/,
    /\b(group\s+project)\b/,
    /\b(driving\s+test)\b/
  ];

  function extractSubject(normalisedText) {
    for (var i = 0; i < SUBJECT_PATTERNS.length; i++) {
      var m = normalisedText.match(SUBJECT_PATTERNS[i]);
      if (m && m[1]) {
        return m[1].replace(/^(my|the)\s+/, '');
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Snapshot language                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * A one-sentence read of the situation, keyed on the primary signal. The
   * wording is careful: it describes what the language suggests, not what is
   * true about the person.
   */
  var PRIMARY_READ = {
    'deadline-pressure': 'Most of the weight here is coming from a fixed date rather than from the work itself.',
    'overwhelm': 'The situation seems to be sitting in your head as one large block rather than as separate pieces.',
    'uncertainty': 'A lot of the pressure looks like it is coming from not knowing what is actually required.',
    'avoidance': 'The gap between wanting to start and starting is doing more damage here than the task is.',
    'rumination': 'The thinking about this appears to be looping rather than moving toward a decision.',
    'fear-of-failure': 'The wording points at an outcome that feels final, which tends to make the work harder to approach.',
    'social-pressure': 'A good part of this is about other people, which is a different problem from the workload itself.',
    'workload-pressure': 'The issue reads as volume. There are several real commitments competing for the same hours.',
    'sleep-strain': 'Being short on rest is likely making everything else here feel steeper than it is.',
    'low-stress': 'Nothing in what you wrote points at a strong source of pressure right now.'
  };

  /** The "what may help first" paragraph, again keyed on the primary signal. */
  var FIRST_STEP_READ = {
    'deadline-pressure': 'You may not need to solve the whole thing right now. The most useful first move is usually to pin down the real dates and the time you actually have, so the work stops competing with the unknown.',
    'overwhelm': 'You do not need a plan for everything before you can do anything. Getting it out of your head and onto a page is usually what makes the next step visible.',
    'uncertainty': 'Before working harder, it is often worth reducing the unknown. One question asked, or one requirement checked, can remove more pressure than an hour of effort.',
    'avoidance': 'The goal right now is not finishing. It is starting badly, on purpose, for two minutes. Momentum is easier to steer than to create.',
    'rumination': 'Thinking about this more is unlikely to resolve it. Putting the loop on paper and then doing one small physical thing tends to break it better than reasoning with it.',
    'fear-of-failure': 'It helps to separate what you know from what you are predicting, and then to decide what a good enough version actually looks like before you start.',
    'social-pressure': 'It is worth sorting what is genuinely yours to influence from what is not, and then choosing one direct, small conversation rather than rehearsing all of them.',
    'workload-pressure': 'With this much on, sequencing matters more than effort. Naming the one thing that unlocks the most is usually the highest-value few minutes you can spend.',
    'sleep-strain': 'Rest is not the reward for finishing. Setting a defined stopping point tonight will probably do more for tomorrow than the extra hour would.',
    'low-stress': 'There is nothing urgent to fix here. A short check-in is a reasonable way to stay ahead of things rather than catch up later.'
  };

  /**
   * Human-facing driver phrasing. Signals are internal ids; drivers are what
   * the student reads. Some drivers deliberately differ from the signal label
   * so the snapshot does not read like a list of categories.
   */
  var DRIVER_PHRASE = {
    'deadline-pressure': 'A date that is close',
    'overwhelm': 'More at once than feels holdable',
    'uncertainty': 'Not knowing what is actually required',
    'avoidance': 'Difficulty getting started',
    'rumination': 'Thoughts that keep circling back',
    'fear-of-failure': 'Fear of falling short',
    'social-pressure': 'Pressure involving other people',
    'workload-pressure': 'Too many commitments in the same hours',
    'sleep-strain': 'Running low on rest',
    'low-stress': 'Nothing pressing detected'
  };

  /* ------------------------------------------------------------------ */
  /* Exercise selection                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Score every exercise in a stage against the profile and return the best.
   *
   * Scoring:
   *   + signal score for each profile signal the exercise addresses
   *   + 0.35 bonus if it addresses the primary signal
   *   + small context adjustments (timeframe, topic)
   *   - 0.5 if the user already completed it in this plan
   *
   * Ties are broken by library order, which keeps output reproducible.
   */
  function pickForStage(stage, profile, options) {
    options = options || {};
    var candidates = FB.exercises.byStage(stage);
    var ranked = profile.ranked || [];
    var primary = profile.primarySignal;
    var exclude = options.exclude || [];

    var scored = candidates.map(function (exercise, index) {
      var score = 0;

      ranked.forEach(function (signal) {
        if (exercise.signals.indexOf(signal.id) !== -1) {
          score += signal.score;
        }
      });

      if (primary && exercise.signals.indexOf(primary) !== -1) {
        score += 0.35;
      }

      score += contextAdjustment(exercise, profile);

      if (exclude.indexOf(exercise.id) !== -1) {
        score -= 0.5;
      }

      return { exercise: exercise, score: score, index: index };
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    return scored[0] ? scored[0].exercise : candidates[0];
  }

  /**
   * Small, explicit nudges from the structured fields the user filled in.
   * Kept modest so the language signals stay the dominant input.
   */
  function contextAdjustment(exercise, profile) {
    var ctx = profile.context || {};
    var adj = 0;

    if (ctx.timeframe === 'today' || ctx.timeframe === 'tomorrow') {
      // With a very close deadline, shorter exercises are more realistic.
      if (exercise.durationSeconds <= 180) adj += 0.15;
      if (exercise.durationSeconds >= 480) adj -= 0.2;
      if (exercise.id === 'deadline-inventory') adj += 0.1;
    }
    if (ctx.timeframe === 'none' || ctx.timeframe === 'later') {
      if (exercise.id === 'wind-down-plan') adj += 0.1;
      if (exercise.id === 'deadline-inventory') adj -= 0.2;
    }
    if (ctx.topic === 'friends' || ctx.topic === 'family') {
      if (exercise.id === 'one-conversation') adj += 0.3;
      if (exercise.id === 'controllable-check') adj += 0.2;
      if (exercise.id === 'deadline-inventory') adj -= 0.3;
    }
    if (ctx.topic === 'college') {
      if (exercise.id === 'deadline-inventory') adj += 0.2;
      if (exercise.id === 'good-enough-definition') adj += 0.15;
    }
    if (ctx.topic === 'health') {
      if (exercise.category === 'Breathe' || exercise.category === 'Ground') adj += 0.15;
    }
    if (profile.pressure && profile.pressure.value >= 8) {
      // At the top of the range, start with something physical and short.
      if (exercise.category === 'Breathe') adj += 0.2;
    }
    if (profile.pressure && profile.pressure.value <= 3) {
      if (exercise.id === 'steady-check') adj += 0.4;
    }
    return adj;
  }

  /* ------------------------------------------------------------------ */
  /* Stage framing                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * The sentence that explains why this particular exercise is the calm,
   * clarify, or act step for this particular profile.
   */
  function stageRationale(stage, profile) {
    var primary = profile.primarySignal;
    // Only the quoted subject is substituted into a sentence. Topic labels are
    // category names, and "make friendships smaller" does not read as English.
    var about = profile.subject || 'this';

    if (stage === 'calm') {
      if (primary === 'sleep-strain') return 'You are working from a low battery, so the first step is physical rather than mental.';
      if (primary === 'social-pressure') return 'Before deciding anything about other people, it helps to be out of the reactive state.';
      if (profile.pressure && profile.pressure.value >= 8) return 'The pressure reading is high enough that thinking clearly is genuinely harder right now. Start here.';
      return 'A short physical step first, because it is the fastest part of this to change.';
    }

    if (stage === 'clarify') {
      if (primary === 'overwhelm') return 'Next, get ' + about + ' out of your head and into pieces you can see.';
      if (primary === 'fear-of-failure') return 'Next, separate what you know about ' + about + ' from what you are predicting about it.';
      if (primary === 'uncertainty') return 'Next, narrow down what is actually being asked of you here.';
      if (primary === 'social-pressure') return 'Next, sort what you can influence here from what you cannot.';
      return 'Next, break ' + about + ' into something smaller and more specific than the version in your head.';
    }

    if (primary === 'avoidance') return 'Then one deliberately small start, because starting is the part that is actually hard.';
    if (primary === 'deadline-pressure') return 'Then one concrete block of work on ' + about + ', chosen rather than drifted into.';
    if (primary === 'social-pressure') return 'Then one specific action involving the person this is really about.';
    return 'Then one action small enough that it can genuinely happen today.';
  }

  /* ------------------------------------------------------------------ */
  /* Plan assembly                                                       */
  /* ------------------------------------------------------------------ */

  function buildPlan(profile, options) {
    options = options || {};
    var calm = pickForStage('calm', profile, options);
    var clarify = pickForStage('clarify', profile, options);
    var act = pickForStage('act', profile, options);

    return {
      createdAt: Date.now(),
      profileId: profile.id,
      headline: planHeadline(profile),
      steps: [
        { stage: 'calm', label: 'Calm', exerciseId: calm.id, rationale: stageRationale('calm', profile), done: false },
        { stage: 'clarify', label: 'Clarify', exerciseId: clarify.id, rationale: stageRationale('clarify', profile), done: false },
        { stage: 'act', label: 'Act', exerciseId: act.id, rationale: stageRationale('act', profile), done: false }
      ]
    };
  }

  function planHeadline(profile) {
    var subject = profile.subject;
    if (subject) {
      return 'A plan for ' + subject;
    }
    var topic = profile.context && profile.context.topic;
    if (topic && TOPIC_LABEL[topic] && topic !== 'other') {
      return 'A plan for what is going on with ' + TOPIC_LABEL[topic];
    }
    return 'A plan for what you described';
  }

  /**
   * Alternatives for a stage, so the user can swap a step without regenerating
   * the whole plan. Returns up to three, best first, excluding the current one.
   */
  function alternativesForStage(stage, profile, currentId) {
    var candidates = FB.exercises.byStage(stage);
    var ranked = profile.ranked || [];

    return candidates
      .map(function (exercise, index) {
        var score = 0;
        ranked.forEach(function (signal) {
          if (exercise.signals.indexOf(signal.id) !== -1) score += signal.score;
        });
        score += contextAdjustment(exercise, profile);
        return { exercise: exercise, score: score, index: index };
      })
      .filter(function (entry) { return entry.exercise.id !== currentId; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .slice(0, 3)
      .map(function (entry) { return entry.exercise; });
  }

  function driversFor(profile) {
    return (profile.reportable || []).map(function (signal) {
      return {
        id: signal.id,
        label: DRIVER_PHRASE[signal.id] || signal.label,
        detail: signal.blurb,
        score: signal.score
      };
    });
  }

  function primaryRead(profile) {
    return PRIMARY_READ[profile.primarySignal] || PRIMARY_READ['overwhelm'];
  }

  function firstStepRead(profile) {
    return FIRST_STEP_READ[profile.primarySignal] || FIRST_STEP_READ['overwhelm'];
  }

  FB.recommendations = {
    TOPIC_LABEL: TOPIC_LABEL,
    DRIVER_PHRASE: DRIVER_PHRASE,
    extractSubject: extractSubject,
    pickForStage: pickForStage,
    buildPlan: buildPlan,
    alternativesForStage: alternativesForStage,
    stageRationale: stageRationale,
    driversFor: driversFor,
    primaryRead: primaryRead,
    firstStepRead: firstStepRead,
    planHeadline: planHeadline
  };
})(window.FB = window.FB || {});
