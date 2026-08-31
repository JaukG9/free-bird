/**
 * Demo mode script.
 *
 * The demo is not a set of fake screens. It feeds a fixed scenario through the
 * same pipeline the app uses for real input, with the semantic scorer forced
 * off so the run is byte-for-byte reproducible on any machine and does not
 * require a model download before the walkthrough can start.
 *
 * Once the demo is running, "Use live AI" reruns the identical text through the
 * on-device model so the difference between the two paths can be shown side by
 * side. That is the only difference between demo mode and normal use.
 */
(function (FB) {
  'use strict';

  var SCENARIO = {
    text: 'I have three college application deadlines coming up and I keep putting everything off because I don\'t know where to start. Every time I open the essay document I close it again after two minutes. I keep thinking that if I get this wrong my whole future is basically over, and everyone else seems to have had theirs finished for weeks. I\'ve been up until 2am most nights this week and I\'m exhausted.',
    context: {
      topic: 'college',
      timeframe: 'next-week',
      pressure: 4
    }
  };

  /**
   * Wingman turns for the walkthrough. Each entry is a real user message that
   * is sent through FB.pipeline.respond, so the replies shown in the demo are
   * produced by the same matcher and composer that handle live input.
   */
  var CONVERSATION = [
    'I still cannot make myself start.',
    'Can you help me break this down?',
    'I am scared that whatever I write will not be good enough.'
  ];

  /** Check-in values used by the scripted run, clearly labelled in the UI. */
  var CHECKIN = {
    before: 8,
    change: 'a-little-better',
    note: 'The list is shorter than it felt. I know what the first thing is now.',
    after: 6
  };

  /**
   * Seed history so the Progress page has something to show during a five
   * minute presentation. Entries are tagged demo: true, are listed as sample
   * entries in the interface, and are removed by "Reset demo data".
   */
  function seedHistory(now) {
    var day = 24 * 60 * 60 * 1000;
    var base = now || Date.now();
    return [
      {
        id: 'demo-h1',
        demo: true,
        createdAt: base - (6 * day),
        subject: 'chemistry midterm',
        primarySignal: 'fear-of-failure',
        drivers: ['Fear of falling short', 'A date that is close'],
        pressureBefore: 7,
        pressureAfter: 5,
        change: 'a-little-better',
        exerciseId: 'facts-vs-fears',
        exerciseCategory: 'Think'
      },
      {
        id: 'demo-h2',
        demo: true,
        createdAt: base - (4 * day),
        subject: 'group project',
        primarySignal: 'social-pressure',
        drivers: ['Pressure involving other people', 'Not knowing what is actually required'],
        pressureBefore: 6,
        pressureAfter: 6,
        change: 'about-the-same',
        exerciseId: 'controllable-check',
        exerciseCategory: 'Think'
      },
      {
        id: 'demo-h3',
        demo: true,
        createdAt: base - (2 * day),
        subject: 'three tests',
        primarySignal: 'overwhelm',
        drivers: ['More at once than feels holdable', 'Difficulty getting started'],
        pressureBefore: 9,
        pressureAfter: 6,
        change: 'much-better',
        exerciseId: 'paced-breathing',
        exerciseCategory: 'Breathe'
      },
      {
        id: 'demo-h4',
        demo: true,
        createdAt: base - (1 * day),
        subject: 'college applications',
        primarySignal: 'avoidance',
        drivers: ['Difficulty getting started', 'A date that is close'],
        pressureBefore: 8,
        pressureAfter: 7,
        change: 'a-little-better',
        exerciseId: 'two-minute-start',
        exerciseCategory: 'Act'
      }
    ];
  }

  /**
   * The presenter's running order. Shown in the demo bar so a five minute
   * walkthrough does not need notes.
   */
  var SCRIPT = [
    { id: 'analyze', label: 'Analyse the situation', detail: 'Runs the real pipeline on the scenario text.', route: 'stress-test' },
    { id: 'snapshot', label: 'Stress snapshot', detail: 'Pressure estimate, drivers, patterns, and where the number came from.', route: 'snapshot' },
    { id: 'plan', label: 'Calm, Clarify, Act', detail: 'The plan chosen for this profile, with the reason for each step.', route: 'plan' },
    { id: 'exercise', label: 'Complete an exercise', detail: 'Run the Calm step end to end.', route: 'plan' },
    { id: 'wingman', label: 'Wingman', detail: 'Three contextual exchanges using the session profile.', route: 'wingman' },
    { id: 'checkin', label: 'Check-in', detail: 'Self-reported change, before and after.', route: 'plan' },
    { id: 'progress', label: 'Progress', detail: 'Local history, self-reported change, categories used.', route: 'progress' }
  ];

  FB.demoData = {
    SCENARIO: SCENARIO,
    CONVERSATION: CONVERSATION,
    CHECKIN: CHECKIN,
    SCRIPT: SCRIPT,
    seedHistory: seedHistory
  };
})(window.FB = window.FB || {});
