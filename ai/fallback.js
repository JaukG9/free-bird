/**
 * Wingman response engine.
 *
 * IMPORTANT, and stated the same way in the interface and the README:
 * Free Bird does not ship a generative language model. Wingman replies are
 * composed here from a structured template set, filled with the user's own
 * session context and the wording of the message they just sent. What the
 * on-device model contributes, when it is loaded, is INTENT MATCHING: the
 * message is embedded and compared against anchor phrases for each intent.
 * When the model is not loaded, the same intents are matched lexically.
 *
 * So there are two honest labels the interface can show for any reply:
 *   "matched on device"  - embedding similarity chose the intent
 *   "matched by rules"   - the lexical matcher chose the intent
 * In both cases the words themselves are written, not generated, and the app
 * says so rather than implying a language model wrote them.
 *
 * How a reply is built
 * --------------------
 * Earlier versions kept two or three finished paragraphs per intent and cycled
 * between them. That repeated itself quickly and, worse, ignored everything in
 * the message except which intent it landed in: "my mum keeps asking about my
 * SAT score" and "my friend group has gone weird" got the same paragraph.
 *
 * A reply is now assembled from four slots, each drawn from its own pool:
 *
 *   reflect  say back what they actually wrote, using their nouns
 *   insight  the observation this intent is worth making
 *   move     one concrete action, sized to their pressure and their deadline
 *   ask      a question that hands the turn back
 *
 * Slots are chosen deterministically from the intent, the turn, and a hash of
 * the message, so the same input always produces the same reply (which the
 * tests and the scripted demo depend on) while real conversations vary widely.
 * Before a reply is returned it is checked for at least one reference to the
 * user's own session, and grounded if it has none.
 */
(function (FB) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Intents                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * `anchors` are natural sentences used to build embedding centroids.
   * `patterns` are weighted regular expressions for the lexical matcher: 3 for
   * wording that means only this intent, 2 for wording that usually does, and
   * 1 for a hint that should never win on its own.
   *
   * Patterns run against text that ai/normalize.js has already passed over, so
   * they must be written in CONTRACTED form. "there is not enough time" reaches
   * this file as "there isn't enough time", and a pattern spelling out "is not"
   * will never fire. There is a test that checks for exactly this mistake.
   */
  var INTENTS = [
    {
      id: 'cannot-start',
      anchors: [
        'I still cannot make myself start',
        'I keep sitting here and not doing it',
        'I open the document and then do something else',
        'I know what to do but I am not doing it'
      ],
      patterns: [
        { re: /\bcan'?t\s+(start|begin|make\s+myself|get\s+going|bring\s+myself)/, w: 3 },
        { re: /\bstill\s+haven'?t\s+started\b/, w: 3 },
        { re: /\bkeep\s+putting\s+(it|this|everything)\s+off\b/, w: 3 },
        { re: /\bprocrastinat/, w: 3 },
        { re: /\b(not|haven'?t\s+been)\s+starting\b/, w: 2 },
        { re: /\bkeep\s+(avoiding|delaying|postponing)\b/, w: 2 },
        { re: /\b(i'?ll|i\s+will)\s+do\s+it\s+(later|tomorrow|tonight)\b/, w: 3 },
        { re: /\bkeep\s+saying\s+i'?ll\b/, w: 3 },
        { re: /\bput\s+it\s+off\s+again\b/, w: 3 },
        { re: /\bstuck\b/, w: 1 },
        { re: /\bstaring\s+at\b/, w: 1 }
      ]
    },
    {
      id: 'break-it-down',
      anchors: [
        'can you help me break this down',
        'how do I split this into steps',
        'what should I actually do first',
        'give me a smaller version of this task'
      ],
      patterns: [
        { re: /\bbreak\s+(it|this|that|them)\s+down\b/, w: 3 },
        { re: /\bstep\s+by\s+step\b/, w: 3 },
        { re: /\bsmaller\s+(steps?|pieces?|chunks?|version)\b/, w: 3 },
        { re: /\bwhere\s+(do|should)\s+i\s+start\b/, w: 2 },
        { re: /\bwhat\s+(should|do)\s+i\s+do\s+first\b/, w: 2 },
        { re: /\bhelp\s+me\s+plan\b/, w: 2 },
        { re: /\bmake\s+a\s+(plan|list)\b/, w: 2 },
        { re: /\bsplit\s+(it|this)\s+up\b/, w: 2 }
      ]
    },
    {
      id: 'overwhelmed',
      anchors: [
        'I know what I need to do but I am overwhelmed',
        'there is just too much of it',
        'everything is hitting at once and I cannot hold it',
        'my head is completely full'
      ],
      patterns: [
        { re: /\boverwhelm/, w: 3 },
        { re: /\bdrowning\b/, w: 3 },
        { re: /\ball\s+at\s+once\b/, w: 2 },
        { re: /\btoo\s+much\b/, w: 2 },
        { re: /\bcan'?t\s+(cope|handle|keep\s+up)\b/, w: 2 },
        { re: /\bpiling\s+up\b/, w: 2 },
        { re: /\bhead\s+is\s+(full|spinning|everywhere)\b/, w: 2 },
        { re: /\beverything\b/, w: 1 }
      ]
    },
    {
      id: 'reframe',
      anchors: [
        'can you help me think about this differently',
        'I want another way to look at this',
        'is there a better way to see this situation',
        'help me get some perspective on it'
      ],
      patterns: [
        { re: /\bthink\s+about\s+(this|it)\s+differently\b/, w: 3 },
        { re: /\banother\s+way\s+to\s+(see|look|think)\b/, w: 3 },
        { re: /\breframe\b/, w: 3 },
        { re: /\bperspective\b/, w: 2 },
        { re: /\bam\s+i\s+overreacting\b/, w: 2 },
        { re: /\bis\s+(this|it)\s+really\s+that\s+bad\b/, w: 2 },
        { re: /\bdifferent\s+way\b/, w: 1 }
      ]
    },
    {
      id: 'fear',
      anchors: [
        'I am scared I am going to fail',
        'what if I mess the whole thing up',
        'I am not good enough for this',
        'everyone will see that I got it wrong'
      ],
      patterns: [
        { re: /\b(not|isn'?t|aren'?t)\s+good\s+enough\b/, w: 3 },
        { re: /\b(scared|afraid|terrified)\b/, w: 3 },
        { re: /\bgoing\s+to\s+fail\b/, w: 3 },
        { re: /\bmess\s+(it|this)\s+up\b/, w: 3 },
        { re: /\bfail/, w: 2 },
        { re: /\bdisappoint/, w: 2 },
        { re: /\bhate\s+(speaking|presenting|public\s+speaking)\b/, w: 3 },
        { re: /\bin\s+front\s+of\s+(the\s+)?(class|everyone|people|them)\b/, w: 3 },
        { re: /\bembarrass/, w: 2 },
        { re: /\bwhat\s+if\b/, w: 1 },
        { re: /\bworried\b/, w: 1 }
      ]
    },
    {
      id: 'no-time',
      anchors: [
        'there is not enough time left for any of this',
        'the deadline is too close now',
        'I do not have time to do exercises',
        'it is already too late to start'
      ],
      patterns: [
        { re: /\benough\s+time\b/, w: 3 },
        { re: /\brunning\s+out\s+of\s+time\b/, w: 3 },
        { re: /\btoo\s+late\b/, w: 3 },
        { re: /\bno\s+time\b/, w: 2 },
        { re: /\bdue\s+(today|tomorrow|tonight|in\s+\w+)\b/, w: 2 },
        { re: /\bonly\s+\w+\s+(hours?|days?)\b/, w: 2 },
        { re: /\bdeadline\s+is\s+(today|tomorrow|tonight|so\s+close)\b/, w: 2 }
      ]
    },
    {
      id: 'people',
      anchors: [
        'my friend has been strange with me',
        'my parents keep bringing it up',
        'I do not know how to say no to them',
        'there is tension with someone and it is sitting on me'
      ],
      patterns: [
        { re: /\bsay\s+no\b/, w: 3 },
        { re: /\bthey\s+(think|expect|keep|said|want)\b/, w: 2 },
        { re: /\b(my|our)\s+(friend|friends|parents?|mom|mum|dad|family|teacher|coach|classmate|roommate|professor|boss|sister|brother)\b/, w: 2 },
        { re: /\b(friends?|parents?|classmates?|teacher)\b/, w: 1 },
        { re: /\bwhat\s+(people|they|everyone)\s+think\b/, w: 3 },
        { re: /\bstop\s+caring\b/, w: 3 },
        { re: /\bjudging\s+me\b/, w: 3 },
        { re: /\bfell\s+out\b/, w: 2 },
        { re: /\bawkward\s+with\b/, w: 2 },
        { re: /\b(not|isn'?t|aren'?t)\s+talking\s+to\s+me\b/, w: 2 }
      ]
    },
    {
      id: 'comparison',
      anchors: [
        'everyone else is doing better than me',
        'they all seem to have it together',
        'I am behind everybody in my year',
        'my friends are all ahead of me'
      ],
      patterns: [
        { re: /\beveryone\s+else\b/, w: 3 },
        { re: /\bbehind\s+everyone\b/, w: 3 },
        { re: /\bcompar(e|ing|ison)/, w: 3 },
        { re: /\bthey\s+all\s+(seem|have|are)\b/, w: 2 },
        { re: /\b(better|further|ahead)\s+than\s+me\b/, w: 3 },
        { re: /\bthe\s+only\s+one\b/, w: 3 },
        { re: /\b(way\s+)?(further|more)\s+ahead\b/, w: 3 },
        { re: /\bso\s+(far\s+)?behind\b/, w: 3 },
        { re: /\beveryone\b.{0,25}\b(ahead|further|done|finished|better|already)\b/, w: 3 },
        { re: /\bfell\s+behind\b/, w: 2 }
      ]
    },
    {
      id: 'perfectionism',
      anchors: [
        'it has to be perfect before I can hand it in',
        'I keep redoing the same paragraph',
        'nothing I write is good enough to keep',
        'I cannot stop editing it'
      ],
      patterns: [
        { re: /\b(has|have|needs?)\s+to\s+be\s+perfect\b/, w: 3 },
        { re: /\bkeep\s+(redoing|rewriting|restarting|editing|changing)\b/, w: 3 },
        { re: /\bperfectionis/, w: 3 },
        { re: /\bnever\s+(good|finished|done)\s+enough\b/, w: 2 },
        { re: /\bstart(ed)?\s+over\s+again\b/, w: 2 },
        { re: /\bcan'?t\s+stop\s+(fixing|tweaking)\b/, w: 2 }
      ]
    },
    {
      id: 'focus',
      anchors: [
        'I sit down and then I am on my phone again',
        'I cannot concentrate for more than five minutes',
        'I keep getting distracted by everything',
        'I read the same line over and over'
      ],
      patterns: [
        { re: /\bcan'?t\s+(focus|concentrate)\b/, w: 3 },
        { re: /\bkeep\s+getting\s+distracted\b/, w: 3 },
        { re: /\b(on|check(ing)?)\s+my\s+phone\b/, w: 3 },
        { re: /\bdistract/, w: 2 },
        { re: /\bmind\s+keeps\s+wandering\b/, w: 2 },
        { re: /\bsame\s+(line|page|paragraph)\s+(over|again)\b/, w: 2 },
        { re: /\btiktok|instagram|youtube|scrolling\b/, w: 2 }
      ]
    },
    {
      id: 'tired',
      anchors: [
        'I am exhausted and cannot focus',
        'I have barely slept this week',
        'I have no energy left for this',
        'I am running on nothing'
      ],
      patterns: [
        { re: /\bbarely\s+slept\b/, w: 3 },
        { re: /\bburn(t|ed)?\s+out\b/, w: 3 },
        { re: /\bno\s+energy\b/, w: 3 },
        { re: /\b(exhaust|drained)/, w: 3 },
        { re: /\b(sleep|slept|insomnia|awake)\b/, w: 2 },
        { re: /\btired\b/, w: 2 },
        { re: /\bup\s+(all|half\s+the)\s+night\b/, w: 2 }
      ]
    },
    {
      id: 'guilt',
      anchors: [
        'I wasted the entire day and I feel terrible',
        'I feel so lazy about all of this',
        'I should be further along than I am',
        'I keep letting people down'
      ],
      patterns: [
        { re: /\bwasted\s+(the|my|another)\s+(day|week|weekend|afternoon)\b/, w: 3 },
        { re: /\b(feel|feeling)\s+(so\s+)?(lazy|useless|pathetic|guilty)\b/, w: 3 },
        { re: /\bletting\s+(people|everyone|them|myself)\s+down\b/, w: 3 },
        { re: /\bi\s+should\s+(be|have)\b/, w: 2 },
        { re: /\bmy\s+own\s+fault\b/, w: 2 },
        { re: /\bwhy\s+(does|do)\s+(this|i)\s+always\b/, w: 3 },
        { re: /\balways\s+happens?\s+to\s+me\b/, w: 3 },
        { re: /\bwhat'?s\s+wrong\s+with\s+me\b/, w: 3 },
        { re: /\bhate\s+myself\b/, w: 2 }
      ]
    },
    {
      id: 'decide',
      anchors: [
        'I cannot decide which one to do first',
        'should I do this one or the other one',
        'I keep going back and forth on it',
        'I do not know which option to pick'
      ],
      patterns: [
        { re: /\bcan'?t\s+decide\b/, w: 3 },
        { re: /\bback\s+and\s+forth\b/, w: 3 },
        { re: /\bwhich\s+(one|option)\b/, w: 2 },
        { re: /\bshould\s+i\s+.{0,40}\bor\b/, w: 2 },
        { re: /\btorn\s+between\b/, w: 3 },
        { re: /\bno\s+idea\s+which\b/, w: 3 },
        { re: /\bwhich\s+(one\s+)?to\s+(do|start|pick)\b/, w: 3 },
        { re: /\bwhat\s+to\s+do\s+first\b/, w: 2 },
        { re: /\btwo\s+minds\b/, w: 2 }
      ]
    },
    {
      id: 'rumination-loop',
      anchors: [
        'I keep replaying the same thing in my head',
        'I cannot stop thinking about it',
        'it goes round and round at night',
        'my brain will not let it go'
      ],
      patterns: [
        { re: /\bcan'?t\s+stop\s+thinking\b/, w: 3 },
        { re: /\bkeep\s+(replaying|going\s+over|thinking\s+about)\b/, w: 3 },
        { re: /\bround\s+and\s+round\b/, w: 3 },
        { re: /\boverthink/, w: 3 },
        { re: /\bwon'?t\s+shut\s+up\b/, w: 3 },
        { re: /\bstop\s+replaying\b/, w: 3 },
        { re: /\bbrain\s+won'?t\b/, w: 3 },
        { re: /\blying\s+awake\b/, w: 2 },
        { re: /\bspiral/, w: 2 },
        { re: /\bin\s+my\s+head\b/, w: 1 }
      ]
    },
    {
      id: 'venting',
      anchors: [
        'I just feel awful about all of it',
        'I hate this whole situation',
        'today has been genuinely terrible',
        'I just needed to say it somewhere'
      ],
      patterns: [
        { re: /\bjust\s+need(ed)?\s+to\s+(say|vent|get\s+it\s+out)\b/, w: 3 },
        { re: /\b(vent|rant)\b/, w: 3 },
        { re: /\bi\s+hate\s+(this|everything|it)\b/, w: 2 },
        { re: /\b(awful|terrible|miserable|horrible)\b/, w: 2 },
        { re: /\bnothing\s+feels\s+worth\b/, w: 3 },
        { re: /\bcan'?t\s+be\s+bothered\b/, w: 3 },
        { re: /\bnumb\b/, w: 2 },
        { re: /\bi\s+(just\s+)?(feel|felt)\b/, w: 1 }
      ]
    },
    {
      id: 'pushback',
      anchors: [
        'that will not work for me',
        'I have already tried that and it did not help',
        'this feels pointless',
        'that advice is too generic'
      ],
      patterns: [
        { re: /\balready\s+tried\b/, w: 3 },
        { re: /\btoo\s+generic\b/, w: 3 },
        { re: /\b(won'?t|doesn'?t|didn'?t)\s+(work|help)\b/, w: 3 },
        { re: /\bpointless\b/, w: 2 },
        { re: /\b(not|isn'?t|wasn'?t)\s+helpful\b/, w: 2 },
        { re: /\beasy\s+for\s+you\s+to\s+say\b/, w: 3 },
        { re: /\bthat'?s\s+(useless|obvious)\b/, w: 2 }
      ]
    },
    {
      id: 'what-now',
      anchors: [
        'what should I do now',
        'what is my next step',
        'what happens after this',
        'okay so what now'
      ],
      patterns: [
        { re: /\bnext\s+step\b/, w: 3 },
        { re: /\bwhat\s+(should\s+i\s+do\s+)?now\b/, w: 3 },
        { re: /\bwhat\s+(comes\s+)?(after|next)\b/, w: 2 },
        { re: /\bwhat\s+do\s+i\s+do\b/, w: 2 },
        { re: /\bwhere\s+to\s+from\s+here\b/, w: 2 },
        { re: /\b(just\s+)?tell\s+me\s+what\s+to\s+do\b/, w: 3 },
        { re: /\bgive\s+me\s+(a\s+)?(step|something)\b/, w: 2 }
      ]
    },
    {
      id: 'explain-exercise',
      anchors: [
        'what is this exercise supposed to do',
        'why did you pick that step for me',
        'how does the calm step work',
        'what happens if I skip a step'
      ],
      patterns: [
        { re: /\bwhy\s+(did|does)\s+(you|it)\s+(pick|choose|give)\b/, w: 3 },
        { re: /\bwhat\s+is\s+(the\s+)?(calm|clarify|act)\s+step\b/, w: 3 },
        { re: /\bhow\s+(does|do)\s+(this|that|the)\s+(exercise|step|plan)\b/, w: 3 },
        { re: /\bwhat\s+(is|does)\s+.{0,30}\b(breathing|grounding|body\s+scan|brain\s+dump)\b/, w: 3 },
        { re: /\bskip\s+(a\s+)?step\b/, w: 2 },
        { re: /\bwhy\s+(that|this)\s+one\b/, w: 2 }
      ]
    },
    {
      id: 'positive',
      anchors: [
        'that actually helped a lot',
        'thanks, I feel a bit better',
        'okay that makes sense now',
        'I managed to get started'
      ],
      patterns: [
        { re: /\b(thanks|thank\s+you)\b/, w: 3 },
        { re: /\b(that\s+)?(helped|was\s+helpful)\b/, w: 3 },
        { re: /\bfeel(ing)?\s+(a\s+bit\s+)?better\b/, w: 3 },
        { re: /\b(makes|made)\s+sense\b/, w: 2 },
        { re: /\bi\s+(got\s+started|did\s+it|finished\s+it)\b/, w: 3 }
      ]
    },
    {
      id: 'about-app',
      anchors: [
        'are you a real therapist',
        'is this private, where does my text go',
        'what are you exactly',
        'how does this app work'
      ],
      patterns: [
        { re: /\b(are\s+you|you'?re)\s+(a\s+)?(real\s+)?(therapist|human|person|ai|bot|robot|doctor|counsell?or|machine)\b/, w: 3 },
        { re: /\bis\s+this\s+private\b/, w: 3 },
        { re: /\bwhere\s+does\s+my\s+(data|text|writing)\s+go\b/, w: 3 },
        { re: /\bwhat\s+are\s+you\b/, w: 3 },
        { re: /\bhow\s+(does\s+this|do\s+you)\s+work\b/, w: 2 },
        { re: /\bdo\s+you\s+(store|save|send)\b/, w: 2 },
        { re: /\b(data|writing|text|info)\s+(is\s+)?safe\b/, w: 3 },
        { re: /\bsafe\s+here\b/, w: 3 },
        { re: /\bwho\s+(can\s+)?(see|reads?)\b/, w: 3 }
      ]
    },
    {
      id: 'uncertainty',
      anchors: [
        'I do not know what is actually being asked of me',
        'I am not sure what they want from this',
        'the instructions do not make sense to me',
        'I do not know what good is supposed to look like here'
      ],
      patterns: [
        { re: /\bdon'?t\s+(even\s+)?know\s+what\s+(they|he|she|it|the\s+\w+)\s+want/, w: 3 },
        { re: /\bno\s+idea\s+what\b/, w: 3 },
        { re: /\bwhat\s+(is\s+)?(actually\s+)?expected\b/, w: 3 },
        { re: /\bdon'?t\s+(understand|get)\s+(the|this)\s+(question|task|assignment|brief|topic)\b/, w: 3 },
        { re: /\bnot\s+sure\s+what\b/, w: 2 },
        { re: /\b(instructions?|brief|rubric|criteria)\b/, w: 2 },
        { re: /\bunclear\b/, w: 2 },
        { re: /\bwhat\s+good\s+looks?\s+like\b/, w: 3 }
      ]
    },
    {
      id: 'greeting',
      anchors: [
        'hi there',
        'hey',
        'hello, are you there',
        'good evening'
      ],
      patterns: [
        { re: /^(hi|hey|hello|yo|sup|hiya)\b/, w: 3 },
        { re: /^good\s+(morning|afternoon|evening)\b/, w: 3 },
        { re: /^(are\s+you\s+there|anyone\s+there)\b/, w: 2 }
      ]
    }
  ];

  var GENERIC_INTENT = 'general';

  /* ------------------------------------------------------------------ */
  /* Reading the message                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Nouns worth quoting back. Saying "the group project" instead of "this" is
   * the single cheapest thing that makes a reply feel like it was read rather
   * than retrieved. The phrase is echoed exactly as matched, never reworded.
   */
  var TASK_PATTERNS = [
    /\b((?:my|the)\s+(?:\w+\s+){0,2}(?:essay|paper|thesis|dissertation|report|assignment|homework|coursework|project|presentation|speech|recital|audition|interview|tryout|performance|competition|portfolio|application|scholarship|exam|test|final|midterm|quiz|lab|deadline))\b/,
    /\b((?:three|four|five|six|seven|eight|nine|ten|two|\d+)\s+(?:\w+\s+)?(?:tests?|exams?|essays?|assignments?|projects?|papers?|finals?|deadlines?|midterms?|applications?))\b/,
    /\b(group\s+project)\b/,
    /\b(driving\s+test)\b/,
    /\b((?:college|university|scholarship|job)\s+applications?)\b/
  ];

  var PEOPLE_PATTERN = /\b(my\s+(?:mom|mum|dad|parents|family|friend|friends|teacher|coach|professor|boss|roommate|sister|brother|partner|tutor|counsellor)|my\s+best\s+friend)\b/;

  var WHEN_PATTERNS = [
    /\b(tonight|today|tomorrow|this\s+afternoon|this\s+evening)\b/,
    /\b(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b(this|next)\s+(week|weekend|month|term|semester)\b/,
    /\bin\s+(a|an|one|two|three|four|five|\d+)\s+(hours?|days?|weeks?)\b/,
    /\bby\s+(\w+day|the\s+\w+|then)\b/
  ];

  var AFFIRMATIVE = /^(yes|yeah|yep|yup|ok|okay|sure|fine|true|right|correct|i\s+guess|kind\s+of|kinda|maybe|mhm|definitely|exactly|pretty\s+much)\b/;
  var NEGATIVE = /^(no|nope|nah|not\s+really|never|i\s+don'?t\s+know|idk|dunno|not\s+sure|no\s+idea)\b/;

  /**
   * Pull the usable facts out of a message.
   *
   * Everything here is pattern matching over the user's own words. Nothing is
   * inferred about the person, and nothing is stored.
   */
  function readMessage(raw) {
    var original = String(raw == null ? '' : raw).trim();
    var text = FB.normalize.normalise(original);
    var words = text ? text.split(/\s+/).length : 0;

    var task = null;
    for (var i = 0; i < TASK_PATTERNS.length; i++) {
      var m = text.match(TASK_PATTERNS[i]);
      if (m && m[1]) { task = m[1].replace(/^(my|the)\s+/, ''); break; }
    }

    // Stored ready to be said back. The user writes "my mum"; a reply that
    // repeats that verbatim reads as though Wingman has a mother in this.
    var person = null;
    var personRaw = null;
    var pm = text.match(PEOPLE_PATTERN);
    if (pm && pm[1]) {
      personRaw = pm[1];
      person = personRaw.replace(/^my\b/, 'your');
    }

    var when = null;
    for (var j = 0; j < WHEN_PATTERNS.length; j++) {
      var wm = text.match(WHEN_PATTERNS[j]);
      if (wm) { when = wm[0].replace(/^(on|by)\s+/, ''); break; }
    }

    var quantity = null;
    var qm = text.match(/\b(\d+)\s+(tests?|exams?|essays?|assignments?|projects?|papers?|things?|deadlines?|hours?|days?)\b/);
    if (qm) quantity = { count: Number(qm[1]), unit: qm[2] };

    return {
      original: original,
      text: text,
      words: words,
      empty: words === 0,
      isQuestion: /\?/.test(original) || /^(what|how|why|when|where|who|which|can|could|should|would|is|are|do|does|did|will)\b/.test(text),
      isShort: words > 0 && words <= 4,
      isAffirmative: AFFIRMATIVE.test(text),
      isNegative: NEGATIVE.test(text),
      task: task,
      person: person,
      personRaw: personRaw,
      when: when,
      quantity: quantity,
      urgent: /\b(today|tonight|tomorrow|in\s+an?\s+hour|right\s+now)\b/.test(text)
    };
  }

  /* ------------------------------------------------------------------ */
  /* Intent matching                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Weighted lexical match.
   *
   * Returns the best intent plus the runner-up, so a message that is genuinely
   * about two things ("I am exhausted and the deadline is tomorrow") can be
   * answered as such rather than being forced into one bucket.
   */
  function matchIntentLexically(message) {
    var read = readMessage(message);
    var scored = [];

    INTENTS.forEach(function (intent) {
      var score = 0;
      var hits = 0;
      intent.patterns.forEach(function (pattern) {
        pattern.re.lastIndex = 0;
        if (pattern.re.test(read.text)) {
          score += pattern.w;
          hits++;
        }
      });
      // Two independent matches is better evidence than one strong one.
      if (hits > 1) score += hits - 1;
      if (score > 0) scored.push({ id: intent.id, score: score, hits: hits });
    });

    scored.sort(function (a, b) { return b.score - a.score; });

    if (!scored.length) {
      return { intent: GENERIC_INTENT, confidence: null, method: 'rules', hits: 0, score: 0, secondary: null, read: read };
    }

    var best = scored[0];
    var runnerUp = scored[1] || null;

    return {
      intent: best.id,
      confidence: null,
      method: 'rules',
      hits: best.hits,
      score: best.score,
      // Only worth mentioning when it is nearly as strong as the winner.
      secondary: (runnerUp && runnerUp.score >= best.score - 1 && runnerUp.score >= 3) ? runnerUp.id : null,
      read: read
    };
  }

  /**
   * Embedding-based intent match. Returns null when the model or the intent
   * centroids are not available, so the caller can fall back to rules.
   */
  function matchIntentSemantically(vector, intentCentroids) {
    if (!vector || !intentCentroids) return null;
    var best = null;
    var bestSim = -1;
    var secondId = null;
    var second = -1;

    INTENTS.forEach(function (intent) {
      var centroid = intentCentroids[intent.id];
      if (!centroid) return;
      var sim = FB.classifier.cosine(vector, centroid);
      if (sim > bestSim) {
        second = bestSim;
        secondId = best;
        bestSim = sim;
        best = intent.id;
      } else if (sim > second) {
        second = sim;
        secondId = intent.id;
      }
    });

    // Below this similarity the match is not meaningful, so we hand back the
    // generic intent rather than pretending to have understood.
    if (bestSim < 0.28) {
      return { intent: GENERIC_INTENT, confidence: bestSim, method: 'on-device', margin: bestSim - second, secondary: null };
    }

    return {
      intent: best,
      confidence: bestSim,
      method: 'on-device',
      margin: bestSim - second,
      secondary: (bestSim - second < 0.06 && second >= 0.28) ? secondId : null
    };
  }

  /* ------------------------------------------------------------------ */
  /* Context helpers                                                     */
  /* ------------------------------------------------------------------ */

  /** What this conversation is about, preferring the words used just now. */
  function subjectOf(ctx, read) {
    if (read && read.task) return read.task;
    if (ctx && ctx.subject) return ctx.subject;
    return 'this';
  }

  /** Their own noun, or null. Used where a generic word would be worse. */
  function theirNoun(ctx, read) {
    if (read && read.task) return read.task;
    if (ctx && ctx.subject) return ctx.subject;
    return null;
  }

  function currentStep(ctx) {
    if (!ctx || !ctx.plan || !ctx.plan.steps) return null;
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

  function stepDuration(step) {
    if (!step) return null;
    var exercise = FB.exercises.get(step.exerciseId);
    return exercise ? exercise.duration : null;
  }

  function driverPhrase(ctx, index) {
    var drivers = (ctx && ctx.drivers) || [];
    var driver = drivers[index || 0];
    if (!driver) return null;
    return String(driver.label || '').toLowerCase();
  }

  function pressureValue(ctx) {
    return (ctx && ctx.pressure && typeof ctx.pressure.value === 'number') ? ctx.pressure.value : null;
  }

  function isHighPressure(ctx) {
    var p = pressureValue(ctx);
    return p !== null && p >= 7;
  }

  /** How long a suggested move should take, given the deadline they named. */
  function moveSize(ctx, read) {
    if ((read && read.urgent) || (ctx && ctx.timeframe === 'today') || (ctx && ctx.timeframe === 'tomorrow')) {
      return 'two minutes';
    }
    if (isHighPressure(ctx)) return 'five minutes';
    return 'ten minutes';
  }

  function deadlineWord(ctx, read) {
    if (read && read.when) return read.when;
    if (!ctx) return null;
    var map = {
      today: 'today', tomorrow: 'tomorrow', 'this-week': 'this week',
      'next-week': 'next week', later: 'later on', none: null
    };
    return map[ctx.timeframe] || null;
  }

  /* ------------------------------------------------------------------ */
  /* Slot pools                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Openers for questions about what Free Bird is.
   *
   * Being asked "are you a therapist" has exactly one acceptable first word,
   * and it cannot depend on which variant the rotation lands on, so that case
   * short-circuits the pool. Everything else rotates normally.
   */
  var IS_IT_A_PERSON = /\b(therapist|counsell?or|doctor|psychiatrist|human|person|real|bot|robot|ai)\b/;

  function aboutAppOpener(read, index) {
    if (read && IS_IT_A_PERSON.test(read.text)) {
      return 'No. Free Bird is a study and stress tool, not therapy, not a diagnosis, and not an emergency service.';
    }
    return [
      'Fair question, and the answer should be plain.',
      'Practically: the analysis runs inside this page, in your browser.',
      'Worth being exact about this.',
      'Short version, because this one matters.'
    ][index % 4];
  }

  /**
   * Every intent supplies four pools. A slot function may return null, in
   * which case the picker moves on to the next option in that pool, so a slot
   * can be conditional on context without leaving a hole in the sentence.
   */
  var COMPOSERS = {
    'cannot-start': {
      reflect: [
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Starting on ' + noun + ' is the part that keeps not happening.' : null;
        },
        function () { return 'You are not avoiding the work so much as the moment of beginning it.'; },
        function (ctx) { return isHighPressure(ctx) ? 'At this level of pressure, the not-starting is a symptom rather than the problem.' : 'The gap between deciding and starting is where this is getting stuck.'; },
        function () { return 'Sitting with something undone costs more attention than doing it usually does.'; }
      ],
      insight: [
        function (ctx, read) { return 'Right now ' + subjectOf(ctx, read) + ' is showing up as one whole thing rather than a first move.'; },
        function () { return 'When starting keeps failing, it usually means the step is still too big, not that you are not trying.'; },
        function () { return 'Avoidance is a fast way to feel better for ten minutes and worse for the rest of the day, which is why it is so easy to repeat.'; },
        function () { return 'The version of the task in your head is always heavier than the version on the page.'; }
      ],
      move: [
        function (ctx, read) {
          return 'Shrink it until it is almost too small to refuse: ' + moveSize(ctx, read) + ' on one piece, then you are allowed to stop.';
        },
        function () { return 'Set a timer for two minutes, open the file, and do nothing else. Stopping when it goes off is permitted.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return 'Say the smallest version out loud. Not "finish ' + (noun || 'it') + '", but "write one bad sentence of it".';
        },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return title ? 'Your ' + step.label.toLowerCase() + ' step is ' + title + ', about ' + stepDuration(step) + ', and it is built for exactly this.' : null;
        }
      ],
      ask: [
        function () { return 'What is one piece of it you could work on and then stop?'; },
        function () { return 'What would the first two minutes actually look like?'; },
        function () { return 'What happens in the moment you go to start? That detail usually tells us which fix to use.'; }
      ]
    },

    'break-it-down': {
      reflect: [
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Let us take ' + noun + ' apart properly.' : 'Let us take it apart properly.';
        },
        function () { return 'Good instinct. A thing you can list is much lighter than a thing you can only feel.'; },
        function (ctx, read) {
          return read && read.quantity ? 'With ' + read.quantity.count + ' ' + read.quantity.unit + ' in play, the order matters more than the effort.' : null;
        },
        function () { return 'This works better on paper than in your head, so open a note before you read the rest.'; }
      ],
      insight: [
        function () { return 'Start from the end: what is the last thing that has to be true before it counts as done?'; },
        function () { return 'The useful structure is one line for the outcome, three to five lines for the pieces, and a rough number of minutes next to each.'; },
        function () { return 'It does not have to be accurate. It has to be visible, so it stops living in your head.'; },
        function () { return 'Most lists fail because the items are still projects. If an item cannot be started in one sitting, it needs splitting again.'; }
      ],
      move: [
        function (ctx, read) {
          return 'Write the deliverable in one sentence, using the words the assignment or the person actually used. Give it ' + moveSize(ctx, read) + '.';
        },
        function () { return 'List the pieces without judging them, then put a rough time next to each one.'; },
        function () { return 'Mark the single item you could start in the next ten minutes and ignore the others for now.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'clarify') ? 'Your clarify step, ' + title + ', is the written version of this if you would rather be walked through it.' : null;
        }
      ],
      ask: [
        function () { return 'What is the outcome sentence?'; },
        function () { return 'Which piece do you already know belongs on the list?'; },
        function () { return 'What is the last step, the one that means it is finished?'; }
      ]
    },

    'overwhelmed': {
      reflect: [
        function () { return 'Knowing what to do and being able to move are different capacities, and the second one is the one under load.'; },
        function (ctx, read) {
          return read && read.quantity ? 'That is ' + read.quantity.count + ' ' + read.quantity.unit + ' competing for the same attention, which is a real constraint and not a failure of willpower.' : null;
        },
        function (ctx) {
          var p = pressureValue(ctx);
          return p !== null ? 'You put the pressure at ' + p + ' out of 10, and that is roughly what this reads like.' : null;
        },
        function () { return 'That is a lot to be holding at one time.'; }
      ],
      insight: [
        function () { return 'Overwhelm is often a storage problem rather than a workload problem. Holding an unsorted list costs more than most of the items on it.'; },
        function (ctx) { return isHighPressure(ctx) ? 'At this level, planning harder tends not to work. Lowering the physical activation first usually does.' : 'You do not have to reduce the work to reduce the overwhelm. You have to reduce how much of it you hold at once.'; },
        function () { return 'The pile feels infinite partly because it has never been counted. It is almost always smaller written down.'; },
        function () { return 'Nothing on the list gets easier while all of it is in view.'; }
      ],
      move: [
        function () { return 'Write everything down, including the small things, then mark only what has a real deadline in the next two days.'; },
        function (ctx, read) {
          return 'Pick one item, any one, and put the rest out of sight for ' + (isHighPressure(ctx) ? 'fifteen minutes' : 'twenty minutes') + '.';
        },
        function () { return 'One task, one timer, everything else closed. That is the whole method.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'calm') ? 'Before any of that, ' + title + ' takes ' + stepDuration(step) + ' and makes the sorting possible.' : null;
        }
      ],
      ask: [
        function () { return 'Which one is in front of you right now?'; },
        function () { return 'How many items do you think are actually on that list?'; },
        function () { return 'What is the one task for the next fifteen minutes?'; }
      ]
    },

    'reframe': {
      reflect: [
        function (ctx, read) {
          var d = driverPhrase(ctx, 0);
          return d ? 'You have been describing this mostly through ' + d + ', which is understandable and is also not the only framing available.' : null;
        },
        function () { return 'Worth doing. The framing is usually easier to change than the situation.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Let us look at ' + noun + ' from a different angle.' : null;
        },
        function () { return 'Stepping back is a legitimate move here rather than a distraction from the work.'; }
      ],
      insight: [
        function () { return 'One thing worth checking: which parts of this are facts you could show someone, and which are predictions about how it goes?'; },
        function () { return 'Both kinds feel identical from the inside, but only the first list is something you can plan around.'; },
        function () { return 'A useful pair of questions is what this looks like in a week and what it looks like in a year. Not to shrink it, but because the size it feels today is rarely the size it stays.'; },
        function () { return 'You are almost certainly holding yourself to a standard you would not apply to anyone else in the same position.'; }
      ],
      move: [
        function () { return 'Write two columns: what you know, and what you are predicting. Be strict about which goes where.'; },
        function () { return 'If a friend described this exact situation to you, write down what you would notice that they were not.'; },
        function (ctx, read) { return 'Give it ' + moveSize(ctx, read) + ' on paper. The point is to make the two lists visibly different lengths.'; },
        function () { return 'Name the worst realistic outcome, then write the first thing you would do the day after it happened.'; }
      ],
      ask: [
        function () { return 'What is on the facts list?'; },
        function () { return 'What would you say to a friend in this exact position?'; },
        function () { return 'What changes between the one-week view and the one-year view?'; }
      ]
    },

    'fear': {
      reflect: [
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'That fear makes sense given how much ' + noun + ' matters to you.' : 'That fear makes sense given how much this matters to you.';
        },
        function () { return 'Naming it that plainly is harder than it looks, and it is the part that makes it workable.'; },
        function () { return 'Fear of falling short tends to raise the standard at exactly the moment you have least capacity to meet it.'; },
        function (ctx) { return isHighPressure(ctx) ? 'At this pressure the fear is loud, and loud is not the same as accurate.' : 'Worth separating what you know from what you are predicting.'; }
      ],
      insight: [
        function () { return 'Vague fears are heavier than precise ones. A named outcome can be planned for; an unnamed one just sits there.'; },
        function () { return 'You are treating one outcome as final. In practice there is almost always a next move, even in the bad version.'; },
        function () { return 'The standard you are measuring against is usually one nobody actually set.'; },
        function () { return 'What you can control is the input. The judgement afterwards was never in your column.'; }
      ],
      move: [
        function () { return 'Before you continue, decide what good enough looks like. Write the version that meets the requirement and nothing more.'; },
        function () { return 'Write the specific outcome you are picturing, then write what actually happened the last few times you were in something similar.'; },
        function () { return 'If the thing you are afraid of did happen, write down what you would do the day after. That answer is your floor.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'clarify') ? 'Your clarify step, ' + title + ', is the structured version of that, and it takes ' + stepDuration(step) + '.' : null;
        }
      ],
      ask: [
        function () { return 'What is the specific outcome you are picturing?'; },
        function () { return 'What would the good enough version contain?'; },
        function () { return 'What has actually happened the last few times you felt like this beforehand?'; }
      ]
    },

    'no-time': {
      reflect: [
        function (ctx, read) {
          var when = deadlineWord(ctx, read);
          return when ? 'With it due ' + when + ', the goal changes.' : 'If time is genuinely short, the goal changes.';
        },
        function () { return 'Then this is a triage problem, not a productivity problem.'; },
        function () { return 'It may be too late for the version you originally wanted. It is very rarely too late for a version.'; },
        function () { return 'Understood. Let us work with the hours that actually exist rather than the ones that should have.'; }
      ],
      insight: [
        function () { return 'It is no longer about doing this well. It is about deciding what gets done at all.'; },
        function () { return 'Two minutes spent choosing returns more than twenty minutes of undirected effort when the clock is this tight.'; },
        function () { return 'Everything above the minimum line is optional until the line is met.'; },
        function () { return 'Unfinished on purpose beats unfinished by accident, and it usually looks better too.'; }
      ],
      move: [
        function () { return 'Write the minimum that has to exist by the deadline for this to count. One line.'; },
        function () { return 'Of everything left, pick the single piece that carries the most weight in how this is judged, and start there.'; },
        function () { return 'Decide now what you are deliberately not doing, and write that down too so it stops nagging.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          var duration = stepDuration(step);
          return (title && step && step.stage === 'calm') ? 'If you can spare ' + duration + ', ' + title + ' first will make the next hour work better than the extra ' + duration + ' of effort would.' : null;
        }
      ],
      ask: [
        function () { return 'What is the smallest complete thing you could hand in?'; },
        function () { return 'Which single piece carries the most weight here?'; },
        function () { return 'What are you willing to leave undone on purpose?'; }
      ]
    },

    'people': {
      reflect: [
        function (ctx, read) {
          return read && read.person ? 'So a good part of this is about ' + read.person + '.' : null;
        },
        function () { return 'When other people are part of the pressure, it is a different problem from the workload, and it needs different moves.'; },
        function () { return 'A lot of social pressure grows in the gap where a conversation has not happened yet.'; },
        function () { return 'That kind of tension is genuinely tiring, and it is reasonable that it is taking up room.'; }
      ],
      insight: [
        function () { return 'The first useful split is what you can influence and what you cannot. You cannot control what they think; you can control what you say and when.'; },
        function () { return 'Rehearsing the conversation is not the same as having it, and it costs more.'; },
        function () { return 'One sentence is usually enough to start. You do not have to resolve the whole thing in one go.'; },
        function () { return 'Most of the weight here is the ambiguity, not the other person.'; }
      ],
      move: [
        function (ctx, read) {
          var who = (read && read.person) || 'the person this is really about';
          return 'Write the one sentence you would say to ' + who + ' if you had to say it in a corridor.';
        },
        function () { return 'Draw two columns: things in your control here, and things that are not. Put every worry in one of them.'; },
        function (ctx, read) { return 'Give it ' + moveSize(ctx, read) + ' and decide only the opening line, not the whole conversation.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'act') ? 'Your act step is ' + title + ', which is sized for exactly this kind of first move.' : null;
        }
      ],
      ask: [
        function () { return 'What is one thing here that is genuinely in your column?'; },
        function () { return 'What is the one sentence you would want to say?'; },
        function () { return 'What are you worried they are thinking, and how would you actually know?'; }
      ]
    },

    'comparison': {
      reflect: [
        function () { return 'Comparison is a poor measuring instrument. You are seeing their outputs and your process.'; },
        function () { return 'That feeling is common and it is also not evidence about you.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Being behind on ' + noun + ' relative to someone else is a different fact from being behind.' : null;
        },
        function () { return 'Nobody posts the part where they sat there not starting either.'; }
      ],
      insight: [
        function () { return 'The people you are comparing against are a filtered sample, and the filter is doing most of the work.'; },
        function () { return 'Being behind a group tells you about the group. It does not tell you what your next step is.'; },
        function () { return 'The only comparison with any information in it is against where you were last week.'; },
        function () { return 'You are measuring your inside against their outside, which never comes out well.'; }
      ],
      move: [
        function () { return 'Write down what you would be doing this week if you were the only person in the room.'; },
        function () { return 'Mute or scroll past the specific source of this for a day and see whether the urgency survives.'; },
        function (ctx, read) { return 'Spend ' + moveSize(ctx, read) + ' writing what you have actually finished in the last two weeks. It is usually more than the feeling suggests.'; },
        function () { return 'Pick one person you are comparing yourself to and write what you actually know about their week. It is usually almost nothing.'; }
      ],
      ask: [
        function () { return 'What would you be doing this week if nobody else were visible?'; },
        function () { return 'What have you finished recently that you have not given yourself credit for?'; },
        function () { return 'What is the thing you actually want here, separate from keeping up?'; }
      ]
    },

    'perfectionism': {
      reflect: [
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Redoing ' + noun + ' this many times is a sign the standard has quietly moved, not that the work is bad.' : 'Redoing it this many times usually means the standard has quietly moved.';
        },
        function () { return 'This is the expensive kind of stuck, because it looks like working.'; },
        function () { return 'Editing forever is avoidance wearing a respectable coat.'; },
        function () { return 'The bar you are clearing is not the one you are being marked against.'; }
      ],
      insight: [
        function () { return 'Without a defined finish line, there is no version that feels done, so more time cannot help.'; },
        function () { return 'The gap between good and perfect usually costs more hours than the gap between nothing and good.'; },
        function () { return 'A first draft is allowed to be bad. That is the entire function of a first draft.'; },
        function () { return 'Nobody reading this will see the versions you rejected.'; }
      ],
      move: [
        function () { return 'Write down what good enough looks like, in specific terms, before you touch it again. Then hold yourself to that and not to better.'; },
        function () { return 'Set one timed pass, finish it, and hand it in without a further read.'; },
        function () { return 'Save the current version somewhere and forbid yourself from restarting. Work forward from what exists.'; },
        function () { return 'Give yourself a fixed number of edits left. Two is usually enough.'; }
      ],
      ask: [
        function () { return 'What would good enough actually contain?'; },
        function () { return 'What are you afraid happens if you hand in the version you already have?'; },
        function () { return 'How many times have you been round this now?'; }
      ]
    },

    'focus': {
      reflect: [
        function () { return 'Losing focus repeatedly is usually an environment problem before it is a discipline problem.'; },
        function () { return 'Reading the same line four times is your attention telling you something, and it is rarely "try harder".'; },
        function (ctx) { return isHighPressure(ctx) ? 'At this pressure, concentration is genuinely harder. That is physiology, not character.' : 'Attention is a limited resource and it has been spent on something today.'; },
        function () { return 'The phone is designed by people who are very good at their jobs. Losing to it is not a personal failing.'; }
      ],
      insight: [
        function () { return 'Most focus problems are decided before you sit down: what is within reach, what is open, and what is allowed to interrupt.'; },
        function () { return 'A short block you finish beats a long block you abandon, and it also teaches you that you can.'; },
        function () { return 'Every switch away costs more than the time it takes, because coming back is the expensive part.'; },
        function () { return 'You do not need to fix your attention span. You need to remove the two things that keep taking it.'; }
      ],
      move: [
        function () { return 'Put the phone in another room, not face down on the desk. Distance does more than intention.'; },
        function (ctx, read) { return 'Work in one block of ' + moveSize(ctx, read) + ' with everything else closed, then stop deliberately rather than drifting.'; },
        function () { return 'Write the one sentence describing what you are doing in this block, and keep it visible.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'calm') ? 'A short reset first helps here. Yours is ' + title + ', about ' + stepDuration(step) + '.' : null;
        }
      ],
      ask: [
        function () { return 'What is the thing that keeps pulling you away?'; },
        function () { return 'What is the one sentence for this block?'; },
        function () { return 'How long could you honestly hold it for, right now?'; }
      ]
    },

    'tired': {
      reflect: [
        function () { return 'Running short on rest changes what is reasonable to expect from yourself.'; },
        function (ctx, read) {
          return read && read.when ? 'Being this depleted going into ' + read.when + ' is worth planning around rather than through.' : null;
        },
        function () { return 'Tired brains are much better at continuing than at starting, and much better at simple than at complex.'; },
        function () { return 'That is a real constraint and it deserves to be treated as one.'; }
      ],
      insight: [
        function () { return 'Rest is not the reward for finishing. Working further into a deficit usually costs tomorrow more than it buys tonight.'; },
        function () { return 'The work you do in this state tends to need redoing, which makes it slower than stopping would have been.'; },
        function () { return 'Holding an unfinished list is what keeps you awake, not the list itself.'; },
        function () { return 'A defined stopping point does more for tomorrow than the extra hour would.'; }
      ],
      move: [
        function () { return 'Pick the most mechanical part of the work, the part needing least judgement, and do only that.'; },
        function () { return 'Decide the one thing that genuinely has to be done before you stop tonight, and write the rest on a list for tomorrow.'; },
        function () { return 'Set the stopping time now, before you start, so it is a decision rather than a collapse.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'calm') ? title + ' takes ' + stepDuration(step) + ' and is a reasonable way to close the day rather than trail off.' : null;
        }
      ],
      ask: [
        function () { return 'What genuinely has to be done before you stop?'; },
        function () { return 'Which part of it needs the least thinking?'; },
        function () { return 'What time are you stopping tonight?'; }
      ]
    },

    'guilt': {
      reflect: [
        function () { return 'That is a heavy way to talk about yourself, and it is worth noticing that it has not made you faster.'; },
        function () { return 'Losing a day is a fact. Being lazy is a verdict, and it is a much less useful thing to hold.'; },
        function () { return 'Most people in this position are tired or stuck rather than lazy, and those have different fixes.'; },
        function () { return 'The guilt is doing a job here: it feels like accountability. It mostly costs energy you need.'; }
      ],
      insight: [
        function () { return 'Self-criticism at this volume tends to make starting harder, which produces more to feel bad about.'; },
        function () { return 'You would not describe a friend who had the same day in these words, and the description would not be more accurate if you did.'; },
        function () { return 'What is left of today is unaffected by what happened earlier in it.'; },
        function () { return 'The useful question is not why you did not, but what makes the next attempt more likely to land.'; }
      ],
      move: [
        function () { return 'Write the sentence you would say to a friend who had exactly this day, then read it back as if it were addressed to you.'; },
        function (ctx, read) { return 'Do ' + moveSize(ctx, read) + ' on anything at all from the list. Restarting matters more than what you restart on.'; },
        function () { return 'Separate the two lists: what actually happened, and what you have decided that means about you. Only the first one is evidence.'; },
        function () { return 'Name one thing you did do today, however small. The record is usually not as empty as it feels.'; }
      ],
      ask: [
        function () { return 'What would you say to a friend who had this exact day?'; },
        function () { return 'What is one small thing that would make the rest of today count as recovered?'; },
        function () { return 'What actually got in the way? That answer is more useful than the verdict.'; }
      ]
    },

    'decide': {
      reflect: [
        function () { return 'Being stuck between options costs more than either option would.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'The deciding is now taking longer than the work on ' + noun + ' would.' : null;
        },
        function () { return 'Going back and forth usually means the two options are closer in value than they feel.'; },
        function () { return 'When a choice is genuinely hard, it is often because either answer is survivable.'; }
      ],
      insight: [
        function () { return 'If two options are this close, the cost of choosing wrong is smaller than the cost of not choosing.'; },
        function () { return 'Reversible decisions deserve minutes, not days. Only the irreversible ones earn the deliberation.'; },
        function () { return 'You are probably optimising for the wrong thing: pick the one you can start today.'; },
        function () { return 'The information that would settle this usually only arrives after you have started one of them.'; }
      ],
      move: [
        function () { return 'Write both options and, next to each, the first concrete step. Pick whichever has the easier first step.'; },
        function () { return 'Set a deadline of five minutes for the decision, then commit and stop reopening it.'; },
        function () { return 'Ask what you would tell someone else to do. The answer usually arrives immediately, which tells you something.'; },
        function () { return 'Pick one and give it thirty minutes. Treat it as a trial rather than a verdict.'; }
      ],
      ask: [
        function () { return 'What are the two options, in one line each?'; },
        function () { return 'Which one has the easier first step?'; },
        function () { return 'What would have to be true for this decision to be obvious?'; }
      ]
    },

    'rumination-loop': {
      reflect: [
        function () { return 'The thinking has stopped being about solving it and started being about repeating it.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Going over ' + noun + ' this many times has stopped producing new information.' : null;
        },
        function () { return 'That loop is exhausting in a way that looks like nothing from the outside.'; },
        function () { return 'Circling is different from problem solving, even though it uses the same equipment.'; }
      ],
      insight: [
        function () { return 'Thinking about it more is unlikely to resolve it. The loop feeds on being fed.'; },
        function () { return 'Putting the loop on paper and then doing one small physical thing tends to break it better than reasoning with it does.'; },
        function () { return 'A loop with no new inputs will keep running. It needs an interruption, not an argument.'; },
        function () { return 'The loop is loudest when the body is activated, which is why the physical step comes first.'; }
      ],
      move: [
        function () { return 'Write the thought down in full, once, then close the notebook. Written down, it stops needing to be rehearsed.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'calm') ? title + ' is your calm step and takes ' + stepDuration(step) + '. Something physical interrupts this better than a decision does.' : 'Do something physical and short. A walk to the end of the road counts.';
        },
        function () { return 'Give it a scheduled slot: fifteen minutes later today when you are allowed to think about it, and not before.'; },
        function () { return 'Name the one question you are actually trying to answer. If there is not one, the loop is not working on anything.'; }
      ],
      ask: [
        function () { return 'What is the question you are actually trying to answer?'; },
        function () { return 'What is one physical thing you could do in the next five minutes?'; },
        function () { return 'Has anything new arrived in the loop today, or is it the same lap?'; }
      ]
    },

    'venting': {
      reflect: [
        function () { return 'That sounds genuinely heavy, and it makes sense that it is landing this hard.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Between ' + noun + ' and everything around it, that is a lot to be carrying at once.' : 'That is a lot to be carrying at once.';
        },
        function () { return 'None of that sounds unreasonable to be upset about.'; },
        function () { return 'Saying it plainly is a reasonable thing to do with it.'; }
      ],
      insight: [
        function () { return 'You do not have to turn this into a plan right now.'; },
        function () { return 'Some of this needs solving and some of it just needs saying, and they are not the same job.'; },
        function () { return 'Getting it out of your head is not avoiding the problem. It is usually what makes the problem approachable.'; },
        function () { return 'It is allowed to be both real and temporary.'; }
      ],
      move: [
        function () { return 'If you want, write the whole thing out without editing it. Nobody has to read it, including you.'; },
        function () { return 'Put one thing down for tonight, deliberately, and pick it back up tomorrow.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return title ? 'When you want something practical, ' + title + ' is there and takes ' + stepDuration(step) + '.' : null;
        },
        function () { return 'Nothing needs deciding in the next hour. That is a legitimate use of the hour.'; }
      ],
      ask: [
        function () { return 'Do you want something practical right now, or do you want to put it down for a bit? Both are fine answers.'; },
        function () { return 'What would you want to be different by tonight?'; },
        function () { return 'Is there a part of this you have not said out loud yet?'; }
      ]
    },

    'pushback': {
      reflect: [
        function () { return 'That is fair, and worth taking seriously rather than talking you out of.'; },
        function () { return 'Understood. Generic advice tends to fail on the specific reason a thing is hard.'; },
        function () { return 'Fine. If it did not work, the suggestion was wrong, not you.'; },
        function () { return 'Noted. Let us change the shape of it rather than repeat it louder.'; }
      ],
      insight: [
        function () { return 'There are usually three reasons a step fails: it was too big, it was the wrong kind, or the obstacle was somewhere else entirely.'; },
        function () { return 'Something that worked before and does not now usually means the constraint has moved.'; },
        function () { return 'If the advice felt generic, it is because it did not have the specific obstacle to aim at yet.'; },
        function () { return 'The useful detail is the moment it breaks down, not the outcome.'; }
      ],
      move: [
        function () { return 'Tell me which of the three it was and I will change the step: too big, wrong kind, or wrong target.'; },
        function () { return 'Describe the exact moment you try to start and it stops. That detail changes what is worth trying.'; },
        function () { return 'You can swap any step in the plan for a different one on the My Plan page. It does not rebuild the rest.'; },
        function () { return 'Name what would have to be different for a step to be worth trying at all.'; }
      ],
      ask: [
        function () { return 'What specifically did not work about it?'; },
        function () { return 'Is the obstacle the task itself, the environment, or how you feel about it?'; },
        function () { return 'What have you already tried, so I do not suggest it again?'; }
      ]
    },

    'what-now': {
      reflect: [
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (step && title) ? 'Your next step is the ' + step.label.toLowerCase() + ' one: ' + title + '.' : null;
        },
        function (ctx) {
          return currentStep(ctx) ? null : 'You have finished the three steps in this plan, which is worth noting rather than skipping past.';
        },
        function () { return 'Straightforward question, so here is the straightforward answer.'; },
        function (ctx) { return ctx && ctx.hasAnalysis ? 'Working from what you described:' : 'There is no plan to point at yet, so let us make one.'; }
      ],
      insight: [
        function (ctx) {
          var step = currentStep(ctx);
          return step && step.rationale ? step.rationale : null;
        },
        function (ctx) {
          var step = currentStep(ctx);
          var duration = stepDuration(step);
          return duration ? 'It takes about ' + duration + ', which is short enough to do before deciding anything else.' : null;
        },
        function (ctx) {
          return (!currentStep(ctx) && ctx && ctx.plan) ? 'From here you can record a check-in, or start a new stress check if something else has come up.' : null;
        },
        function () { return 'The order matters more than it looks: settling first is what makes the thinking step work.'; }
      ],
      move: [
        function (ctx) { return currentStep(ctx) ? 'It is on the My Plan page whenever you want to run it.' : 'The check-in is on the My Plan page and takes about fifteen seconds.'; },
        function (ctx) {
          var step = currentStep(ctx);
          return step ? 'If it is the wrong step for today, you can swap it there for a different one.' : null;
        },
        function (ctx) { return ctx && ctx.hasAnalysis ? null : 'A stress check takes a couple of minutes and gives me something specific to work from.'; },
        function () { return 'You do not have to do all three at once. One is a legitimate session.'; }
      ],
      ask: [
        function () { return 'Do you want to run it now, or work out what is in the way first?'; },
        function () { return 'Does that step look right for today?'; },
        function (ctx) { return currentStep(ctx) ? 'Anything about it you want to change?' : 'Which of those fits better right now?'; }
      ]
    },

    'explain-exercise': {
      reflect: [
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return title ? 'Your ' + step.label.toLowerCase() + ' step is ' + title + ', and it was chosen rather than picked at random.' : null;
        },
        function () { return 'Reasonable thing to ask. Nothing here should be a black box.'; },
        function () { return 'Every plan has the same three stages: calm, then clarify, then act.'; },
        function () { return 'The steps are matched to the signals in what you wrote, not assigned in a fixed order.'; }
      ],
      insight: [
        function () { return 'Calm comes first because the body settles faster than the thinking does, and thinking is harder while it has not.'; },
        function () { return 'Clarify is there to make the situation smaller and more specific than the version in your head.'; },
        function () { return 'Act is one concrete move, sized so it can genuinely happen today rather than in theory.'; },
        function (ctx) {
          var d = driverPhrase(ctx, 0);
          return d ? 'Yours were selected because the wording pointed most strongly at ' + d + '.' : null;
        }
      ],
      move: [
        function () { return 'Every exercise has a "why this helps" section inside it, and the snapshot page shows every signal score behind the choice.'; },
        function () { return 'If a step does not fit, swap it. The alternatives shown are the next best matches for the same profile.'; },
        function () { return 'Skipping a step is allowed. The order is a recommendation, not a lock.'; },
        function () { return 'None of these are presented as clinically proven, and the app names the practice family each one comes from.'; }
      ],
      ask: [
        function () { return 'Do you want me to talk through what the step actually involves?'; },
        function () { return 'Is there a particular step you would rather replace?'; },
        function () { return 'Which part of the plan is not making sense?'; }
      ]
    },

    'positive': {
      reflect: [
        function () { return 'Good. That is a real result, and it came from you doing the thing rather than reading about it.'; },
        function () { return 'Glad it landed.'; },
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Getting moving on ' + noun + ' was the hard part.' : null;
        },
        function () { return 'Worth noticing rather than moving straight past.'; }
      ],
      insight: [
        function () { return 'The part worth keeping is what specifically shifted, because that is the bit worth repeating next time.'; },
        function () { return 'Momentum is easier to steer than to create, so this is a cheaper moment than the last one was.'; },
        function () { return 'Stopping on purpose is a legitimate choice, and it protects the next session.'; },
        function () { return 'A day where the plan worked is data. It is worth recording while it is accurate.'; }
      ],
      move: [
        function (ctx) { return (ctx && ctx.plan && !currentStep(ctx) && !ctx.checkin) ? 'The check-in on the My Plan page takes about fifteen seconds and puts this on your progress page.' : 'If you want to record it, the check-in takes about fifteen seconds.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return title ? 'If you want to keep going, your next step is ' + title + '.' : null;
        },
        function () { return 'You can also stop here deliberately. Ending on a good one is not wasted.'; },
        function () { return 'Write one line about what worked while it is fresh. It will be useful the next time this comes round.'; }
      ],
      ask: [
        function () { return 'Was it the starting, the clarity about what to do, or just having it out of your head?'; },
        function () { return 'Do you want to keep going while there is momentum, or stop here on purpose?'; },
        function () { return 'What would you want to repeat next time this happens?'; }
      ]
    },

    'about-app': {
      reflect: [
        function (ctx, read) { return aboutAppOpener(read, 0); },
        function (ctx, read) { return aboutAppOpener(read, 1); },
        function (ctx, read) { return aboutAppOpener(read, 2); },
        function (ctx, read) { return aboutAppOpener(read, 3); }
      ],
      insight: [
        function () { return 'Your writing stays on this device. There is no account, no backend, and no request that carries your text anywhere.'; },
        function () { return 'What it does is read the wording you gave it for non-clinical stress signals and turn those into a small plan.'; },
        function () { return 'The replies you get from me are composed from a written template set using your session context. A language model did not write them.'; },
        function () { return 'When the optional on-device model is loaded, it matches your message to an intent. It still does not write the words.'; }
      ],
      move: [
        function () { return 'The Safety and about page has the full detail, including what is stored and how to delete it.'; },
        function () { return 'You can check this yourself: open the network tab and use the app. There are no requests carrying your text.'; },
        function () { return 'Everything stored lives under keys beginning with freebird.v1. in this browser, and the Progress page can delete all of it.'; },
        function () { return 'If you need real support, the safety page lists where to go, and in the United States you can call or text 988.'; }
      ],
      ask: [
        function () { return 'Anything specific you want to check?'; },
        function () { return 'Does that answer it, or do you want the longer version?'; },
        function () { return 'Was there something in particular you were worried about?'; }
      ]
    },

    'greeting': {
      reflect: [
        function () { return 'Hello.'; },
        function () { return 'Hi.'; },
        function () { return 'Hey.'; }
      ],
      insight: [
        function (ctx) {
          var d = driverPhrase(ctx, 0);
          return d ? 'I have your snapshot open, and the main thing in it was ' + d + '.' : null;
        },
        function (ctx) { return ctx && ctx.hasAnalysis ? 'I am working from the stress check you already did.' : 'I work best with something specific to go on.'; },
        function () { return 'No need to explain the whole situation. The part that is in the way is enough.'; }
      ],
      move: [
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return title ? 'Your next step is ' + title + ' if you want to start there.' : null;
        },
        function (ctx) { return ctx && ctx.hasAnalysis ? null : 'A stress check takes a couple of minutes, or you can just tell me here.'; },
        function () { return 'Say it however it comes out. Tidy is not required.'; }
      ],
      ask: [
        function () { return 'What is on your mind?'; },
        function () { return 'What is actually in the way right now?'; },
        function () { return 'Where do you want to start?'; }
      ]
    },

    'uncertainty': {
      reflect: [
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Not knowing what is actually wanted for ' + noun + ' is its own kind of stuck.' : 'Not knowing what is actually wanted is its own kind of stuck.';
        },
        function () { return 'That is a different problem from the work being hard, and it has a cheaper fix.'; },
        function () { return 'Working harder against an unclear target is the most expensive way to do this.'; },
        function () { return 'Reasonable. You cannot aim at something that has not been described.'; }
      ],
      insight: [
        function () { return 'One question asked can remove more pressure than an hour of effort, and it is usually a shorter question than it feels.'; },
        function () { return 'Most of the weight here is ambiguity rather than difficulty, and ambiguity is answerable.'; },
        function () { return 'People almost never mind being asked what they meant. They mind getting back something that missed.'; },
        function () { return 'If nobody can tell you, then writing down your own definition of done is the next best thing and it counts.'; }
      ],
      move: [
        function () { return 'Write the one question that, if answered, would unblock the most. Then send it.'; },
        function () { return 'Reread the brief and underline only the verbs. What you are being asked to do is usually in those.'; },
        function (ctx, read) { return 'Give it ' + moveSize(ctx, read) + ': write your own one-line definition of what finished looks like, then work to that.'; },
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return (title && step.stage === 'clarify') ? 'Your clarify step is ' + title + ', which is built for narrowing exactly this.' : null;
        }
      ],
      ask: [
        function () { return 'What is the one question you would ask if you could get an answer today?'; },
        function () { return 'Who actually knows the answer to this?'; },
        function () { return 'What do you already know for certain about what is wanted?'; }
      ]
    },

    'general': {
      reflect: [
        function (ctx, read) {
          var noun = theirNoun(ctx, read);
          return noun ? 'Staying with ' + noun + ' then.' : null;
        },
        function (ctx) {
          var d = driverPhrase(ctx, 0);
          return d ? 'Going back to what you described, the main weight seemed to be ' + d + '.' : null;
        },
        function () { return 'I want to make sure I am answering the right question.'; },
        function () { return 'Tell me a bit more about the part that is hardest right now.'; }
      ],
      insight: [
        function () { return 'Most of what gets stuck here is one of three things: not knowing what to do, not being able to start, or how you feel about the outcome.'; },
        function () { return 'Any of those is workable. They just need different moves.'; },
        function (ctx) {
          var p = pressureValue(ctx);
          return p !== null ? 'You put the pressure at ' + p + ' out of 10 when you wrote this, which is a useful reference point if it has shifted.' : null;
        },
        function () { return 'We can adjust the plan if it is aimed at the wrong thing.'; }
      ],
      move: [
        function (ctx) {
          var step = currentStep(ctx);
          var title = stepTitle(step);
          return title ? 'For reference, your next planned step is ' + title + ', about ' + stepDuration(step) + '.' : null;
        },
        function () { return 'One sentence about the specific obstacle is usually enough for me to be useful.'; },
        function (ctx) { return ctx && ctx.hasAnalysis ? null : 'A stress check would give me something concrete to work from, but you can also just describe it here.'; },
        function () { return 'You can be blunt about it. Precision helps more than politeness here.'; }
      ],
      ask: [
        function () { return 'What is in the way?'; },
        function () { return 'What has changed since you wrote it, if anything?'; },
        function () { return 'Is this about not knowing what to do, not being able to start, or how you feel about the outcome?'; }
      ]
    }
  };

  /* ------------------------------------------------------------------ */
  /* Composition                                                         */
  /* ------------------------------------------------------------------ */

  /** Small stable string hash, so the same message always seeds the same way. */
  function hashString(value) {
    var str = String(value || '');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  /**
   * Take the first option in a pool that produces something, starting at the
   * offset the seed lands on. A slot returning null means "not applicable with
   * this context", not "leave a gap".
   */
  function pickSlot(pool, seed, salt, ctx, read) {
    if (!pool || !pool.length) return null;
    var start = (seed + salt * 7) % pool.length;
    for (var i = 0; i < pool.length; i++) {
      var value = pool[(start + i) % pool.length](ctx, read);
      if (value) return value;
    }
    return null;
  }

  /**
   * Does the reply refer to this user's own session at all?
   *
   * A reply that could have been written for anybody is the failure mode this
   * whole file exists to avoid, so it is checked rather than assumed.
   */
  function groundingMarkers(ctx) {
    if (!ctx || !ctx.hasAnalysis) return [];
    var markers = [];
    if (ctx.subject) markers.push(ctx.subject);
    var title = stepTitle(currentStep(ctx));
    if (title) markers.push(title);
    var driver = driverPhrase(ctx, 0);
    if (driver) markers.push(driver);
    var p = pressureValue(ctx);
    if (p !== null) markers.push(p + ' out of 10');
    return markers;
  }

  /**
   * Sentences that tie a reply back to this session. Several of them, chosen
   * by seed, because one fixed line appended to every ungrounded reply reads
   * as a tic within about three messages.
   */
  var GROUNDING_LINES = [
    function (ctx) {
      var step = currentStep(ctx);
      var title = stepTitle(step);
      return title ? 'For reference, your ' + step.label.toLowerCase() + ' step is ' + title + ', about ' + stepDuration(step) + '.' : null;
    },
    function (ctx) {
      return ctx.subject ? 'This is all still about ' + ctx.subject + ', as far as I have it.' : null;
    },
    function (ctx) {
      var p = pressureValue(ctx);
      return p !== null ? 'You put the pressure at ' + p + ' out of 10 when you wrote this, so say if that has moved.' : null;
    },
    function (ctx) {
      var d = driverPhrase(ctx, 0);
      return d ? 'The main thing in the wording was ' + d + ', if that still fits.' : null;
    },
    function (ctx) {
      var step = currentStep(ctx);
      var title = stepTitle(step);
      return title ? 'Whenever you want it, ' + title + ' is waiting on the My Plan page.' : null;
    }
  ];

  function groundingLine(ctx, seed) {
    var start = Math.abs(seed || 0) % GROUNDING_LINES.length;
    for (var i = 0; i < GROUNDING_LINES.length; i++) {
      var line = GROUNDING_LINES[(start + i) % GROUNDING_LINES.length](ctx);
      if (line) return line;
    }
    return null;
  }

  /**
   * Like pickSlot, but prefers an option that already mentions the session.
   * Used only on the second pass, so the first pass keeps its full variety and
   * grounding is what gets adjusted rather than what drives the wording.
   */
  function pickGroundedSlot(pool, seed, salt, ctx, read, markers) {
    if (!pool || !pool.length) return null;
    var start = (seed + salt * 7) % pool.length;
    var firstUsable = null;
    for (var i = 0; i < pool.length; i++) {
      var value = pool[(start + i) % pool.length](ctx, read);
      if (!value) continue;
      if (firstUsable === null) firstUsable = value;
      for (var m = 0; m < markers.length; m++) {
        if (value.indexOf(markers[m]) !== -1) return value;
      }
    }
    return firstUsable;
  }

  /**
   * Compose a reply.
   *
   * @param {string} intentId
   * @param {object} ctx      session context from js/wingman-context.js
   * @param {number} turn     conversation turn, rotates the slot pools
   * @param {object} [options] { message, secondary, recent }
   *        message   the user's text, so the reply can quote it back
   *        secondary a second intent to acknowledge in one extra sentence
   *        recent    previously sent Wingman texts, to avoid repeating one
   */
  function compose(intentId, ctx, turn, options) {
    options = options || {};
    ctx = ctx || {};

    var read = options.read || readMessage(options.message || '');
    var pools = COMPOSERS[intentId] || COMPOSERS[GENERIC_INTENT];
    var base = Math.abs(turn || 0) + hashString(read.text);
    var recent = options.recent || [];

    var text = null;
    // Up to four attempts to land on something that has not just been said.
    for (var attempt = 0; attempt < 4; attempt++) {
      var seed = base + attempt * 3;
      var parts = [
        pickSlot(pools.reflect, seed, 0, ctx, read),
        pickSlot(pools.insight, seed, 1, ctx, read),
        pickSlot(pools.move, seed, 2, ctx, read),
        pickSlot(pools.ask, seed, 3, ctx, read)
      ];

      if (options.secondary && options.secondary !== intentId) {
        var extra = COMPOSERS[options.secondary];
        if (extra) {
          var line = pickSlot(extra.insight, seed, 5, ctx, read);
          // Slot it before the question so the reply still ends on the ask.
          if (line && parts.indexOf(line) === -1) parts.splice(3, 0, line);
        }
      }

      text = parts.filter(Boolean).join(' ');
      if (recent.indexOf(text) === -1) break;
    }

    // Nothing generic goes out while there is a session to point at. The
    // cheapest fix is to swap the action sentence for one that already names
    // the plan; appending a reference line is the last resort, because doing
    // that on every reply is how a composer starts sounding like a form letter.
    var markers = groundingMarkers(ctx);
    if (markers.length && !mentionsAny(text, markers)) {
      var reseed = base;
      var swapped = pickGroundedSlot(pools.move, reseed, 2, ctx, read, markers);
      if (swapped && mentionsAny(swapped, markers)) {
        var rebuilt = [
          pickSlot(pools.reflect, reseed, 0, ctx, read),
          pickSlot(pools.insight, reseed, 1, ctx, read),
          swapped,
          pickSlot(pools.ask, reseed, 3, ctx, read)
        ].filter(Boolean).join(' ');
        if (recent.indexOf(rebuilt) === -1) text = rebuilt;
      }
    }
    // Appending is only worth it when the reply is otherwise thin. A long,
    // specific answer that already engages with what they wrote does not need
    // a plan reference stapled to the end, and reads worse with one.
    if (markers.length && !mentionsAny(text, markers) && text.length < GROUNDING_APPEND_LIMIT) {
      var tail = groundingLine(ctx, base);
      if (tail) text = text + ' ' + tail;
    }

    return text;
  }

  /**
   * Replies longer than this are left alone when they cannot be grounded by
   * swapping a slot. Tuned so a short generic answer still gets tied back to
   * the session, which is the case that actually reads as a canned reply.
   */
  var GROUNDING_APPEND_LIMIT = 260;

  function mentionsAny(text, markers) {
    for (var i = 0; i < markers.length; i++) {
      if (text.indexOf(markers[i]) !== -1) return true;
    }
    return false;
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

    lines.push(subject ? 'So this is about ' + subject + '.' : 'I have read what you wrote.');

    if (driver) {
      lines.push('The main thing in the wording was ' + driver + ', and you put the pressure at ' + (ctx.pressure ? ctx.pressure.value : '?') + ' out of 10.');
    }

    if (ctx.completedExercises && ctx.completedExercises.length) {
      lines.push('You have done ' + ctx.completedExercises.length + ' of the exercises already.');
    }

    var step = currentStep(ctx);
    var title = stepTitle(step);
    if (title) {
      lines.push('Your next step is ' + title + '. Ask me anything about it, or tell me what is actually in the way.');
    } else if (ctx.plan && !ctx.checkin) {
      lines.push('All three steps are done, so the check-in is the last piece. Tell me how it went, or what is still sitting there.');
    } else {
      lines.push('Tell me what is actually in the way and we will work from there.');
    }

    return lines.join(' ');
  }

  /* ------------------------------------------------------------------ */
  /* Suggested prompts                                                   */
  /* ------------------------------------------------------------------ */

  var SUGGESTED_PROMPTS = [
    'I still cannot make myself start.',
    'Can you help me break this down?',
    'I know what I need to do, but I am overwhelmed.',
    'Can you help me think about this differently?'
  ];

  /**
   * Four openers chosen for where the user actually is, so the chips are not
   * the same list on every screen and in every state.
   */
  function suggestionsFor(ctx) {
    if (!ctx || !ctx.hasAnalysis) {
      return [
        'I do not know where to start.',
        'Everything is piling up at once.',
        'What can you actually help with?',
        'Is anything I write here private?'
      ];
    }

    var out = [];
    var step = currentStep(ctx);

    if (!step && !ctx.checkin) out.push('I finished the steps. What now?');
    if (step) out.push('I still cannot make myself start.');

    var primary = ctx.primarySignal;
    var bySignal = {
      'deadline-pressure': 'There is not enough time left.',
      'overwhelm': 'I know what to do, but I am overwhelmed.',
      'uncertainty': 'I do not know what is actually being asked.',
      'avoidance': 'I keep putting it off and I do not know why.',
      'rumination': 'I cannot stop thinking about it.',
      'fear-of-failure': 'I am scared I am going to mess this up.',
      'social-pressure': 'A lot of this is about other people.',
      'workload-pressure': 'There is too much on at the same time.',
      'sleep-strain': 'I am too tired to do any of this.',
      'low-stress': 'Can you help me stay ahead of this?'
    };
    if (bySignal[primary]) out.push(bySignal[primary]);

    out.push('Can you help me break this down?');
    out.push('Why did you pick that step for me?');
    out.push('Can you help me think about this differently?');

    // De-duplicate while keeping order, then take four.
    var seen = {};
    return out.filter(function (prompt) {
      if (seen[prompt]) return false;
      seen[prompt] = true;
      return true;
    }).slice(0, 4);
  }

  FB.fallback = {
    INTENTS: INTENTS,
    GENERIC_INTENT: GENERIC_INTENT,
    COMPOSERS: COMPOSERS,
    SUGGESTED_PROMPTS: SUGGESTED_PROMPTS,
    suggestionsFor: suggestionsFor,
    readMessage: readMessage,
    matchIntentLexically: matchIntentLexically,
    matchIntentSemantically: matchIntentSemantically,
    compose: compose,
    openingMessage: openingMessage,
    currentStep: currentStep
  };
})(window.FB = window.FB || {});
