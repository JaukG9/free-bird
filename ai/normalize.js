/**
 * Text normalisation shared by the classifier, the safety scan, and the
 * Wingman intent matcher.
 *
 * Every one of those modules matches patterns against wording, and students
 * write the same thing several ways: "cannot", "can not" and "can't" all mean
 * the same thing to a reader but not to a regular expression. Rather than
 * spelling out every variant in every pattern list, we normalise once, here,
 * and let the pattern lists stay readable.
 *
 * This runs on a lowercased copy used only for matching. The user's original
 * text is never rewritten, never shown back to them altered, and never leaves
 * the device.
 */
(function (FB) {
  'use strict';

  /** Expanded form on the left, the contraction the patterns use on the right. */
  var CONTRACTIONS = [
    [/\bcan\s?not\b/g, "can't"],
    [/\bdo not\b/g, "don't"],
    [/\bdoes not\b/g, "doesn't"],
    [/\bdid not\b/g, "didn't"],
    [/\bwill not\b/g, "won't"],
    [/\bwould not\b/g, "wouldn't"],
    [/\bcould not\b/g, "couldn't"],
    [/\bshould not\b/g, "shouldn't"],
    [/\bhave not\b/g, "haven't"],
    [/\bhas not\b/g, "hasn't"],
    [/\bhad not\b/g, "hadn't"],
    [/\bis not\b/g, "isn't"],
    [/\bare not\b/g, "aren't"],
    [/\bwas not\b/g, "wasn't"],
    [/\bwere not\b/g, "weren't"]
    // Deliberately absent: "am not". It has no single-word contraction, and
    // rewriting it would break phrases the safety scan depends on, such as
    // "I am not safe".
  ];

  /** Lowercase, straighten quotes, collapse whitespace, expand contractions. */
  function normalise(raw) {
    var text = String(raw == null ? '' : raw)
      .toLowerCase()
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    CONTRACTIONS.forEach(function (rule) {
      text = text.replace(rule[0], rule[1]);
    });

    return text;
  }

  FB.normalize = {
    normalise: normalise,
    CONTRACTIONS: CONTRACTIONS
  };
})(window.FB = window.FB || {});
