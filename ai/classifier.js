/**
 * Free Bird stress-signal classifier.
 *
 * Two independent scorers live here and are combined explicitly:
 *
 *   1. LEXICAL  - a deterministic rule engine over word-boundary patterns.
 *                 Always available, no download, fully reproducible.
 *   2. SEMANTIC - cosine similarity between the sentence embedding of the
 *                 user's text and the mean embedding of a small set of
 *                 hand-written anchor phrases per signal. Requires the
 *                 on-device model from ai/model.js.
 *
 * The combined score is a documented weighted blend. When the model is not
 * loaded, the semantic term is simply absent and the result is marked
 * `source: "lexical"` so the interface never implies a model prediction that
 * did not happen.
 *
 * These are NON-CLINICAL language signals. They describe wording, not people,
 * and they are not diagnoses of anything.
 */
(function (FB) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Taxonomy                                                            */
  /* ------------------------------------------------------------------ */

  var SIGNALS = [
    {
      id: 'deadline-pressure',
      label: 'Deadline pressure',
      blurb: 'Language pointing at a fixed date that is close, or closer than the work is ready for.',
      anchors: [
        'my exam is in two days and I am not ready',
        'the deadline is coming up fast and I have barely started',
        'I have to submit this by friday and there is no time left',
        'everything is due at the same time next week'
      ]
    },
    {
      id: 'overwhelm',
      label: 'Overwhelm',
      blurb: 'Language suggesting the situation is being held as one large undivided thing.',
      anchors: [
        'there is too much and I do not know where to start',
        'it all feels like way too much to handle right now',
        'I am completely swamped and it keeps piling up',
        'my head is full and everything is happening at once'
      ]
    },
    {
      id: 'uncertainty',
      label: 'Uncertainty',
      blurb: 'Language about not knowing what is required, what happens next, or how it will land.',
      anchors: [
        'I do not know what they actually want from me',
        'I am not sure what happens after this or what to expect',
        'nobody has told me what the requirements are',
        'I have no idea if I am doing this the right way'
      ]
    },
    {
      id: 'avoidance',
      label: 'Avoidance',
      blurb: 'Language about putting the task off, circling it, or not being able to begin.',
      anchors: [
        'I keep putting it off and doing other things instead',
        'I cannot make myself start no matter how long I sit here',
        'I have been procrastinating on this all week',
        'I open it and then immediately close it again'
      ]
    },
    {
      id: 'rumination',
      label: 'Rumination',
      blurb: 'Language about the same thoughts repeating without resolving.',
      anchors: [
        'I keep replaying the same thing over and over in my head',
        'I cannot stop thinking about it even when I try',
        'my brain will not shut up about this at night',
        'I keep going over what I should have said'
      ]
    },
    {
      id: 'fear-of-failure',
      label: 'Fear of failure',
      blurb: 'Language about falling short, being judged, or an outcome that feels final.',
      anchors: [
        'I am scared I am going to fail this and ruin everything',
        'if I mess this up my whole future is over',
        'I am not good enough and everyone will find out',
        'I am terrified of disappointing my parents with this result'
      ]
    },
    {
      id: 'social-pressure',
      label: 'Social pressure',
      blurb: 'Language about other people: expectations, comparison, conflict, or obligation.',
      anchors: [
        'my friend has been off with me and I do not know why',
        'everyone else seems to be doing so much better than me',
        'my parents expect me to get into a specific school',
        'I feel like I cannot say no to people without upsetting them'
      ]
    },
    {
      id: 'workload-pressure',
      label: 'Workload pressure',
      blurb: 'Language about the volume of commitments rather than a single task.',
      anchors: [
        'I have practice every night on top of all my homework',
        'I am juggling a job and school and clubs at the same time',
        'there are five assignments and two projects this month',
        'my schedule is packed and there is no room in it'
      ]
    },
    {
      id: 'sleep-strain',
      label: 'Sleep-related strain',
      blurb: 'Language about short sleep, late nights, or being worn down.',
      anchors: [
        'I have been up until three every night this week',
        'I am exhausted and running on almost no sleep',
        'I lie awake and cannot fall asleep because of this',
        'I am so tired I cannot concentrate on anything'
      ]
    },
    {
      id: 'low-stress',
      label: 'Low or no detected stress',
      blurb: 'Nothing in the wording points clearly at a current source of pressure.',
      anchors: [
        'things are going pretty well at the moment',
        'I am doing fine, just checking in',
        'nothing much is going on right now',
        'I feel calm and on top of my work'
      ]
    }
  ];

  /**
   * Lexical patterns. Each entry is [regex, weight].
   *
   * Weights are hand-set on a 1 to 3 scale, where 3 means the phrase is
   * close to unambiguous for that signal and 1 means it is weak supporting
   * evidence. Total evidence per signal is normalised in scoreLexical().
   *
   * Limitation worth stating plainly: this engine matches surface wording. It
   * does not understand negation reliably ("I am not worried about the exam"
   * still matches "worried"). The semantic scorer exists partly to soften
   * that, and the interface always presents signals as things Free Bird
   * "noticed in the wording" rather than facts about the person.
   */
  var LEXICON = {
    'deadline-pressure': [
      [/\bdeadlines?\b/g, 3],
      [/\bdue\s+(today|tomorrow|tonight|this\s+week|next\s+week|soon|in\s+\w+)\b/g, 3],
      [/\bdue\s+(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, 3],
      [/\bdue\s+(at|by)\s+\w+/g, 3],
      [/\b(a|one|two|three|four|five|six|\d+)\s+(days?|weeks?|hours?)\s+(until|till|to\s+go|left)\b/g, 3],
      [/\b(until|before)\s+the\s+(deadline|exam|test|interview|recital|audition|match|show|final)\b/g, 2],
      [/\b(nowhere\s+near|not\s+close\s+to|far\s+from)\s+(ready|done|finished)\b/g, 3],
      [/\b(closes|shuts|ends)\s+(at|on)\s+\w+/g, 2],
      [/\b(exam|test|midterm|final|finals|quiz|paper|essay|assignment|project|application)s?\b/g, 1],
      [/\b(tomorrow|tonight)\b/g, 2],
      [/\b(on|by|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, 2],
      [/\bresults?\s+(come|are)\s+out\b/g, 2],
      [/\b(next|this)\s+week\b/g, 1],
      [/\brunning\s+out\s+of\s+time\b/g, 3],
      [/\bno\s+time\b/g, 2],
      [/\b(submit|hand\s+it\s+in|turn\s+it\s+in)\b/g, 2],
      [/\b(coming\s+up|approaching)\b/g, 1],
      [/\bcram(ming)?\b/g, 2]
    ],
    'overwhelm': [
      [/\boverwhelm(ed|ing)?\b/g, 3],
      [/\btoo\s+much\b/g, 3],
      [/\bso\s+much\s+(going\s+on|to\s+do|happening)\b/g, 3],
      [/\bwhere\s+to\s+even\s+(start|begin|look)\b/g, 3],
      [/\bnot\s+enough\s+(hours|time)\s+in\s+the\s+day\b/g, 3],
      [/\btoo\s+much\s+to\s+even\b/g, 3],
      [/\bevery\s+time\s+i\s+(clear|finish|tick)\b/g, 2],
      [/\bmy\s+(head|brain)\s+(feels|is)\s+like\b/g, 2],
      [/\bdon'?t\s+know\s+where\s+to\s+(start|begin)\b/g, 3],
      [/\ball\s+at\s+once\b/g, 2],
      [/\b(drowning|buried|swamped|snowed\s+under)\b/g, 3],
      [/\bpiling\s+up\b/g, 2],
      [/\bcan'?t\s+(handle|cope|keep\s+up)\b/g, 3],
      [/\b(not|barely|hardly)\s+coping\b/g, 3],
      [/\beverything\b/g, 1],
      [/\bso\s+much\s+to\s+do\b/g, 2],
      [/\bfalling\s+behind\b/g, 2],
      [/\bmy\s+(head|brain)\s+is\s+(full|everywhere)\b/g, 2]
    ],
    'uncertainty': [
      [/\b(i\s+)?don'?t\s+know\b/g, 2],
      [/\bnot\s+sure\b/g, 2],
      [/\bno\s+idea\b/g, 3],
      [/\bwaiting\s+to\s+hear\s+(back|from)\b/g, 3],
      [/\bnever\s+(written|done|made|had)\s+one\s+before\b/g, 3],
      [/\b(rubric|brief|instructions?|criteria|spec)\b/g, 2],
      [/\bnobody\s+has\s+told\s+me\b/g, 3],
      [/\bdon'?t\s+know\s+how\s+to\s+(prepare|approach|start|pick|choose)\b/g, 3],
      [/\bwhat\s+good\s+looks?\s+like\b/g, 3],
      [/\bwhat\s+if\b/g, 2],
      [/\bunclear\b/g, 3],
      [/\bconfus(ed|ing)\b/g, 3],
      [/\b(nobody|no\s+one)\s+(told|explained|said)\b/g, 3],
      [/\bwhat\s+they\s+(want|expect)\b/g, 2],
      [/\bunsure\b/g, 3],
      [/\bfigure\s+out\b/g, 1],
      [/\bmaybe\b/g, 1]
    ],
    'avoidance': [
      [/\bprocrastinat(e|ing|ion)\b/g, 3],
      [/\bputting\s+(it|everything|things|them)\s+off\b/g, 3],
      [/\bput\s+off\b/g, 2],
      [/\binstead\s+of\s+(touching|starting|doing|opening|writing|revising|studying)\b/g, 3],
      [/\bstill\s+(have\s+)?not\s+(sent|started|opened|replied|submitted|written)\b/g, 3],
      [/\bi(\s+will|'?ll)\s+(start|do\s+it|get\s+to\s+it)\s+(after|later|tomorrow|tonight)\b/g, 3],
      [/\b(have|had)\s+done\s+nothing\b/g, 3],
      [/\bevery\s+time\s+i\s+open\b/g, 3],
      [/\bkeep\s+(finding|thinking\s+of)\s+(something|other\s+things)\b/g, 2],
      [/\bkeep\s+(avoiding|delaying|postponing)\b/g, 3],
      [/\bavoid(ing)?\b/g, 2],
      [/\bcan'?t\s+(make|get|bring)\s+myself\s+(to\s+)?\w+/g, 3],
      [/\bcan'?t\s+(start|begin)\b/g, 3],
      [/\bhaven'?t\s+(started|opened|touched|done|looked\s+at)\b/g, 3],
      [/\bkeep\s+scrolling\b/g, 2],
      [/\bdistract(ed|ing|ion)\b/g, 2],
      [/\bstuck\b/g, 2],
      [/\bkeep\s+putting\b/g, 3]
    ],
    'rumination': [
      [/\bover\s+and\s+over\b/g, 3],
      [/\bcan'?t\s+stop\s+thinking\b/g, 3],
      [/\breplay(ed|ing)?\s+(it|that|the)\b/g, 3],
      [/\bgoing\s+over\s+the\s+same\b/g, 3],
      [/\bwon'?t\s+let\s+(it|that)\s+go\b/g, 3],
      [/\bround\s+and\s+round\b/g, 3],
      [/\bturn(ing)?\s+(it|the\s+same\s+\w+)\s+over\b/g, 2],
      [/\bkeep\s+(thinking|replaying|going\s+over)\b/g, 3],
      [/\b(gone|going|been)\s+over\s+(this|it|that|the)\b/g, 2],
      [/\bin\s+my\s+head\b/g, 2],
      [/\bspiral(ing|ling)?\b/g, 3],
      [/\boverthink(ing)?\b/g, 3],
      [/\b(lie|lying|lay)\s+awake\b/g, 2],
      [/\bshould\s+have\s+(said|done)\b/g, 2],
      [/\bwon'?t\s+(leave\s+my\s+head|shut\s+up)\b/g, 3],
      [/\bconstantly\b/g, 1]
    ],
    'fear-of-failure': [
      [/\bfail(ing|ure)?\b/g, 3],
      [/\b(scared|afraid|terrified|petrified)\b/g, 3],
      [/\bnot\s+good\s+enough\b/g, 3],
      [/\bin\s+front\s+of\s+(the\s+)?(whole\s+)?(class|everyone|school|team|year)\b/g, 3],
      [/\b(freeze|choke|go\s+blank)\b/g, 2],
      [/\bnever\s+(any\s+good|been\s+good)\s+at\b/g, 3],
      [/\brather\s+not\s+(go|turn\s+up|show\s+up|be\s+there)\b/g, 2],
      [/\bfind\s+out\s+(that\s+)?i(\s+am|'?m)?\s+not\b/g, 2],
      [/\bmess\s+(it|this)\s+up\b/g, 3],
      [/\bdisappoint(ing|ment)?\b/g, 3],
      [/\bruin\b/g, 3],
      [/\bembarrass(ed|ing|ment)?\b/g, 2],
      [/\bjudg(e|ed|ing|ement|ment)\b/g, 2],
      [/\bstupid\b/g, 2],
      [/\bletting\s+(everyone|them|my\s+\w+)\s+down\b/g, 3],
      [/\bwhole\s+(future|life)\b/g, 2],
      [/\bnot\s+smart\s+enough\b/g, 3],
      [/\bworried\s+(that\s+)?i(\s+will|'?ll)?\b/g, 2],
      [/\b(dreading|nervous\s+about|sick\s+about|anxious\s+about|worried\s+sick)\b/g, 2]
    ],
    'social-pressure': [
      [/\b(friend|friends|friendship)\b/g, 2],
      [/\b(parents?|mom|mum|dad|family)\b/g, 2],
      [/\b(teacher|coach|boss|manager)\b/g, 1],
      [/\beveryone\s+else\b/g, 3],
      [/\bcompar(e|ed|ing|ison)\b/g, 3],
      [/\bexpect(s|ing|ations?)?\b/g, 2],
      [/\bwhat\s+(they|people|everyone)\s+(think|thinks|will\s+think)\b/g, 3],
      [/\bcan'?t\s+say\s+no\b/g, 3],
      [/\b(fight|argument|conflict|fell\s+out|drama)\b/g, 3],
      [/\bleft\s+out\b/g, 3],
      [/\bsaid\s+yes\s+to\b/g, 2],
      [/\b(can'?t|cannot)\s+(exactly\s+)?back\s+out\b/g, 3],
      [/\b(has|have)\s+not\s+(replied|answered|got\s+back)\b/g, 2],
      [/\bevery\s+single\s+(evening|day|time|night)\b/g, 2],
      [/\basks?\s+(me\s+)?about\s+(my|it)\b/g, 2],
      [/\bkeeps?\s+(bringing\s+it\s+up|asking|mentioning)\b/g, 3],
      [/\blet\s+(them|him|her|people)\s+down\b/g, 2],
      [/\bpressure\s+from\b/g, 3]
    ],
    'workload-pressure': [
      [/\b(three|four|five|six|seven|eight|nine|ten|\d+)\s+(tests?|exams?|essays?|assignments?|projects?|papers?|applications?|deadlines?|classes|things)\b/g, 3],
      [/\bjuggl(e|ing)\b/g, 3],
      [/\btaking\s+(three|four|five|six|seven|\d+)\s+(subjects|classes|courses|modules)\b/g, 3],
      [/\bsomething\s+has\s+to\s+give\b/g, 3],
      [/\bthe\s+same\s+(week|day|weekend)\b/g, 2],
      [/\bbetween\s+(the\s+)?\w+\s+and\s+(the\s+)?\w+\s+i\b/g, 2],
      [/\b(hardly|barely|scarcely)\s+any\s+(free\s+)?time\b/g, 3],
      [/\bon\s+top\s+of\b/g, 2],
      [/\bat\s+the\s+same\s+time\b/g, 2],
      [/\b(practice|rehearsal|training|shift|shifts|club|clubs|volunteer|tutoring)\b/g, 2],
      [/\bevery\s+(night|day|evening|weekend)\b/g, 2],
      [/\bback\s+to\s+back\b/g, 2],
      [/\bschedule\b/g, 1],
      [/\bno\s+(free\s+time|room|space)\b/g, 2],
      [/\bworkload\b/g, 3],
      [/\btoo\s+many\b/g, 2]
    ],
    'sleep-strain': [
      [/\b(exhaust(ed|ing)|drained|wiped\s+out|burnt?\s+out)\b/g, 3],
      [/\btired\b/g, 2],
      [/\b(one|two|three|four|five|six|\d+)\s+hours?\s+(a|per)\s+night\b/g, 3],
      [/\bstaying\s+up\s+(until|till|til)\b/g, 3],
      [/\bmost\s+nights\b/g, 2],
      [/\bfell\s+asleep\s+(in|during)\b/g, 3],
      [/\bno\s+energy\b/g, 3],
      [/\bwiped\b/g, 2],
      [/\b(can'?t|couldn'?t)\s+sleep\b/g, 3],
      [/\bno\s+sleep\b/g, 3],
      [/\b(up|awake)\s+(until|till|til)\s+\w+\b/g, 3],
      [/\b(all\s+nighter|all-nighter)\b/g, 3],
      [/\binsomnia\b/g, 3],
      [/\b\d+\s*(hours?|hrs?)\s+of\s+sleep\b/g, 3],
      [/\blate\s+(night|nights)\b/g, 2],
      [/\brunning\s+on\s+(empty|fumes)\b/g, 3]
    ],
    'low-stress': [
      [/\b(fine|okay|ok|good|alright|well)\b/g, 1],
      [/\b(calm|relaxed|settled|steady)\b/g, 3],
      [/\bnothing\s+(much|really)\b/g, 3],
      [/\bnothing\s+is\s+really\s+wrong\b/g, 3],
      [/\b(had|having)\s+a\s+good\s+(week|day|month|term)\b/g, 3],
      [/\bpretty\s+(steady|good|chilled|relaxed|normal)\b/g, 3],
      [/\bwent\s+well\b/g, 2],
      [/\bnothing\s+i\s+would\s+call\b/g, 2],
      [/\bjust\s+checking\s+in\b/g, 3],
      [/\bon\s+top\s+of\s+(it|things|everything|my\s+\w+)\b/g, 3],
      [/\bunder\s+control\b/g, 3],
      [/\bmanageable\b/g, 3],
      [/\bexcited\b/g, 2],
      [/\blooking\s+forward\b/g, 2]
    ]
  };

  /**
   * Thinking patterns. These are separate from stress signals: they describe
   * the shape of the wording rather than the source of the pressure. They are
   * matched deterministically and always presented as observations about
   * language, never as attributes of the person.
   */
  var PATTERNS = [
    {
      id: 'all-or-nothing',
      label: 'All-or-nothing thinking',
      blurb: 'Words like always, never, everything and nothing, which tend to make a situation harder to break into parts.',
      tests: [/\b(always|never|everything|nothing|no\s+one|everyone|completely|totally|entirely)\b/g],
      minHits: 2
    },
    {
      id: 'catastrophising',
      label: 'Worst-case thinking',
      blurb: 'The wording jumps to a final, unrecoverable outcome.',
      // "over" on its own is far too common ("over and over", "think it over"),
      // so the finality sense has to be matched in context.
      tests: [
        /\b(ruin(ed|ing)?|doomed|disaster|catastrophe|whole\s+(future|life)|end\s+of\s+(the\s+world|everything))\b/g,
        /\b(everything|it|my\s+(life|future)|this)\s+is\s+(basically\s+|pretty\s+much\s+)?over\b/g,
        /\bif\s+i\s+(fail|mess|don'?t)\b/g
      ],
      minHits: 1
    },
    {
      id: 'self-criticism',
      label: 'Harsh self-talk',
      blurb: 'The wording holds you to a standard you probably would not apply to a friend.',
      tests: [/\b(stupid|lazy|useless|pathetic|idiot|worthless|failure|hopeless)\b/g, /\bi\s+should\s+have\b/g, /\bmy\s+own\s+fault\b/g],
      minHits: 1
    },
    {
      id: 'comparison',
      label: 'Comparing to others',
      blurb: 'The situation is being measured against how other people appear to be doing.',
      tests: [/\beveryone\s+(else\s+)?(is|seems|has|looks)\b/g, /\bcompar(e|ed|ing|ison)\b/g, /\bbetter\s+than\s+me\b/g, /\bfalling\s+behind\s+everyone\b/g],
      minHits: 1
    },
    {
      id: 'time-scarcity',
      label: 'Time scarcity',
      blurb: 'The wording treats available time as already gone rather than limited.',
      tests: [/\bno\s+time\b/g, /\brunning\s+out\s+of\s+time\b/g, /\b(never|not)\s+enough\s+time\b/g, /\btoo\s+late\b/g],
      minHits: 1
    },
    {
      id: 'mind-reading',
      label: 'Assuming what others think',
      blurb: 'The wording contains conclusions about other people that have not been checked with them.',
      tests: [/\bthey\s+(think|thinks|must\s+think|probably\s+think)\b/g, /\b(everyone|people)\s+(thinks|will\s+think)\b/g, /\bhates?\s+me\b/g, /\bmad\s+at\s+me\b/g],
      minHits: 1
    },
    {
      id: 'isolation',
      label: 'Carrying it alone',
      blurb: 'The wording suggests this has not been said out loud to anyone yet.',
      tests: [/\bno\s+one\s+(knows|understands|gets\s+it)\b/g, /\bby\s+myself\b/g, /\bon\s+my\s+own\b/g, /\bcan'?t\s+tell\s+anyone\b/g, /\bhaven'?t\s+told\b/g],
      minHits: 1
    }
  ];

  /** Words that raise the intensity estimate regardless of which signal fires. */
  var INTENSIFIERS = [
    [/\b(so|really|extremely|incredibly|insanely|unbelievably)\b/g, 1],
    [/\b(completely|totally|absolutely)\b/g, 1],
    [/\bcan'?t\s+(cope|handle|breathe|function|focus)\b/g, 3],
    [/\b(panic|panicking|freaking\s+out|melting\s+down|breaking\s+down)\b/g, 3],
    [/\bcrying\b/g, 2],
    [/\bevery\s+(single\s+)?(day|night)\b/g, 1],
    [/!{2,}/g, 1]
  ];

  var DAMPENERS = [
    [/\b(a\s+bit|a\s+little|slightly|kind\s+of|kinda|somewhat|mildly)\b/g, 1],
    [/\b(manageable|under\s+control|fine|okay)\b/g, 1]
  ];

  /* ------------------------------------------------------------------ */
  /* Preprocessing                                                       */
  /* ------------------------------------------------------------------ */

  var MAX_CHARS = 2000;

  /** Minimum blended score before a signal is presented as a finding. */
  var REPORT_FLOOR = 0.25;

  /**
   * Normalise for matching only. The original text is never rewritten for the
   * user and never leaves the device.
   */
  function preprocess(raw) {
    var text = String(raw == null ? '' : raw);
    var trimmed = text.trim();
    var normalised = FB.normalize.normalise(trimmed);

    return {
      original: trimmed,
      normalised: normalised,
      wordCount: normalised ? normalised.split(/\s+/).length : 0,
      sentenceCount: trimmed ? (trimmed.match(/[.!?]+/g) || []).length + 1 : 0,
      truncated: trimmed.length > MAX_CHARS,
      forModel: normalised.slice(0, MAX_CHARS)
    };
  }

  function countMatches(text, regex) {
    regex.lastIndex = 0;
    var m = text.match(regex);
    return m ? m.length : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Lexical scoring                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Returns { scores: {signalId: 0..1}, evidence: {signalId: [phrases]} }.
   *
   * Evidence totals are squashed with x / (x + k) so that a very long entry
   * mentioning "deadline" nine times does not dominate a shorter one that says
   * it twice. k is 4, chosen so that roughly two strong matches reaches ~0.6.
   */
  function scoreLexical(pre) {
    var text = pre.normalised;
    var scores = {};
    var evidence = {};
    var K = 4;

    SIGNALS.forEach(function (signal) {
      var rules = LEXICON[signal.id] || [];
      var total = 0;
      var hits = [];

      rules.forEach(function (rule) {
        var regex = rule[0];
        var weight = rule[1];
        regex.lastIndex = 0;
        var matches = text.match(regex);
        if (matches && matches.length) {
          // Cap repeats of the same rule so one repeated word cannot dominate.
          var counted = Math.min(matches.length, 3);
          total += weight * counted;
          hits.push(matches[0].trim());
        }
      });

      scores[signal.id] = total > 0 ? total / (total + K) : 0;
      evidence[signal.id] = hits;
    });

    return { scores: scores, evidence: evidence };
  }

  /* ------------------------------------------------------------------ */
  /* Semantic scoring                                                    */
  /* ------------------------------------------------------------------ */

  function cosine(a, b) {
    var dot = 0;
    var na = 0;
    var nb = 0;
    for (var i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /**
   * Rescale raw cosine similarity into a 0..1 band.
   *
   * Sentence-embedding cosines for loosely related English text usually sit
   * around 0.15 to 0.55, so mapping the whole [-1, 1] range would compress
   * everything into the middle. We map [0.10, 0.60] onto [0, 1] and clamp.
   * This is a presentation transform, documented rather than hidden, and it is
   * applied identically to every signal so the ranking is unchanged.
   */
  function rescaleSimilarity(sim) {
    var lo = 0.10;
    var hi = 0.60;
    var v = (sim - lo) / (hi - lo);
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Score signals by comparing one text embedding against each signal's
   * anchor-set centroid. Anchors are embedded once and cached by ai/model.js.
   */
  function scoreSemantic(textVector, anchorCentroids) {
    var scores = {};
    var raw = {};
    SIGNALS.forEach(function (signal) {
      var centroid = anchorCentroids[signal.id];
      if (!centroid) {
        scores[signal.id] = 0;
        raw[signal.id] = 0;
        return;
      }
      var sim = cosine(textVector, centroid);
      raw[signal.id] = sim;
      scores[signal.id] = rescaleSimilarity(sim);
    });
    return { scores: scores, raw: raw };
  }

  /* ------------------------------------------------------------------ */
  /* Patterns and intensity                                              */
  /* ------------------------------------------------------------------ */

  function detectPatterns(pre) {
    var text = pre.normalised;
    var found = [];
    PATTERNS.forEach(function (pattern) {
      var hits = 0;
      pattern.tests.forEach(function (test) {
        hits += countMatches(text, test);
      });
      if (hits >= pattern.minHits) {
        found.push({ id: pattern.id, label: pattern.label, blurb: pattern.blurb, hits: hits });
      }
    });
    found.sort(function (a, b) { return b.hits - a.hits; });
    return found.slice(0, 4);
  }

  function intensityAdjustment(pre) {
    var text = pre.normalised;
    var up = 0;
    var down = 0;
    INTENSIFIERS.forEach(function (rule) {
      up += Math.min(countMatches(text, rule[0]), 2) * rule[1];
    });
    DAMPENERS.forEach(function (rule) {
      down += Math.min(countMatches(text, rule[0]), 2) * rule[1];
    });
    return { up: up, down: down, net: up - down };
  }

  /* ------------------------------------------------------------------ */
  /* Pressure estimate                                                   */
  /* ------------------------------------------------------------------ */

  var TIMEFRAME_WEIGHT = {
    today: 1.6,
    tomorrow: 1.4,
    'this-week': 1.0,
    'next-week': 0.6,
    later: 0.2,
    none: 0,
    '': 0
  };

  /**
   * Produce a 1 to 10 pressure estimate.
   *
   * This is an arithmetic summary of four inputs, not a model output, and the
   * interface says so. The breakdown is returned so the Stress Snapshot can
   * show exactly what moved the number.
   *
   *   self-report  (0 to 4.5)  the 1 to 5 slider, the single largest input
   *   language     (0 to 3.2)  strength of the top signals
   *   intensity    (-1 to 1.6) intensifier and dampener words
   *   timeframe    (0 to 1.6)  how close the stated deadline is
   */
  function estimatePressure(signalScores, pre, context) {
    var sorted = rankSignals(signalScores);
    var top = sorted[0] ? sorted[0].score : 0;
    var second = sorted[1] ? sorted[1].score : 0;
    var stressfulTop = sorted.filter(function (s) { return s.id !== 'low-stress'; })[0];
    var languageBase = stressfulTop ? stressfulTop.score : 0;

    var selfReport = context && context.pressure ? Number(context.pressure) : 0;
    var selfComponent = selfReport ? ((selfReport - 1) / 4) * 4.5 : 0;

    var languageComponent = Math.min(3.2, (languageBase * 2.4) + (second * 0.8));

    var intensity = intensityAdjustment(pre);
    var intensityComponent = Math.max(-1, Math.min(1.6, intensity.net * 0.4));

    var timeframeComponent = TIMEFRAME_WEIGHT[context && context.timeframe ? context.timeframe : ''] || 0;

    var base = selfReport ? 1 : 2;
    var total = base + selfComponent + languageComponent + intensityComponent + timeframeComponent;

    // A clearly calm entry should not be pushed up by an unrelated slider.
    if (signalScores['low-stress'] > 0.55 && languageBase < 0.35) {
      total = Math.min(total, 4);
    }

    var value = Math.round(Math.max(1, Math.min(10, total)));

    return {
      value: value,
      band: pressureBand(value),
      breakdown: [
        { key: 'Your own rating', value: round1(selfComponent), note: selfReport ? selfReport + ' out of 5' : 'not given' },
        { key: 'Wording', value: round1(languageComponent), note: stressfulTop ? labelFor(stressfulTop.id) : 'no strong signal' },
        { key: 'Intensity words', value: round1(intensityComponent), note: intensity.up ? 'present' : 'few' },
        { key: 'Timing', value: round1(timeframeComponent), note: timeframeLabel(context && context.timeframe) }
      ]
    };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function pressureBand(value) {
    if (value <= 3) return 'low';
    if (value <= 6) return 'moderate';
    if (value <= 8) return 'high';
    return 'very high';
  }

  function timeframeLabel(tf) {
    var map = {
      today: 'today',
      tomorrow: 'tomorrow',
      'this-week': 'this week',
      'next-week': 'next week',
      later: 'later on',
      none: 'no fixed deadline'
    };
    return map[tf] || 'not given';
  }

  /* ------------------------------------------------------------------ */
  /* Combination                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Blend weights. Lexical evidence is weighted slightly higher because it is
   * precise about the exact words a student used, while the embedding model
   * contributes recall for phrasings the lexicon does not contain.
   */
  var BLEND = { lexical: 0.55, semantic: 0.45 };

  function combineScores(lexical, semantic) {
    var out = {};
    SIGNALS.forEach(function (signal) {
      var l = lexical[signal.id] || 0;
      var s = semantic ? (semantic[signal.id] || 0) : 0;
      out[signal.id] = semantic
        ? (l * BLEND.lexical) + (s * BLEND.semantic)
        : l;
    });
    return out;
  }

  function rankSignals(scores) {
    return SIGNALS
      .map(function (signal) {
        return { id: signal.id, label: signal.label, blurb: signal.blurb, score: scores[signal.id] || 0 };
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.id.localeCompare(b.id); // stable, so identical input gives identical output
      });
  }

  function labelFor(id) {
    for (var i = 0; i < SIGNALS.length; i++) {
      if (SIGNALS[i].id === id) return SIGNALS[i].label;
    }
    return id;
  }

  /**
   * Signals worth showing.
   *
   * Two rules, both deliberate:
   *   - a floor of 0.25, so weak incidental matches are not presented as
   *     findings
   *   - "low stress" wins outright when it scores higher than anything else,
   *     because a calm entry that happens to contain one stress-adjacent
   *     phrase ("on top of my work") should not be reported as workload
   *     pressure. Low stress is never mixed with real signals.
   */
  function selectReportable(ranked) {
    var lowStress = ranked.filter(function (s) { return s.id === 'low-stress'; })[0];
    var present = ranked.filter(function (s) { return s.id !== 'low-stress' && s.score > 0; });
    var strong = present.filter(function (s) { return s.score >= REPORT_FLOOR; });

    // A clear calm signal outranks everything, so a calm entry containing one
    // stress-adjacent phrase is not reported as a stressor.
    if (lowStress && lowStress.score >= REPORT_FLOOR && (!strong.length || lowStress.score > strong[0].score)) {
      return [lowStress];
    }
    if (strong.length) return strong.slice(0, 3);

    // Weak but real evidence. Reporting the best available signal is more
    // honest than announcing "no stress detected" when the calm score is zero
    // and something stressful clearly scored above it.
    if (present.length) return present.slice(0, 1);

    return lowStress ? [lowStress] : [];
  }

  /**
   * How much the wording actually supported the top signal. The snapshot uses
   * this to say plainly when it is working from thin evidence rather than
   * presenting a weak match with the same confidence as a strong one.
   */
  function evidenceStrength(reportable) {
    if (!reportable.length) return 'none';
    if (reportable[0].id === 'low-stress') return 'calm';
    return reportable[0].score >= REPORT_FLOOR ? 'clear' : 'thin';
  }

  FB.classifier = {
    SIGNALS: SIGNALS,
    PATTERNS: PATTERNS,
    LEXICON: LEXICON,
    MAX_CHARS: MAX_CHARS,
    REPORT_FLOOR: REPORT_FLOOR,
    BLEND: BLEND,
    evidenceStrength: evidenceStrength,
    preprocess: preprocess,
    scoreLexical: scoreLexical,
    scoreSemantic: scoreSemantic,
    combineScores: combineScores,
    rankSignals: rankSignals,
    selectReportable: selectReportable,
    detectPatterns: detectPatterns,
    intensityAdjustment: intensityAdjustment,
    estimatePressure: estimatePressure,
    pressureBand: pressureBand,
    labelFor: labelFor,
    cosine: cosine
  };
})(window.FB = window.FB || {});
