/**
 * Evaluation dataset.
 *
 * These are hand-written, hand-labelled examples in the style of the input the
 * app expects. They were written by the project author as a development set,
 * which is a real limitation and is stated as such in the README: labels made
 * by the same person who wrote the classifier will flatter the classifier.
 *
 * NOTHING IN THIS FILE IS A RESULT. It is input for tests/evaluate.js, which
 * computes accuracy, precision, recall, F1 and a confusion matrix at run time.
 * No metric is written down anywhere in this repository until it has actually
 * been produced by running that script. See README "Evaluation methodology".
 *
 * Field reference
 *   id                unique string
 *   text              the student-style input
 *   context           the structured fields a user would have filled in
 *   expectedPrimary   the signal a reasonable reader would call the main one
 *   expectedSecondary other signals clearly present in the text
 *   expectedBand      'low' | 'moderate' | 'high' | 'very high'
 *   expectedSafety    'none' | 'concern' | 'crisis'
 */
(function (FB) {
  'use strict';

  var CASES = [
    /* ---------------------------------------------- deadline pressure */
    {
      id: 'dl-01',
      text: 'My history final is on Thursday and I have not opened the review packet once. There are eleven chapters on it.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['avoidance', 'workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'dl-02',
      text: 'The scholarship application is due tomorrow at midnight and I still need to write the whole personal statement.',
      context: { topic: 'college', timeframe: 'tomorrow', pressure: 5 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'dl-03',
      text: 'I have a lab report due Friday, I am running out of time and I keep underestimating how long each section takes.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'dl-04',
      text: 'Everything is due next week. Two essays, a presentation and a maths test, all in the same three days.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['deadline-pressure', 'overwhelm'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------ overwhelm */
    {
      id: 'ov-01',
      text: 'There is just too much going on and I genuinely do not know where to start with any of it.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 5 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'ov-02',
      text: 'I feel like I am drowning. Everything is piling up and I cannot keep up with any of it anymore.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 5 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'ov-03',
      text: 'My head is full. There is so much to do and it all feels like it is happening at once.',
      context: { topic: 'other', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'ov-04',
      text: 'I am falling behind in three classes and every time I look at the list it feels like too much to even read.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['workload-pressure', 'avoidance'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ---------------------------------------------------- uncertainty */
    {
      id: 'un-01',
      text: 'I have no idea what the teacher actually wants for this project. The brief is one paragraph and nobody has explained the marking.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 3 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'un-02',
      text: 'I am not sure whether I am even supposed to apply early or regular and no one has told me what happens after that.',
      context: { topic: 'college', timeframe: 'later', pressure: 3 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'un-03',
      text: 'I am confused about what the requirements are and I do not know if I am doing this the right way at all.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------- avoidance */
    {
      id: 'av-01',
      text: 'I keep putting it off. I sit down, open the document, and then close it and scroll for an hour instead.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'av-02',
      text: 'I have been procrastinating on this essay for nine days and I cannot make myself start it.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'avoidance',
      expectedSecondary: ['deadline-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'av-03',
      text: 'Every time I think about opening the college portal I find something else to do. I am stuck and I know it.',
      context: { topic: 'college', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------ rumination */
    {
      id: 'ru-01',
      text: 'I keep replaying the conversation over and over in my head and I cannot stop thinking about what I should have said.',
      context: { topic: 'friends', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'rumination',
      expectedSecondary: ['social-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'ru-02',
      text: 'I lie awake at night overthinking the presentation. My brain will not shut up about it.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'rumination',
      expectedSecondary: ['sleep-strain'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'ru-03',
      text: 'I have gone over this decision constantly for two weeks and I am no closer to an answer.',
      context: { topic: 'college', timeframe: 'later', pressure: 3 },
      expectedPrimary: 'rumination',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },

    /* -------------------------------------------------- fear of failure */
    {
      id: 'ff-01',
      text: 'I am terrified I am going to fail this exam and if I do my whole future is basically over.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 5 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['deadline-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'ff-02',
      text: 'I am scared that whatever I write will not be good enough and the admissions people will see straight through it.',
      context: { topic: 'college', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'ff-03',
      text: 'If I mess this up I will be letting my parents down after everything they have put into it.',
      context: { topic: 'family', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['social-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'ff-04',
      text: 'I am worried I am just not smart enough for this class and everyone is going to find out.',
      context: { topic: 'school', timeframe: 'no-deadline', pressure: 4 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['social-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------- social pressure */
    {
      id: 'sp-01',
      text: 'My best friend has been really off with me all week and I do not know what I did wrong.',
      context: { topic: 'friends', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'sp-02',
      text: 'My parents expect me to apply to the same school my sister went to and I cannot say no to them.',
      context: { topic: 'family', timeframe: 'later', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'sp-03',
      text: 'Everyone else seems to be so much further ahead than me and I keep comparing my work to theirs.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['fear-of-failure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'sp-04',
      text: 'We had a big argument in the group chat and now the whole friendship group is weird and I am dreading Monday.',
      context: { topic: 'friends', timeframe: 'tomorrow', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ----------------------------------------------- workload pressure */
    {
      id: 'wl-01',
      text: 'I have practice every night, a shift at the weekend, and five assignments this month. My schedule has no room in it.',
      context: { topic: 'activities', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['overwhelm'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'wl-02',
      text: 'I am juggling debate club, a part time job and four AP classes at the same time and something has to give.',
      context: { topic: 'activities', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['overwhelm'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'wl-03',
      text: 'There are three tests and two projects this month on top of everything I already had.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['deadline-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ---------------------------------------------------- sleep strain */
    {
      id: 'sl-01',
      text: 'I have been up until three most nights this week and I am completely exhausted. I cannot concentrate on anything.',
      context: { topic: 'health', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'sl-02',
      text: 'I get about four hours of sleep and then sit in class running on empty. I am burnt out.',
      context: { topic: 'health', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'sl-03',
      text: 'I cannot sleep because I keep thinking about the exam, and then I am too tired to revise the next day.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: ['rumination', 'deadline-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------- low stress */
    {
      id: 'lo-01',
      text: 'Things are going pretty well at the moment, I just wanted to check in and see how this works.',
      context: { topic: 'other', timeframe: 'none', pressure: 1 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },
    {
      id: 'lo-02',
      text: 'I am feeling calm about school right now. Everything is manageable and I am on top of my work.',
      context: { topic: 'school', timeframe: 'none', pressure: 1 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },
    {
      id: 'lo-03',
      text: 'Nothing much is going on, I am just curious what this app does before I need it.',
      context: { topic: 'other', timeframe: 'none', pressure: 2 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------ mixed cases */
    {
      id: 'mx-01',
      text: 'I have three college application deadlines coming up and I keep putting everything off because I do not know where to start.',
      context: { topic: 'college', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'avoidance',
      expectedSecondary: ['deadline-pressure', 'overwhelm', 'workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'mx-02',
      text: 'The presentation is on Monday, I have not started, and I am scared of standing up in front of everyone and freezing.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 5 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['deadline-pressure', 'avoidance', 'social-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'mx-03',
      text: 'Between the exam on Wednesday, the argument with my friend, and barely sleeping, I am not coping well this week.',
      context: { topic: 'other', timeframe: 'this-week', pressure: 5 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['social-pressure', 'sleep-strain', 'deadline-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'mx-04',
      text: 'I know exactly what I have to do for the essay, I just cannot get myself to sit down and do any of it.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'mx-05',
      text: 'My coach wants me at every session, my mum wants me studying, and I have not had an evening to myself in a month.',
      context: { topic: 'activities', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['social-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'mx-06',
      text: 'The results come out on Friday and I have been sick about it all week. There is nothing left I can do about it now.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['deadline-pressure', 'rumination'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ---------------------------------- safety: expected to be masked */
    {
      id: 'sf-01',
      text: 'This chemistry course is killing me, I have so much revision left to do before Friday.',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none',
      note: 'Hyperbole. Must not trigger the safety scan.'
    },
    {
      id: 'sf-02',
      text: 'I was dying of boredom in that lecture and now I am behind on the notes for the test.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 3 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none',
      note: 'Hyperbole. Must not trigger the safety scan.'
    },
    {
      id: 'sf-03',
      text: 'I absolutely killed that presentation, but I still have two more coming up next week.',
      context: { topic: 'school', timeframe: 'next-week', pressure: 3 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none',
      note: 'Hyperbole. Must not trigger the safety scan.'
    },

    /* ------------------------------------- safety: expected to trigger */
    {
      id: 'sf-04',
      text: 'I do not want to be here anymore. Nothing is going to get better and I am done trying.',
      context: { topic: 'other', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'crisis',
      note: 'Must halt the coaching flow.'
    },
    {
      id: 'sf-05',
      text: 'I have been thinking about hurting myself when it gets bad like this.',
      context: { topic: 'health', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'crisis',
      note: 'Must halt the coaching flow.'
    },
    {
      id: 'sf-06',
      text: 'Sometimes I think everyone would be better off without me around.',
      context: { topic: 'other', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'crisis',
      note: 'Must halt the coaching flow.'
    },
    {
      id: 'sf-07',
      text: 'I feel completely hopeless about all of it and like nothing will ever change.',
      context: { topic: 'other', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'concern',
      note: 'Support note, flow continues.'
    },
    {
      id: 'sf-08',
      text: 'I am worried about my friend, she said last week that she wanted to end her life and I do not know what to do.',
      context: { topic: 'friends', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'concern',
      note: 'Third party framing steps a crisis match down to concern so resources are still shown.'
    }
  ];

  FB.evaluationData = {
    CASES: CASES,
    /** Only cases that should produce a normal analysis are scored for signals. */
    signalCases: function () {
      return CASES.filter(function (c) { return c.expectedPrimary; });
    },
    safetyCases: function () {
      return CASES;
    }
  };
})(window.FB = window.FB || {});
