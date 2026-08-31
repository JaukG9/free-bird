/**
 * Wingman response composer.
 *
 * IMPORTANT, and stated the same way in the interface and the README:
 * Free Bird does not ship a generative language model. Wingman replies are
 * composed here from a structured template set, filled with the user's own
 * session context. What the on-device model contributes, when it is loaded, is
 * INTENT MATCHING: the user's message is embedded and compared against anchor
 * phrases for each intent. When the model is not loaded, the same intents are
 * matched lexically.
 *
 * So there are two honest labels the interface can show for any reply:
 *   "matched on device"  - embedding similarity chose the intent
 *   "matched by rules"   - the lexical matcher chose the intent
 * In both cases the words themselves are written, not generated, and the app
 * says so rather than implying a language model wrote them.
 */
(function (FB) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Intents                                                             */
  /* ------------------------------------------------------------------ */

  var INTENTS = [
    {
      id: 'cannot-start',
      anchors: [
        'I still cannot make myself start',
        'I keep sitting here and not doing it',
        'I open the document and then do something else',
        'I know what to do but I am not doing it'
      ],
      patterns: [/\bcan'?t\s+(start|begin|make\s+myself|get\s+going|bring\s+myself)/, /\bnot\s+starting\b/, /\bstill\s+haven'?t\s+started\b/, /\bprocrastinat/, /\bkeep\s+putting\s+(it|this)\s+off\b/, /\bstuck\b/]
    },
    {
      id: 'break-it-down',
      anchors: [
        'can you help me break this down',
        'how do I split this into steps',
        'what should I actually do first',
        'give me a smaller version of this task'
      ],
      patterns: [/\bbreak\s+(it|this|that)\s+down\b/, /\bwhere\s+(do|should)\s+i\s+start\b/, /\bwhat\s+(should|do)\s+i\s+do\s+first\b/, /\bstep\s+by\s+step\b/, /\bsmaller\s+(steps?|pieces?)\b/, /\bhelp\s+me\s+plan\b/]
    },
    {
      id: 'overwhelmed',
      anchors: [
        'I know what I need to do but I am overwhelmed',
        'there is just too much of it',
        'everything is hitting at once and I cannot hold it',
        'my head is completely full'
      ],
      patterns: [/\boverwhelm/, /\btoo\s+much\b/, /\ball\s+at\s+once\b/, /\bcan'?t\s+(cope|handle|keep\s+up)\b/, /\bdrowning\b/, /\bpiling\s+up\b/]
    },
    {
      id: 'reframe',
      anchors: [
        'can you help me think about this differently',
        'I want another way to look at this',
        'is there a better way to see this situation',
        'help me get some perspective on it'
      ],
      patterns: [/\bthink\s+about\s+(this|it)\s+differently\b/, /\banother\s+way\s+to\s+(see|look)\b/, /\bperspective\b/, /\breframe\b/, /\bam\s+i\s+overreacting\b/]
    },
    {
      id: 'fear',
      anchors: [
        'I am scared I am going to fail',
        'what if I mess the whole thing up',
        'I am not good enough for this',
        'everyone will see that I got it wrong'
      ],
      patterns: [/\b(scared|afraid|terrified|worried)\b/, /\bfail/, /\bmess\s+(it|this)\s+up\b/, /\bnot\s+good\s+enough\b/, /\bwhat\s+if\b/, /\bdisappoint/, /\bjudge/]
    },
    {
      id: 'no-time',
      anchors: [
        'there is not enough time left for any of this',
        'the deadline is too close now',
        'I do not have time to do exercises',
        'it is already too late to start'
      ],
      patterns: [/\bno\s+time\b/, /\bnot\s+enough\s+time\b/, /\btoo\s+late\b/, /\brunning\s+out\s+of\s+time\b/, /\bdue\s+(today|tomorrow|tonight|in\s+\w+)\b/, /\bonly\s+\w+\s+(hours?|days?)\b/]
    },
    {
      id: 'people',
      anchors: [
        'my friend has been strange with me',
        'my parents keep bringing it up',
        'everyone else is doing better than me',
        'I do not know how to say no to them'
      ],
      patterns: [/\b(friend|friends|parents?|mom|mum|dad|family|teacher|coach|classmate)\b/, /\beveryone\s+else\b/, /\bsay\s+no\b/, /\bthey\s+(think|expect)\b/, /\bcompar/]
    },
    {
      id: 'tired',
      anchors: [
        'I am exhausted and cannot focus',
        'I have barely slept this week',
        'I have no energy left for this',
        'I am running on nothing'
      ],
      patterns: [/\b(exhaust|tired|drained|no\s+energy|burn(t|ed)?\s+out|sleep|slept|insomnia)\b/, /\bcan'?t\s+focus\b/]
    },
    {
      id: 'venting',
      anchors: [
        'I just feel awful about all of it',
        'I hate this whole situation',
        'today has been genuinely terrible',
        'I just needed to say it somewhere'
      ],
      patterns: [/\bi\s+(just\s+)?(feel|felt)\b/, /\bi\s+hate\b/, /\bawful\b/, /\bterrible\b/, /\bmiserable\b/, /\bvent\b/, /\brant\b/]
    },
    {
      id: 'pushback',
      anchors: [
        'that will not work for me',
        'I have already tried that and it did not help',
        'this feels pointless',
        'that advice is too generic'
      ],
      patterns: [/\b(won'?t|will\s+not|doesn'?t|does\s+not)\s+(work|help)\b/, /\balready\s+tried\b/, /\bpointless\b/, /\btoo\s+generic\b/, /\bthat'?s\s+(not\s+)?(useless|obvious|easy\s+for\s+you)\b/, /\bnot\s+helpful\b/]
    },
    {
      id: 'what-now',
      anchors: [
        'what should I do now',
        'what is my next step',
        'what happens after this',
        'okay so what now'
      ],
      patterns: [/\bwhat\s+(should\s+i\s+do\s+)?now\b/, /\bnext\s+step\b/, /\bwhat\s+(comes\s+)?(after|next)\b/, /\bwhat\s+do\s+i\s+do\b/]
    },
    {
      id: 'positive',
      anchors: [
        'that actually helped a lot',
        'thanks, I feel a bit better',
        'okay that makes sense now',
        'I managed to get started'
      ],
      patterns: [/\b(thanks|thank\s+you|helped|helpful|better\s+now|makes\s+sense|got\s+started|i\s+did\s+it)\b/]
    },
    {
      id: 'about-app',
      anchors: [
        'are you a real therapist',
        'is this private, where does my text go',
        'what are you exactly',
        'how does this app work'
      ],
      patterns: [/\b(are\s+you|you'?re)\s+(a\s+)?(real\s+)?(therapist|human|ai|bot|doctor|counsell?or)\b/, /\bhow\s+(does\s+this|do\s+you)\s+work\b/, /\bis\s+this\s+private\b/, /\bwhere\s+does\s+my\s+(data|text)\s+go\b/, /\bwhat\s+are\s+you\b/]
    }
  ];

  var GENERIC_INTENT = 'general';

  /* ------------------------------------------------------------------ */
  /* Intent matching                                                     */
  /* ------------------------------------------------------------------ */

  function matchIntentLexically(message) {
    var text = FB.normalize.normalise(message);
    var best = null;
    var bestScore = 0;

    INTENTS.forEach(function (intent) {
      var hits = 0;
      intent.patterns.forEach(function (re) {
        re.lastIndex = 0;
        if (re.test(text)) hits++;
      });
      if (hits > bestScore) {
        bestScore = hits;
        best = intent.id;
      }
    });

    return { intent: best || GENERIC_INTENT, confidence: null, method: 'rules', hits: bestScore };
  }

  /**
   * Embedding-based intent match. Returns null when the model or the intent
   * centroids are not available, so the caller can fall back to rules.
   */
  function matchIntentSemantically(vector, intentCentroids) {
    if (!vector || !intentCentroids) return null;
    var best = null;
    var bestSim = -1;
    var second = -1;

    INTENTS.forEach(function (intent) {
      var centroid = intentCentroids[intent.id];
      if (!centroid) return;
      var sim = FB.classifier.cosine(vector, centroid);
      if (sim > bestSim) {
        second = bestSim;
        bestSim = sim;
        best = intent.id;
      } else if (sim > second) {
        second = sim;
      }
    });

    // Below this similarity the match is not meaningful, so we hand back the
    // generic intent rather than pretending to have understood.
    if (bestSim < 0.28) {
      return { intent: GENERIC_INTENT, confidence: bestSim, method: 'on-device', margin: bestSim - second };
    }

    return { intent: best, confidence: bestSim, method: 'on-device', margin: bestSim - second };
  }

  /* ------------------------------------------------------------------ */
  /* Response composition                                                */
  /* ------------------------------------------------------------------ */

  function subjectOf(ctx) {
    return ctx.subject || 'this';
  }

  function currentStep(ctx) {
    if (!ctx.plan || !ctx.plan.steps) return null;
    for (var i = 0; i < ctx.plan.steps.length; i++) {
      if (!ctx.plan.steps[i].done) return ctx.plan.steps[i];
    }
    return null;
  }

  function stepTitle(step) {
    if (!step) return null;
    var exercise = FB.exercises.get(step.exerciseId);
    return exercise ? exercise.title : null;
  }

  function driverPhrase(ctx, index) {
    var drivers = ctx.drivers || [];
    var driver = drivers[index || 0];
    if (!driver) return null;
    return String(driver.label || '').toLowerCase();
  }

  /**
   * Each intent maps to a small set of composed variants. Variants are chosen
   * by turn index rather than at random so a demo run is repeatable and the
   * same question twice in a row does not return an identical answer.
   */
  var COMPOSERS = {
    'cannot-start': [
      function (ctx) {
        var step = currentStep(ctx);
        var title = stepTitle(step);
        return [
          'Starting is hard right now partly because ' + subjectOf(ctx) + ' is showing up as one whole thing rather than a first move.',
          'Shrink it until it is almost too small to refuse. What is one piece of it you could work on for ten minutes and then stop?',
          title ? 'If it helps, your ' + step.label.toLowerCase() + ' step is ' + title + ', and it is built for exactly this.' : null
        ];
      },
      function (ctx) {
        return [
          'Notice that you have not been avoiding the work so much as avoiding the moment of beginning it. Those are different problems and the second one is smaller.',
          'Try this: set a timer for two minutes, open the file, and do nothing else. You are allowed to stop when it goes off.',
          'What would the first two minutes actually look like?'
        ];
      },
      function (ctx) {
        return [
          'When starting keeps failing, it is usually a sign the step is still too big rather than that you are not trying.',
          'Say the smallest version out loud: not "write the essay", but "write one bad sentence".',
          'What is the smallest version for you?'
        ];
      }
    ],

    'break-it-down': [
      function (ctx) {
        return [
          'Let us do it in order. First, what is the actual deliverable here, in one sentence, using the words the assignment or the person used?',
          'Once that sentence exists, we can list the pieces underneath it and put rough times next to them.',
          'Start with the sentence.'
        ];
      },
      function (ctx) {
        return [
          'Breaking down ' + subjectOf(ctx) + ' works best from the end backwards. What is the last thing that has to be true before it counts as done?',
          'Then ask what has to be true before that. Two or three of those and you usually hit something you could start today.',
          'What is the last step?'
        ];
      },
      function (ctx) {
        return [
          'Here is a structure that usually works: one line for the outcome, three to five lines for the pieces, a rough number of minutes next to each.',
          'It does not need to be accurate. It needs to be visible so it stops living in your head.',
          'Which piece do you already know belongs on the list?'
        ];
      }
    ],

    'overwhelmed': [
      function (ctx) {
        var p = ctx.pressure && ctx.pressure.value;
        return [
          'Knowing what to do and being able to move are different capacities, and right now the second one is the one under load.',
          p && p >= 7 ? 'At the level you described, planning harder tends not to work. Lowering the physical activation first usually does.' : 'It usually helps to lower the load before choosing anything.',
          'Pick one item from the pile, any one, and put the rest out of view for the next fifteen minutes. Which one is in front of you?'
        ];
      },
      function (ctx) {
        return [
          'Overwhelm is often a storage problem more than a workload problem. Holding an unsorted list costs more attention than most of the tasks on it.',
          'Write everything down, even the small things, then mark only what has a real deadline in the next two days.',
          'How many items do you think are actually on that list?'
        ];
      },
      function (ctx) {
        return [
          'You do not have to reduce the amount of work to reduce the overwhelm. You have to reduce how much of it you are holding at one time.',
          'One task, one timer, everything else closed. That is the whole method.',
          'What is the one task for the next fifteen minutes?'
        ];
      }
    ],

    'reframe': [
      function (ctx) {
        return [
          'One thing worth checking: which parts of this are facts you could show someone, and which are predictions you are making about how it goes?',
          'Both feel the same from the inside, but only the first list is something you can plan around.',
          'What is on the facts list?'
        ];
      },
      function (ctx) {
        var d = driverPhrase(ctx, 0);
        return [
          d ? 'You described this mostly through ' + d + '. That framing is understandable, and it is also not the only one available.' : 'The framing you are using is understandable, and it is also not the only one available.',
          'If a friend described this exact situation to you, what would you notice that they were not?',
          'Try answering that as if it were them.'
        ];
      },
      function (ctx) {
        return [
          'A useful question here is what this looks like in a week, and what it looks like in a year.',
          'Not to make it small, since it is real now, but because the size it feels today is not usually the size it stays.',
          'What changes between those two views?'
        ];
      }
    ],

    'fear': [
      function (ctx) {
        return [
          'That fear makes sense given how much this matters to you. It is worth separating what you know from what you are predicting.',
          'What is the specific outcome you are picturing, and what has actually happened the last few times you were in something similar?',
          'Say the specific one out loud. Vague fears are heavier than precise ones.'
        ];
      },
      function (ctx) {
        return [
          'Fear of falling short usually raises the standard at exactly the moment you have the least capacity to meet it.',
          'Before you continue, decide what good enough looks like here. Write the version that meets the requirement and nothing more.',
          'What would that version contain?'
        ];
      },
      function (ctx) {
        return [
          'Worth naming: you are treating one outcome as final. Most of the time there is a next move afterward, even in the bad version.',
          'If the thing you are afraid of did happen, what would you do the day after?',
          'That answer is your floor, and it is usually higher than it feels right now.'
        ];
      }
    ],

    'no-time': [
      function (ctx) {
        return [
          'If time is genuinely short, then the goal changes. It is not doing this well, it is deciding what gets done at all.',
          'What is the minimum that has to exist by the deadline for this to count?',
          'Everything above that line is optional until the line is met.'
        ];
      },
      function (ctx) {
        return [
          'Two minutes on choosing usually returns more than twenty minutes of undirected effort when the clock is this tight.',
          'Of everything left, which single piece carries the most weight in how this is judged?',
          'Start there and let the rest be unfinished on purpose rather than by accident.'
        ];
      },
      function (ctx) {
        return [
          'It may be too late for the version you originally wanted. It is very rarely too late for a version.',
          'What is the smallest complete thing you could hand in?',
          'Aim at that, and treat anything beyond it as a bonus.'
        ];
      }
    ],

    'people': [
      function (ctx) {
        return [
          'When other people are part of the pressure, the first useful split is what you can influence and what you cannot.',
          'You cannot control what they think. You can control what you say and when you say it.',
          'What is one thing here that is genuinely in your column?'
        ];
      },
      function (ctx) {
        return [
          'A lot of social pressure grows in the gap where a conversation has not happened yet.',
          'If you could say one sentence to the person this is really about, what would it be?',
          'One sentence is usually enough to start. You do not have to resolve the whole thing at once.'
        ];
      },
      function (ctx) {
        return [
          'Comparison is a poor measuring instrument. You are seeing their outputs and your process.',
          'What would you be doing this week if you were the only person in the room?',
          'That answer is usually closer to the right plan.'
        ];
      }
    ],

    'tired': [
      function (ctx) {
        return [
          'Running short on rest changes what is reasonable to expect from yourself, and it is worth planning around rather than through.',
          'What is the one thing that genuinely has to be done before you stop tonight?',
          'Put everything else on a list for tomorrow so you are not holding it while you try to sleep.'
        ];
      },
      function (ctx) {
        return [
          'Tired brains are much better at continuing than at starting, and much better at simple than at complex.',
          'Pick the most mechanical part of the work, the part that needs the least judgement, and do that piece now.',
          'Which part of it needs the least thinking?'
        ];
      }
    ],

    'venting': [
      function (ctx) {
        return [
          'That sounds genuinely heavy, and it makes sense that it is landing this hard.',
          'You do not have to turn it into a plan right now. Saying it plainly is a reasonable thing to do with it.',
          'If you do want a next move later, we can find a small one. What would you want to be different by tonight?'
        ];
      },
      function (ctx) {
        return [
          'That is a lot to be carrying at once, and none of it sounds unreasonable to be upset about.',
          'Is this a moment where you want something practical, or a moment where you want to put it down for a bit?',
          'Both are fine answers.'
        ];
      }
    ],

    'pushback': [
      function (ctx) {
        return [
          'That is fair, and worth taking seriously rather than talking you out of.',
          'What specifically did not work about it? If it was too big, we can cut it down. If it was the wrong kind of step, we can change the kind.',
          'Tell me which one and I will adjust.'
        ];
      },
      function (ctx) {
        return [
          'Understood. Generic advice tends to fail on the specific reason a thing is hard.',
          'What is the actual obstacle at the moment you try to start? The task itself, the environment, or how you are feeling about it?',
          'The answer changes what is worth trying next.'
        ];
      }
    ],

    'what-now': [
      function (ctx) {
        var step = currentStep(ctx);
        var title = stepTitle(step);
        if (step && title) {
          return [
            'Your next step is the ' + step.label.toLowerCase() + ' one: ' + title + '.',
            step.rationale,
            'It is on the My Plan page whenever you want to run it.'
          ];
        }
        return [
          'You have finished the three steps in this plan, which is worth noting rather than skipping past.',
          'From here you can do a check-in to record how it shifted, or start a new stress check if something else has come up.',
          'Which of those fits better right now?'
        ];
      }
    ],

    'positive': [
      function (ctx) {
        return [
          'Good. Worth noticing what specifically shifted, because that is the part worth repeating next time.',
          'Was it the starting, the clarity about what to do, or just having it out of your head?',
          'If you want to record it, the check-in takes about fifteen seconds.'
        ];
      },
      function (ctx) {
        return [
          'That is a real result, and it came from you doing the thing rather than from reading about it.',
          'Do you want to keep going while there is momentum, or stop here on purpose?',
          'Stopping on purpose is a legitimate choice.'
        ];
      }
    ],

    'about-app': [
      function (ctx) {
        return [
          'No. Free Bird is a study and stress tool, not a therapist, counsellor, or medical service, and it cannot help in an emergency.',
          'What it does is look at the wording you gave it, in your browser, and turn that into a small plan.',
          'Your text stays on this device. There is no account and no server holding it.'
        ];
      },
      function (ctx) {
        return [
          'Practically: the analysis runs in your browser. Your text is not sent to a remote service.',
          'The replies you get from me are composed from a written template set using your session context, not written by a language model.',
          'The About page has the full detail if you want it.'
        ];
      }
    ],

    'general': [
      function (ctx) {
        var d = driverPhrase(ctx, 0);
        return [
          d ? 'Going back to what you described, the main weight seemed to be ' + d + '.' : 'Let us stay with what you described.',
          'What has changed since you wrote it, if anything?',
          'Even a small change tells us which direction to push.'
        ];
      },
      function (ctx) {
        var step = currentStep(ctx);
        var title = stepTitle(step);
        return [
          'Tell me a bit more about the part that is hardest right now.',
          title ? 'For reference, your next planned step is ' + title + '.' : 'We can adjust the plan if it is aimed at the wrong thing.',
          'What is in the way?'
        ];
      },
      function (ctx) {
        return [
          'I want to make sure I am answering the right question.',
          'Is this about not knowing what to do, not being able to start, or how you are feeling about the outcome?',
          'Any of those is workable, they just need different moves.'
        ];
      }
    ]
  };

  /**
   * Compose a reply for a matched intent.
   *
   * @param {string} intentId
   * @param {object} ctx  session context assembled by js/wingman-context.js
   * @param {number} turn conversation turn, used to rotate variants
   */
  function compose(intentId, ctx, turn) {
    var variants = COMPOSERS[intentId] || COMPOSERS[GENERIC_INTENT];
    var index = Math.abs(turn || 0) % variants.length;
    var parts = variants[index](ctx || {});
    return parts.filter(Boolean).join(' ');
  }

  /**
   * The first thing Wingman says in a session, built from the analysis so it
   * does not read like a generic greeting.
   */
  function openingMessage(ctx) {
    if (!ctx || !ctx.hasAnalysis) {
      return 'I work best with something specific to go on. Run a stress check first, or just tell me here what is weighing on you and we can start from that.';
    }
    var lines = [];
    var driver = driverPhrase(ctx, 0);
    var subject = ctx.subject;

    lines.push(subject
      ? 'So this is about ' + subject + '.'
      : 'I have read what you wrote.');

    if (driver) {
      lines.push('The main thing in the wording was ' + driver + ', and you put the pressure at ' + (ctx.pressure ? ctx.pressure.value : '?') + ' out of 10.');
    }

    var step = currentStep(ctx);
    var title = stepTitle(step);
    if (title) {
      lines.push('Your next step is ' + title + '. Ask me anything about it, or tell me what is actually in the way.');
    } else {
      lines.push('Tell me what is actually in the way and we will work from there.');
    }

    return lines.join(' ');
  }

  var SUGGESTED_PROMPTS = [
    'I still cannot make myself start.',
    'Can you help me break this down?',
    'I know what I need to do, but I am overwhelmed.',
    'Can you help me think about this differently?'
  ];

  FB.fallback = {
    INTENTS: INTENTS,
    GENERIC_INTENT: GENERIC_INTENT,
    SUGGESTED_PROMPTS: SUGGESTED_PROMPTS,
    matchIntentLexically: matchIntentLexically,
    matchIntentSemantically: matchIntentSemantically,
    compose: compose,
    openingMessage: openingMessage,
    currentStep: currentStep
  };
})(window.FB = window.FB || {});
