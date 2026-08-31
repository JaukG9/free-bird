/**
 * Free Bird exercise library.
 *
 * Every exercise here is a plain data record. Nothing in this file is generated
 * by a model. The recommendation engine (ai/recommendations.js) selects from
 * this library using the stress profile, so the same profile always produces
 * the same suggestion set.
 *
 * `stage` maps an exercise to one of the three plan stages:
 *   calm    - down-regulate physical activation
 *   clarify - reduce ambiguity in how the situation is being held
 *   act     - produce one concrete, small, finishable action
 *
 * `signals` lists the stress signals the exercise is a reasonable answer to.
 * `evidenceNote` names the general practice family an exercise comes from.
 * We deliberately do not attach clinical efficacy claims to individual items.
 */
(function (FB) {
  'use strict';

  var EXERCISES = [
    /* ---------------------------------------------------------- BREATHE */
    {
      id: 'paced-breathing',
      title: 'Paced breathing',
      category: 'Breathe',
      stage: 'calm',
      duration: '2 minutes',
      durationSeconds: 120,
      summary: 'Slow the breath to a steady count so your body has a reason to settle.',
      why: 'When a deadline feels close, breathing usually gets shallow and quick. Lengthening the count gives your system a slower rhythm to follow.',
      steps: [
        'Sit with both feet on the floor and let your shoulders drop.',
        'Breathe in through your nose for a count of four.',
        'Breathe out through your mouth for a count of six.',
        'Keep that pattern going for about ten rounds.',
        'If you lose count, start again at four. Losing count is not failing.'
      ],
      signals: ['deadline-pressure', 'overwhelm', 'workload-pressure', 'sleep-strain'],
      evidenceNote: 'Slow paced breathing, a common component of stress-management and relaxation training.'
    },
    {
      id: 'extended-exhale',
      title: 'Extended exhale',
      category: 'Breathe',
      stage: 'calm',
      duration: '90 seconds',
      durationSeconds: 90,
      summary: 'Make the out-breath longer than the in-breath.',
      why: 'A longer exhale is the simplest version of the same idea as paced breathing, and it is easier to do when your thoughts are moving fast.',
      steps: [
        'Breathe in normally. Do not force a big breath.',
        'Breathe out slowly, roughly twice as long as you breathed in.',
        'At the bottom of the exhale, pause for one beat.',
        'Repeat eight times.',
        'Notice where your shoulders are sitting now compared to when you started.'
      ],
      signals: ['overwhelm', 'rumination', 'fear-of-failure', 'sleep-strain'],
      evidenceNote: 'Extended exhale breathing, a standard relaxation practice.'
    },
    {
      id: 'box-breathing',
      title: 'Box breathing',
      category: 'Breathe',
      stage: 'calm',
      duration: '2 minutes',
      durationSeconds: 120,
      summary: 'Four equal counts, four sides, repeated until the edge comes off.',
      why: 'The even structure gives your attention something plain to hold when it keeps sliding back to the thing you are worried about.',
      steps: [
        'Breathe in for four counts.',
        'Hold for four counts.',
        'Breathe out for four counts.',
        'Hold for four counts.',
        'Run six full boxes. If holding feels uncomfortable, shorten the holds to two.'
      ],
      signals: ['overwhelm', 'rumination', 'social-pressure', 'uncertainty'],
      evidenceNote: 'Box breathing, widely taught in performance and stress-regulation settings.'
    },

    /* ----------------------------------------------------------- GROUND */
    {
      id: 'grounding-54321',
      title: '5-4-3-2-1 grounding',
      category: 'Ground',
      stage: 'calm',
      duration: '3 minutes',
      durationSeconds: 180,
      summary: 'Walk your attention back into the room through your senses.',
      why: 'Worry usually lives in the future. Naming what is actually around you gives your attention somewhere concrete to land.',
      steps: [
        'Name five things you can see right now.',
        'Name four things you can feel, like the chair or the desk under your hands.',
        'Name three things you can hear.',
        'Name two things you can smell, or two smells you like.',
        'Name one thing you can taste, or one slow breath you can take.'
      ],
      signals: ['fear-of-failure', 'overwhelm', 'rumination', 'social-pressure'],
      evidenceNote: 'Sensory grounding, commonly used in stress and distress-tolerance skill sets.'
    },
    {
      id: 'sensory-anchor',
      title: 'Sensory anchor',
      category: 'Ground',
      stage: 'calm',
      duration: '90 seconds',
      durationSeconds: 90,
      summary: 'Pick one physical sensation and stay with it.',
      why: 'A single anchor is easier than five senses when your head is loud.',
      steps: [
        'Put your hand flat on the desk or hold something with texture.',
        'Describe the temperature of it to yourself.',
        'Describe the texture in three words.',
        'Stay with it for thirty slow seconds.',
        'When your mind wanders, bring it back to the same object.'
      ],
      signals: ['rumination', 'overwhelm', 'fear-of-failure'],
      evidenceNote: 'Single-point sensory grounding.'
    },
    {
      id: 'short-body-scan',
      title: 'Short body scan',
      category: 'Ground',
      stage: 'calm',
      duration: '3 minutes',
      durationSeconds: 180,
      summary: 'Check in with your body from jaw to feet without trying to fix anything.',
      why: 'Stress often shows up physically before you notice it in your thinking. Finding it is usually enough to loosen some of it.',
      steps: [
        'Start at your jaw. Notice if it is clenched. Let it open slightly.',
        'Move to your shoulders. Let them fall about a centimetre.',
        'Move to your hands. Unclench them if they are tight.',
        'Move to your stomach. Let it be soft rather than braced.',
        'Finish at your feet. Feel the floor under them for ten seconds.'
      ],
      signals: ['sleep-strain', 'workload-pressure', 'overwhelm'],
      evidenceNote: 'Brief body scan, drawn from mindfulness-based stress reduction practice.'
    },

    /* ------------------------------------------------------------ RESET */
    {
      id: 'one-minute-reset',
      title: 'One-minute reset',
      category: 'Reset',
      stage: 'calm',
      duration: '1 minute',
      durationSeconds: 60,
      summary: 'A short, deliberate stop before you go back in.',
      why: 'A reset is not a break from the work. It is a way of arriving at the work differently.',
      steps: [
        'Stand up and step away from the screen.',
        'Roll your shoulders back three times.',
        'Take one full breath in and one long breath out.',
        'Drink some water.',
        'Sit back down and open only the one thing you are going to work on.'
      ],
      signals: ['avoidance', 'workload-pressure', 'overwhelm'],
      evidenceNote: 'Brief behavioural interruption before restarting a task.'
    },
    {
      id: 'tension-release',
      title: 'Tension release',
      category: 'Reset',
      stage: 'calm',
      duration: '2 minutes',
      durationSeconds: 120,
      summary: 'Tense a muscle group deliberately, then let it go.',
      why: 'Letting go is easier to feel when you first notice what holding on feels like.',
      steps: [
        'Squeeze both fists for five seconds, then release for ten.',
        'Lift your shoulders toward your ears for five seconds, then drop them.',
        'Press your feet into the floor for five seconds, then release.',
        'Scrunch your face for five seconds, then let it go.',
        'Sit still for twenty seconds and notice the difference.'
      ],
      signals: ['workload-pressure', 'fear-of-failure', 'sleep-strain'],
      evidenceNote: 'Abbreviated progressive muscle relaxation.'
    },
    {
      id: 'screen-break',
      title: 'Screen break',
      category: 'Reset',
      stage: 'calm',
      duration: '5 minutes',
      durationSeconds: 300,
      summary: 'Get your eyes and your attention off the screen on purpose.',
      why: 'Scrolling while stressed is rest that does not rest. A deliberate break works better than an accidental one.',
      steps: [
        'Put your phone face down, out of reach.',
        'Look at something at least six metres away for twenty seconds.',
        'Walk to another room and back.',
        'Stretch your arms above your head once.',
        'Come back and set a timer before you reopen anything.'
      ],
      signals: ['avoidance', 'sleep-strain', 'workload-pressure'],
      evidenceNote: 'Structured attention break and visual rest.'
    },

    /* ------------------------------------------------------------ THINK */
    {
      id: 'facts-vs-fears',
      title: 'Facts versus fears',
      category: 'Think',
      stage: 'clarify',
      duration: '5 minutes',
      durationSeconds: 300,
      summary: 'Separate what you actually know from what you are predicting.',
      why: 'Both lists are real, but only one of them is information you can plan around.',
      steps: [
        'Write a heading that says "What I know" and one that says "What I am predicting".',
        'Under the first, put only things you could show someone: dates, page counts, what was actually said.',
        'Under the second, put the outcomes you are imagining.',
        'Read the first list again on its own.',
        'Ask what the first list alone would suggest you do next.'
      ],
      signals: ['fear-of-failure', 'uncertainty', 'rumination'],
      evidenceNote: 'Evidence-checking, a core element of cognitive behavioural skills training.'
    },
    {
      id: 'controllable-check',
      title: 'Controllable versus not',
      category: 'Think',
      stage: 'clarify',
      duration: '4 minutes',
      durationSeconds: 240,
      summary: 'Sort the situation into what is yours to move and what is not.',
      why: 'Effort spent on the second column is where most of the exhaustion comes from.',
      steps: [
        'List everything that is bothering you about this situation, in any order.',
        'Mark each item C if you have real influence over it, and N if you do not.',
        'Cross out the N items for now. They are still real, you are just not solving them today.',
        'Circle the single C item with the largest effect.',
        'Write one sentence about what you would do with that item first.'
      ],
      signals: ['uncertainty', 'social-pressure', 'overwhelm', 'workload-pressure'],
      evidenceNote: 'Control appraisal, common in stress-management and coping-skills training.'
    },
    {
      id: 'probability-check',
      title: 'Probability check',
      category: 'Think',
      stage: 'clarify',
      duration: '4 minutes',
      durationSeconds: 240,
      summary: 'Look at the worst case you are carrying and how likely it really is.',
      why: 'Naming the feared outcome precisely usually makes it smaller and more answerable than leaving it vague.',
      steps: [
        'Write the specific outcome you are afraid of, in one sentence.',
        'Estimate how likely it is out of ten, based on what has actually happened before.',
        'Write what you would do the day after, if it did happen.',
        'Write one thing you could do this week that lowers the odds.',
        'Reread the sentence you wrote in step three. That is your floor.'
      ],
      signals: ['fear-of-failure', 'uncertainty', 'rumination'],
      evidenceNote: 'Probability estimation and decatastrophising from cognitive behavioural skills training.'
    },
    {
      id: 'kinder-self-talk',
      title: 'Kinder self-talk',
      category: 'Think',
      stage: 'clarify',
      duration: '3 minutes',
      durationSeconds: 180,
      summary: 'Rewrite the sentence you have been saying to yourself.',
      why: 'You are unlikely to work well from a sentence you would never say to a friend in the same position.',
      steps: [
        'Write down the harshest thing you have said to yourself about this today.',
        'Underline the part that is a fact and the part that is a verdict.',
        'Write what you would say to a friend who told you the same thing.',
        'Rewrite the original sentence keeping the fact and dropping the verdict.',
        'Keep the rewritten version somewhere you can see it while you work.'
      ],
      signals: ['fear-of-failure', 'rumination', 'social-pressure', 'avoidance'],
      evidenceNote: 'Self-compassion and cognitive reframing practice.'
    },
    {
      id: 'brain-dump-sort',
      title: 'Write it all down, then sort',
      category: 'Think',
      stage: 'clarify',
      duration: '7 minutes',
      durationSeconds: 420,
      summary: 'Empty everything onto a page first, then separate urgent from important.',
      why: 'Holding an unsorted list in your head costs more attention than the tasks themselves.',
      steps: [
        'Write every open item down, school and non-school, in whatever order they arrive.',
        'Keep going until nothing new comes up for thirty seconds.',
        'Mark each item U if it has a near deadline and I if it genuinely matters.',
        'Items that are neither can wait. Say that to yourself explicitly.',
        'Pick one item marked U and I and start there.'
      ],
      signals: ['overwhelm', 'workload-pressure', 'deadline-pressure', 'uncertainty'],
      evidenceNote: 'Externalising working memory, then prioritising by urgency and importance.'
    },
    {
      id: 'good-enough-definition',
      title: 'Define good enough',
      category: 'Think',
      stage: 'clarify',
      duration: '5 minutes',
      durationSeconds: 300,
      summary: 'Decide in advance what a finished, acceptable version looks like.',
      why: 'Without a defined finish line, every piece of work stays open and every stopping point feels like giving up.',
      steps: [
        'Write what the task requires, using the actual brief or rubric if you have one.',
        'Write what a version that meets it, and nothing more, would contain.',
        'Write what you have been quietly aiming for instead.',
        'Notice the gap between those two.',
        'Commit to the first version. You can improve it later if there is time.'
      ],
      signals: ['fear-of-failure', 'avoidance', 'workload-pressure', 'deadline-pressure'],
      evidenceNote: 'Standard-setting work used in perfectionism and procrastination support.'
    },
    {
      id: 'deadline-inventory',
      title: 'Deadline inventory',
      category: 'Think',
      stage: 'clarify',
      duration: '6 minutes',
      durationSeconds: 360,
      summary: 'Write down every deadline with its real date and the time you actually have.',
      why: 'Deadline stress is often uncertainty stress. The list is usually less frightening than the fog.',
      steps: [
        'List every deadline connected to this situation.',
        'Write the real date next to each one, not the one you have been assuming.',
        'Write how many working hours you realistically have before each.',
        'Mark the one that is genuinely closest.',
        'Leave the rest alone until that one has a plan.'
      ],
      signals: ['deadline-pressure', 'uncertainty', 'overwhelm', 'workload-pressure'],
      evidenceNote: 'Structured planning and time inventory.'
    },

    /* -------------------------------------------------------------- ACT */
    {
      id: 'two-minute-start',
      title: 'Two-minute start',
      category: 'Act',
      stage: 'act',
      duration: '2 minutes',
      durationSeconds: 120,
      summary: 'Do the smallest possible opening move, then decide whether to keep going.',
      why: 'Starting is usually harder than continuing. Two minutes is short enough that avoiding it costs more than doing it.',
      steps: [
        'Name the exact task you have been circling.',
        'Decide what the first two minutes of it look like. Opening the document counts.',
        'Set a timer for two minutes.',
        'Do only that. Do not plan past the timer.',
        'When it goes off, decide freely whether to continue. Stopping is allowed.'
      ],
      signals: ['avoidance', 'overwhelm', 'deadline-pressure'],
      evidenceNote: 'Behavioural activation and minimal-commitment task initiation.'
    },
    {
      id: 'smallest-next-step',
      title: 'Smallest next step',
      category: 'Act',
      stage: 'act',
      duration: '5 minutes',
      durationSeconds: 300,
      summary: 'Find the one action that is small enough to actually happen today.',
      why: 'Plans fail at the size of the step, not at the size of the goal.',
      steps: [
        'Write the task the way it currently lives in your head.',
        'Ask what would have to be true before you could start it.',
        'Write that answer down. That is usually the real next step.',
        'If it still takes more than fifteen minutes, cut it in half.',
        'Write when today you will do it, at a specific time.'
      ],
      signals: ['overwhelm', 'uncertainty', 'avoidance', 'workload-pressure'],
      evidenceNote: 'Task decomposition and implementation intentions.'
    },
    {
      id: 'task-chunking',
      title: 'Task chunking',
      category: 'Act',
      stage: 'act',
      duration: '8 minutes',
      durationSeconds: 480,
      summary: 'Break one large thing into named pieces with rough times.',
      why: 'A large task with no internal structure reads as one impossible block. Pieces can be finished.',
      steps: [
        'Write the whole task at the top of a page.',
        'List every distinct piece it contains, without ordering them.',
        'Put a rough number of minutes next to each piece.',
        'Circle the two pieces that unlock the most of the rest.',
        'Schedule the first circled piece into a specific slot.'
      ],
      signals: ['workload-pressure', 'overwhelm', 'deadline-pressure'],
      evidenceNote: 'Task decomposition and time estimation.'
    },
    {
      id: 'distraction-reset',
      title: 'Distraction reset',
      category: 'Act',
      stage: 'act',
      duration: '3 minutes',
      durationSeconds: 180,
      summary: 'Change the environment before you try to change your willpower.',
      why: 'Most focus problems are easier to fix by moving things than by trying harder.',
      steps: [
        'Close every tab that is not part of the next task.',
        'Put your phone in a different room, or at least out of sight.',
        'Write the one task on paper and put it next to you.',
        'Set a timer for fifteen minutes.',
        'Work until the timer ends, then take a real break.'
      ],
      signals: ['avoidance', 'workload-pressure', 'deadline-pressure'],
      evidenceNote: 'Stimulus control and environmental design for attention.'
    },
    {
      id: 'one-conversation',
      title: 'One conversation',
      category: 'Act',
      stage: 'act',
      duration: '10 minutes',
      durationSeconds: 600,
      summary: 'Prepare a single short conversation instead of rehearsing all of them.',
      why: 'Social pressure tends to grow in silence. One direct exchange usually shrinks it more than a week of thinking about it.',
      steps: [
        'Name the one person this is actually about.',
        'Write the single sentence you want them to hear.',
        'Write what you want to be different afterward.',
        'Decide when and where you will say it, today or tomorrow.',
        'Keep it to the one sentence. You do not have to resolve everything at once.'
      ],
      signals: ['social-pressure', 'uncertainty', 'avoidance'],
      evidenceNote: 'Assertive communication and boundary-setting practice.'
    },
    {
      id: 'wind-down-plan',
      title: 'Wind-down plan',
      category: 'Act',
      stage: 'act',
      duration: '5 minutes',
      durationSeconds: 300,
      summary: 'Give tonight a defined end so tomorrow is not borrowed against.',
      why: 'Stress and short sleep feed each other. Deciding the stopping point in advance is easier than deciding it at midnight.',
      steps: [
        'Choose the time you will stop working tonight, and write it down.',
        'Write the one thing that has to be done before then.',
        'Move anything unfinished onto a list for tomorrow so it is not held in your head.',
        'Set an alarm for the stop time now.',
        'Plan the last twenty minutes before bed without a screen.'
      ],
      signals: ['sleep-strain', 'workload-pressure', 'deadline-pressure', 'rumination'],
      evidenceNote: 'Sleep hygiene and pre-sleep cognitive offloading.'
    },
    {
      id: 'steady-check',
      title: 'Steady check',
      category: 'Ground',
      stage: 'calm',
      duration: '2 minutes',
      durationSeconds: 120,
      summary: 'A short check-in for when nothing is urgent but you want to stay ahead of it.',
      why: 'Noticing where you are before things pile up is cheaper than fixing it afterward.',
      steps: [
        'Take three slow breaths without changing anything else.',
        'Name how the last two days have actually felt, in one word.',
        'Name one thing that has been going better than you expected.',
        'Name one thing you would like to be different by the end of the week.',
        'Write that one thing down somewhere you will see it.'
      ],
      signals: ['low-stress', 'uncertainty'],
      evidenceNote: 'Brief reflective check-in.'
    },
    {
      id: 'open-loop-close',
      title: 'Close one open loop',
      category: 'Act',
      stage: 'act',
      duration: '10 minutes',
      durationSeconds: 600,
      summary: 'Finish one small thing completely instead of advancing five things partly.',
      why: 'Unfinished items keep costing attention. Finishing one returns some of it.',
      steps: [
        'List three small things that are currently half done.',
        'Pick the one that would take under ten minutes to finish.',
        'Finish it now, completely, including the last step people usually skip.',
        'Cross it off somewhere visible.',
        'Notice that the list is shorter than it was ten minutes ago.'
      ],
      signals: ['workload-pressure', 'overwhelm', 'avoidance'],
      evidenceNote: 'Completion-based task management.'
    }
  ];

  var CATEGORY_ORDER = ['Breathe', 'Ground', 'Reset', 'Think', 'Act'];

  var CATEGORY_BLURB = {
    Breathe: 'Slow the body down first, because it is the fastest thing to change.',
    Ground: 'Bring your attention back to where you actually are.',
    Reset: 'A short, deliberate stop before returning to the work.',
    Think: 'Look at the situation with fewer assumptions in the way.',
    Act: 'Turn the situation into one finishable next move.'
  };

  function getExercise(id) {
    for (var i = 0; i < EXERCISES.length; i++) {
      if (EXERCISES[i].id === id) return EXERCISES[i];
    }
    return null;
  }

  function byStage(stage) {
    return EXERCISES.filter(function (ex) { return ex.stage === stage; });
  }

  function byCategory(category) {
    return EXERCISES.filter(function (ex) { return ex.category === category; });
  }

  FB.exercises = {
    all: EXERCISES,
    categories: CATEGORY_ORDER,
    categoryBlurb: CATEGORY_BLURB,
    get: getExercise,
    byStage: byStage,
    byCategory: byCategory
  };
})(window.FB = window.FB || {});
