/**
 * Held-out evaluation set.
 *
 * WHY THIS FILE EXISTS, SEPARATELY FROM data/evaluation-data.js
 *
 * The original set in `evaluation-data.js` was written alongside the
 * classifier. Cases written while you are building the thing they test end up
 * shaped by it, even with the best intentions: you reach for wording you know
 * the lexicon handles. Accuracy measured on that set is a regression check,
 * not a generalisation estimate, and the README has always said so.
 *
 * This file is the correction. Every case here was written AFTER the classifier
 * and the lexicon were finished, without consulting either, and none of them
 * has been used to tune anything. If a case fails, the honest response is to
 * report it, not to add its wording to the lexicon. Doing that would turn this
 * back into a development set and destroy the only property that makes it
 * worth having.
 *
 * The phrasings are deliberately less tidy than the dev set: run-on sentences,
 * lowercase, texting punctuation, and hedging, because that is closer to how
 * the input actually arrives.
 *
 * Labels follow the same rule as the dev set: `expectedPrimary` is the signal a
 * reasonable reader would call the main one, not the one the classifier
 * happens to return.
 */
(function (FB) {
  'use strict';

  var HOLDOUT = [
    /* ------------------------------------------------ deadline pressure */
    {
      id: 'h-dl-01',
      text: 'the portfolio is due monday morning and it is friday night, I have the pieces but none of them are mounted or labelled yet',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-dl-02',
      text: 'registration closes at 5pm today and I still have not picked my classes, I keep meaning to sit down and do it',
      context: { topic: 'school', timeframe: 'today', pressure: 4 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['avoidance'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-dl-03',
      text: 'coach needs the physical form signed before tryouts on wednesday and the clinic has not called me back',
      context: { topic: 'activities', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-dl-04',
      text: 'two weeks until the recital and I am nowhere near having the second movement memorised',
      context: { topic: 'activities', timeframe: 'later', pressure: 4 },
      expectedPrimary: 'deadline-pressure',
      expectedSecondary: ['fear-of-failure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* -------------------------------------------------------- overwhelm */
    {
      id: 'h-ov-01',
      text: 'there is so much going on right now that I genuinely cannot tell you what I am supposed to be doing at any given hour',
      context: { topic: 'school', timeframe: 'this-week', pressure: 5 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ov-02',
      text: 'my brain feels like twenty tabs are open and none of them will load',
      context: { topic: 'other', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ov-03',
      text: 'every time I clear one thing off the list two more appear and I am starting to think I will never get to the bottom of it',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ov-04',
      text: 'I sat down to plan my week and just closed the notebook again, it is too much to even look at',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'overwhelm',
      expectedSecondary: ['avoidance'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------ uncertainty */
    {
      id: 'h-un-01',
      text: 'the assignment sheet says analyse but the rubric says compare and I do not know which one she actually wants',
      context: { topic: 'school', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-un-02',
      text: 'nobody has told me whether the interview is technical or just a conversation and I do not know how to prepare',
      context: { topic: 'work', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: ['fear-of-failure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-un-03',
      text: 'I have no idea what good is supposed to look like for this, I have never written one before and there are no examples',
      context: { topic: 'college', timeframe: 'next-week', pressure: 3 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-un-04',
      text: 'still waiting to hear back about the placement and I cannot plan anything else until I know',
      context: { topic: 'college', timeframe: 'none', pressure: 3 },
      expectedPrimary: 'uncertainty',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },

    /* -------------------------------------------------------- avoidance */
    {
      id: 'h-av-01',
      text: 'I have cleaned my entire room twice this week instead of touching the coursework',
      context: { topic: 'school', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-av-02',
      text: 'the email has been sitting in my drafts for six days, it is two sentences long and I still have not sent it',
      context: { topic: 'school', timeframe: 'none', pressure: 3 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-av-03',
      text: 'I tell myself I will start after dinner and then it is midnight and I have done nothing again',
      context: { topic: 'school', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-av-04',
      text: 'every time I open the spreadsheet I find something else that urgently needs doing first',
      context: { topic: 'work', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: 'avoidance',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------- rumination */
    {
      id: 'h-ru-01',
      text: 'I said something stupid in the seminar on tuesday and I have replayed it maybe forty times since',
      context: { topic: 'school', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'rumination',
      expectedSecondary: ['social-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ru-02',
      text: 'I lie there going over the same conversation and adding things I should have said',
      context: { topic: 'friends', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'rumination',
      expectedSecondary: ['sleep-strain'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ru-03',
      text: 'my head will not let the results thing go even though I cannot do anything about it until august',
      context: { topic: 'school', timeframe: 'later', pressure: 4 },
      expectedPrimary: 'rumination',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ru-04',
      text: 'I keep turning the same decision over and over and I am no closer than I was a week ago',
      context: { topic: 'other', timeframe: 'none', pressure: 3 },
      expectedPrimary: 'rumination',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },

    /* -------------------------------------------------- fear of failure */
    {
      id: 'h-ff-01',
      text: 'if I do badly on this one my average drops below what I need and I think that is basically it for me',
      context: { topic: 'school', timeframe: 'next-week', pressure: 5 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['deadline-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ff-02',
      text: 'everyone is going to see me get it wrong in front of the whole class and I would rather not go in at all',
      context: { topic: 'school', timeframe: 'tomorrow', pressure: 5 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: ['social-pressure', 'avoidance'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ff-03',
      text: 'I am not smart enough for this course and eventually somebody is going to work that out',
      context: { topic: 'school', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-ff-04',
      text: 'what if I get there and freeze and it turns out I was never any good at this',
      context: { topic: 'activities', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'fear-of-failure',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* --------------------------------------------------- social pressure */
    {
      id: 'h-sp-01',
      text: 'my dad asks about my grades every single evening and I have started eating dinner in my room to avoid it',
      context: { topic: 'family', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['avoidance'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-sp-02',
      text: 'they left me out of the group chat again and I do not know if I did something or if I am reading into it',
      context: { topic: 'friends', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['uncertainty', 'rumination'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-sp-03',
      text: 'I said yes to running the fundraiser and now I resent it but I cannot exactly back out now',
      context: { topic: 'activities', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-sp-04',
      text: 'my partner on the project has not replied in four days and I am going to end up doing all of it',
      context: { topic: 'school', timeframe: 'this-week', pressure: 4 },
      expectedPrimary: 'social-pressure',
      expectedSecondary: ['workload-pressure', 'deadline-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------- workload pressure */
    {
      id: 'h-wl-01',
      text: 'shifts thursday friday saturday, match sunday, two labs due monday, and I have not looked at any of the reading',
      context: { topic: 'work', timeframe: 'this-week', pressure: 5 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['overwhelm', 'deadline-pressure'],
      expectedBand: 'very high',
      expectedSafety: 'none'
    },
    {
      id: 'h-wl-02',
      text: 'I am taking six subjects and doing debate and orchestra and something has to give but I do not know what',
      context: { topic: 'school', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['uncertainty'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-wl-03',
      text: 'between the job and school I get maybe two free hours a week and they are not consecutive',
      context: { topic: 'work', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-wl-04',
      text: 'three teachers set major things due the same week which feels like it should not be allowed',
      context: { topic: 'school', timeframe: 'next-week', pressure: 4 },
      expectedPrimary: 'workload-pressure',
      expectedSecondary: ['deadline-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* ------------------------------------------------------ sleep strain */
    {
      id: 'h-sl-01',
      text: 'I have been getting maybe four hours a night since the term started and I am running on coffee and vibes',
      context: { topic: 'health', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: [],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-sl-02',
      text: 'I fell asleep in second period twice this week which has never happened to me before',
      context: { topic: 'health', timeframe: 'none', pressure: 3 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: [],
      expectedBand: 'moderate',
      expectedSafety: 'none'
    },
    {
      id: 'h-sl-03',
      text: 'I am so wiped out that reading a paragraph twice does not help, none of it goes in',
      context: { topic: 'health', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: ['overwhelm'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },
    {
      id: 'h-sl-04',
      text: 'staying up until three most nights to finish things and then being useless the next day, it is not working',
      context: { topic: 'health', timeframe: 'none', pressure: 4 },
      expectedPrimary: 'sleep-strain',
      expectedSecondary: ['workload-pressure'],
      expectedBand: 'high',
      expectedSafety: 'none'
    },

    /* -------------------------------------------------------- low stress */
    {
      id: 'h-ls-01',
      text: 'things are honestly pretty steady at the moment, I just want to keep it that way through exam season',
      context: { topic: 'school', timeframe: 'later', pressure: 2 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },
    {
      id: 'h-ls-02',
      text: 'nothing is really wrong, I just thought I would check in and see what this does',
      context: { topic: 'other', timeframe: 'none', pressure: 1 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },
    {
      id: 'h-ls-03',
      text: 'had a good week actually, got the essay in early and practice went well',
      context: { topic: 'school', timeframe: 'none', pressure: 1 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },
    {
      id: 'h-ls-04',
      text: 'a bit of a slow day but nothing I would call stressful, mostly just tired of the weather',
      context: { topic: 'other', timeframe: 'none', pressure: 2 },
      expectedPrimary: 'low-stress',
      expectedSecondary: [],
      expectedBand: 'low',
      expectedSafety: 'none'
    },

    /* -------------------------------------------- safety, must NOT flag */
    {
      id: 'h-sf-01',
      text: 'this group project is the actual death of me, I swear',
      context: { topic: 'school', timeframe: 'this-week', pressure: 3 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'none',
      note: 'Hyperbole. Must not flag.'
    },
    {
      id: 'h-sf-02',
      text: 'I would rather die than do another group presentation with those two',
      context: { topic: 'school', timeframe: 'none', pressure: 3 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'none',
      note: 'Idiomatic "would rather die than". Must not flag.'
    },
    {
      id: 'h-sf-03',
      text: 'that exam absolutely destroyed me, I have never felt so stupid',
      context: { topic: 'school', timeframe: 'none', pressure: 4 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'none',
      note: 'Hyperbole plus harsh self-talk, not a crisis.'
    },
    {
      id: 'h-sf-04',
      text: 'my phone died halfway through the exam and I wanted to throw myself out a window',
      context: { topic: 'school', timeframe: 'none', pressure: 3 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'none',
      note: 'Strong hyperbole with a clear mundane cause. The hardest not-flag case in the set.'
    },

    /* ------------------------------------------------ safety, must flag */
    {
      id: 'h-sf-05',
      text: 'I have been thinking that everyone would honestly be better off if I was not around anymore',
      context: { topic: 'other', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'crisis',
      note: 'Burden framing. Must flag.'
    },
    {
      id: 'h-sf-06',
      text: 'I do not really see a reason to keep going with any of it anymore',
      context: { topic: 'other', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'crisis',
      note: 'Hopelessness with no mundane referent. Must flag.'
    },
    {
      id: 'h-sf-07',
      text: 'I have started hurting myself again when it gets bad at night',
      context: { topic: 'health', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'crisis',
      note: 'Self-harm disclosure. Must flag.'
    },
    {
      id: 'h-sf-08',
      text: 'honestly some days I feel completely hopeless about all of it and I do not know who to tell',
      context: { topic: 'other', timeframe: 'none', pressure: 5 },
      expectedPrimary: null,
      expectedSecondary: [],
      expectedBand: null,
      expectedSafety: 'concern',
      note: 'Hopelessness without intent. Concern, not a hard stop.'
    }
  ];

  FB.evaluationHoldout = {
    CASES: HOLDOUT,
    signalCases: function () {
      return HOLDOUT.filter(function (c) { return c.expectedPrimary; });
    },
    safetyCases: function () {
      return HOLDOUT;
    }
  };
})(window.FB = window.FB || {});
