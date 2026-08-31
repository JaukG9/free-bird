/**
 * Free Bird safety scan.
 *
 * This module is deliberately separate from the classifier, is entirely
 * deterministic, and never depends on the machine-learning model. It runs on
 * every piece of user text before any coaching output is produced, including
 * every Wingman message.
 *
 * WHAT THIS IS
 *   A conservative keyword and phrase scan for language that suggests a person
 *   may be in crisis or in immediate danger. When it fires, Free Bird stops the
 *   ordinary coaching flow and shows a support screen instead.
 *
 * WHAT THIS IS NOT
 *   It is not a risk assessment, it is not a screening instrument, and it does
 *   not produce a risk score. There is deliberately no numeric output.
 *
 * KNOWN LIMITATIONS, stated plainly because they matter:
 *   - Pattern matching cannot detect crisis expressed indirectly, in metaphor,
 *     in another language, in slang this list does not contain, or in text that
 *     deliberately avoids these words.
 *   - Negation and hypothetical framing are handled only in the narrow cases
 *     listed in HYPERBOLE and NEGATION_CONTEXT below.
 *   - It will sometimes fire on text that is not a crisis. That direction of
 *     error is the intended one: showing support resources to someone who did
 *     not need them costs far less than missing someone who did.
 *   - Free Bird is not an emergency service and cannot contact anyone on a
 *     user's behalf. The safety screen says this explicitly.
 */
(function (FB) {
  'use strict';

  /**
   * Level "crisis" halts the coaching flow completely.
   * Level "concern" surfaces a supportive note but allows the flow to continue,
   * because the language points at strain rather than danger.
   */
  var CRISIS_PATTERNS = [
    // Suicidal statements
    { id: 'suicide-intent', level: 'crisis', re: /\b(kill(ing)?\s+myself|end(ing)?\s+my\s+life|take\s+my\s+own\s+life|commit\s+suicide|suicidal|suicide)\b/ },
    { id: 'not-want-to-live', level: 'crisis', re: /\b(don'?t|do\s+not|dont)\s+want\s+to\s+(live|be\s+alive|be\s+here|exist|wake\s+up)\b/ },
    { id: 'want-to-die', level: 'crisis', re: /\b(want(s|ed)?|wish(es|ed)?)\s+(to\s+die|i\s+(was|were)\s+dead|i\s+could\s+die)\b/ },
    // Crisis language about another person. This still fires, because a student
    // carrying a friend's disclosure needs the same resources. NEGATION_CONTEXT
    // then steps it down from a hard stop to a support note.
    { id: 'third-person-crisis', level: 'crisis', re: /\b(kill(ing)?\s+(him|her|them)self|end(ing)?\s+(his|her|their)\s+life|hurt(ing)?\s+(him|her|them)self|take\s+(his|her|their)\s+own\s+life)\b/ },
    { id: 'better-off-without', level: 'crisis', re: /\b(everyone|they|people|my\s+family|my\s+parents)\s+(would\s+be|are)\s+better\s+off\s+without\s+me\b/ },
    { id: 'no-point-living', level: 'crisis', re: /\b(no\s+(point|reason)\s+(in\s+)?(living|going\s+on|being\s+here)|nothing\s+left\s+to\s+live\s+for)\b/ },
    { id: 'plan-statement', level: 'crisis', re: /\b(i\s+have\s+a\s+plan\s+to\s+(die|end|hurt|kill)|tonight\s+is\s+the\s+night|wrote\s+(a\s+)?(note|goodbye))\b/ },
    { id: 'goodbye', level: 'crisis', re: /\b(this\s+is\s+goodbye|won'?t\s+be\s+here\s+(tomorrow|much\s+longer))\b/ },

    // Self-harm
    { id: 'self-harm', level: 'crisis', re: /\b(hurt(ing)?\s+myself|harm(ing)?\s+myself|self[\s-]?harm|cut(ting)?\s+myself|burn(ing)?\s+myself)\b/ },
    { id: 'overdose', level: 'crisis', re: /\b(overdose|od'?d|took\s+(all\s+)?(the\s+)?pills|swallow(ed)?\s+.{0,12}pills)\b/ },

    // Immediate danger or inability to stay safe
    { id: 'cannot-stay-safe', level: 'crisis', re: /\b(can'?t|cannot|couldn'?t)\s+(keep\s+myself\s+safe|stay\s+safe|guarantee\s+i'?ll\s+be\s+safe)\b/ },
    { id: 'in-danger', level: 'crisis', re: /\b(i\s+am|i'?m)\s+(in\s+danger|not\s+safe|being\s+(hurt|abused|beaten|threatened))\b/ },
    { id: 'someone-hurting-me', level: 'crisis', re: /\b(someone|he|she|they)\s+is\s+(hurting|abusing|threatening|hitting)\s+me\b/ },
    { id: 'harm-others', level: 'crisis', re: /\b(want\s+to|going\s+to|plan\s+to)\s+(hurt|kill)\s+(someone|him|her|them|people|everyone)\b/ },

    // Strain language that deserves a gentler acknowledgement, not a halt
    { id: 'hopelessness', level: 'concern', re: /\b(hopeless|no\s+way\s+out|nothing\s+will\s+ever\s+change|i\s+give\s+up\s+on\s+everything)\b/ },
    { id: 'worthlessness', level: 'concern', re: /\b(worthless|nobody\s+would\s+(care|notice)|i\s+am\s+a\s+burden|i'?m\s+a\s+burden)\b/ },
    { id: 'cant-go-on', level: 'concern', re: /\b(can'?t\s+(go\s+on|do\s+this\s+anymore|take\s+(it|this)\s+anymore)|at\s+my\s+breaking\s+point)\b/ },
    { id: 'numbness', level: 'concern', re: /\b(feel\s+nothing\s+at\s+all|completely\s+numb|empty\s+inside)\b/ }
  ];

  /**
   * Common figures of speech that contain crisis-adjacent words but are, in
   * ordinary student usage, hyperbole about workload. If the ONLY match in a
   * text comes from one of these spans, the scan does not fire.
   *
   * This list is intentionally short. Anything ambiguous is left to fire.
   */
  var HYPERBOLE = [
    /\b(this|it|school|homework|the\s+\w+)\s+is\s+killing\s+me\b/g,
    /\bkill(ing)?\s+me\b/g,
    /\bdying\s+(of|from)\s+(boredom|laughter|embarrassment)\b/g,
    /\bdying\s+to\s+\w+/g,
    /\bdead\s+tired\b/g,
    /\bi\s+could\s+(kill|murder)\s+(a\s+|for\s+a\s+)/g,
    /\bkill(ed|ing)?\s+(it|that\s+test|the\s+exam)\b/g,
    /\bdeadline/g
  ];

  /**
   * Contexts where the phrase is being reported about someone else, or in the
   * past tense with resolution. These reduce a crisis match to a concern so the
   * user still sees support information without the flow being halted as if
   * they were describing themselves right now.
   */
  var NEGATION_CONTEXT = [
    /\b(my\s+(friend|sister|brother|cousin|classmate)|someone\s+i\s+know)\b.{0,40}$/,
    /\b(used\s+to|years\s+ago|when\s+i\s+was\s+(younger|a\s+kid))\b/,
    /\b(i\s+am\s+not|i'?m\s+not|never)\s+(suicidal|going\s+to\s+hurt\s+myself)\b/,
    /\b(worried|scared)\s+(about|for)\s+(my|a)\s+friend\b/
  ];

  function normalise(raw) {
    return FB.normalize.normalise(raw);
  }

  /** Blank out known hyperbole spans so they cannot produce a match. */
  function maskHyperbole(text) {
    var masked = text;
    HYPERBOLE.forEach(function (re) {
      re.lastIndex = 0;
      masked = masked.replace(re, function (match) {
        return new Array(match.length + 1).join('.');
      });
    });
    return masked;
  }

  function hasReportingContext(text) {
    for (var i = 0; i < NEGATION_CONTEXT.length; i++) {
      if (NEGATION_CONTEXT[i].test(text)) return true;
    }
    return false;
  }

  /**
   * Scan text and return a result object.
   *
   * @returns {{level: 'none'|'concern'|'crisis', matched: string[], reason: string}}
   */
  function scan(raw) {
    var text = normalise(raw);
    if (!text) {
      return { level: 'none', matched: [], reason: 'empty input' };
    }

    var masked = maskHyperbole(text);
    var matched = [];
    var level = 'none';

    CRISIS_PATTERNS.forEach(function (pattern) {
      pattern.re.lastIndex = 0;
      if (pattern.re.test(masked)) {
        matched.push(pattern.id);
        if (pattern.level === 'crisis') {
          level = 'crisis';
        } else if (level !== 'crisis') {
          level = 'concern';
        }
      }
    });

    // Third-party or clearly past-tense framing is stepped down one level so
    // resources are still offered without treating it as a live emergency.
    if (level === 'crisis' && hasReportingContext(text)) {
      level = 'concern';
      return {
        level: level,
        matched: matched,
        reason: 'crisis language present but framed as about another person or the past'
      };
    }

    return {
      level: level,
      matched: matched,
      reason: level === 'none' ? 'no listed pattern matched' : 'matched ' + matched.join(', ')
    };
  }

  function isBlocking(result) {
    return !!result && result.level === 'crisis';
  }

  /**
   * Support resources shown on the safety screen. These are static, public,
   * United States focused entries. No lookup, no network request, no location
   * detection. The screen also tells the user this list is not exhaustive.
   */
  var RESOURCES = [
    {
      name: '988 Suicide and Crisis Lifeline',
      detail: 'Call or text 988 in the United States. Free, confidential, available 24 hours.',
      href: 'tel:988',
      hrefLabel: 'Call 988'
    },
    {
      name: 'Crisis Text Line',
      detail: 'Text HOME to 741741 in the United States to reach a trained crisis counsellor.',
      href: 'sms:741741',
      hrefLabel: 'Text 741741'
    },
    {
      name: 'Emergency services',
      detail: 'If you or someone else is in immediate physical danger, call 911 or your local emergency number.',
      href: 'tel:911',
      hrefLabel: 'Call 911'
    },
    {
      name: 'Someone near you',
      detail: 'A parent, a school counsellor, a teacher you trust, an older sibling, or a coach. Telling one person is often the step that changes the day.',
      href: null,
      hrefLabel: null
    },
    {
      name: 'Outside the United States',
      detail: 'Search for your country on findahelpline.com, or contact your local emergency number.',
      href: 'https://findahelpline.com',
      hrefLabel: 'findahelpline.com'
    }
  ];

  FB.safety = {
    scan: scan,
    isBlocking: isBlocking,
    normalise: normalise,
    maskHyperbole: maskHyperbole,
    RESOURCES: RESOURCES,
    CRISIS_PATTERNS: CRISIS_PATTERNS
  };
})(window.FB = window.FB || {});
