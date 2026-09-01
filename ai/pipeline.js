/**
 * Analysis pipeline.
 *
 * Order matters and is fixed:
 *
 *   input -> validate -> preprocess -> SAFETY SCAN -> lexical scoring
 *         -> semantic scoring (only if the on-device model is ready)
 *         -> blended profile -> pressure estimate -> plan
 *
 * The safety scan runs before any coaching output is produced, and a blocking
 * result short-circuits the rest of the pipeline. That ordering is the reason
 * safety lives in its own deterministic module with no model dependency.
 */
(function (FB) {
  'use strict';

  var MIN_CHARS = 12;
  var MAX_CHARS = 2000;
  var HARD_MAX_CHARS = 20000;

  /**
   * Validation with messages written for a stressed person rather than for a
   * form. Returns { ok, code, message } and never throws.
   */
  function validate(raw) {
    var text = String(raw == null ? '' : raw);

    if (!text.length) {
      return { ok: false, code: 'empty', message: 'Write a little about what is going on, and Free Bird will work from that.' };
    }
    if (!text.trim().length) {
      return { ok: false, code: 'whitespace', message: 'That came through as blank space. A sentence or two is plenty.' };
    }
    if (text.trim().length < MIN_CHARS) {
      return { ok: false, code: 'short', message: 'A bit more would help. Try one sentence about what is happening and one about how it is landing.' };
    }
    if (text.length > HARD_MAX_CHARS) {
      return { ok: false, code: 'too-long', message: 'That is longer than this form can take. Paste the part that matters most, up to about 2000 characters.' };
    }
    if (text.length > MAX_CHARS) {
      return {
        ok: true,
        code: 'truncate',
        message: 'That is longer than Free Bird reads. It will use the first 2000 characters.'
      };
    }
    return { ok: true, code: 'ok', message: '' };
  }

  function makeId() {
    return 'fb-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  /**
   * Run the full analysis.
   *
   * @param {string} text
   * @param {{topic?: string, timeframe?: string, pressure?: number}} context
   * @param {{forceLexical?: boolean}} options
   * @returns {Promise<object>} profile
   */
  function analyze(text, context, options) {
    options = options || {};
    context = context || {};

    var startedAt = (window.performance && performance.now) ? performance.now() : Date.now();
    var pre = FB.classifier.preprocess(text);

    // 1. Safety first, always, before any coaching path is chosen.
    var safety = FB.safety.scan(pre.original);

    if (FB.safety.isBlocking(safety)) {
      return Promise.resolve({
        id: makeId(),
        createdAt: Date.now(),
        blocked: true,
        safety: safety,
        text: pre.original,
        context: context
      });
    }

    // 2. Lexical scoring is always computed, model or not.
    var lexical = FB.classifier.scoreLexical(pre);

    // 3. Semantic scoring only if the model and its anchors are ready.
    var wantSemantic = !options.forceLexical && FB.model.semanticReady();
    var semanticPromise = wantSemantic
      ? FB.model.embed(pre.forModel)
          .then(function (vector) {
            return {
              vector: vector,
              result: FB.classifier.scoreSemantic(vector, FB.model.getAnchorCentroids())
            };
          })
          .catch(function () { return null; })
      : Promise.resolve(null);

    return semanticPromise.then(function (semantic) {
      var semanticScores = semantic ? semantic.result.scores : null;
      var combined = FB.classifier.combineScores(lexical.scores, semanticScores);
      var ranked = FB.classifier.rankSignals(combined);
      var reportable = FB.classifier.selectReportable(ranked);
      var patterns = FB.classifier.detectPatterns(pre);
      var pressure = FB.classifier.estimatePressure(combined, pre, context);
      var subject = FB.recommendations.extractSubject(pre.normalised);
      var endedAt = (window.performance && performance.now) ? performance.now() : Date.now();

      var profile = {
        id: makeId(),
        createdAt: Date.now(),
        blocked: false,
        safety: safety,
        text: pre.original,
        truncated: pre.truncated,
        wordCount: pre.wordCount,
        context: {
          topic: context.topic || '',
          timeframe: context.timeframe || '',
          pressure: context.pressure ? Number(context.pressure) : null
        },
        scores: combined,
        lexicalScores: lexical.scores,
        lexicalEvidence: lexical.evidence,
        semanticScores: semanticScores,
        ranked: ranked,
        reportable: reportable,
        primarySignal: reportable.length ? reportable[0].id : 'low-stress',
        // 'clear', 'thin', 'calm' or 'none'. The snapshot says so out loud
        // rather than presenting a weak match as confidently as a strong one.
        evidence: FB.classifier.evidenceStrength(reportable),
        patterns: patterns,
        pressure: pressure,
        subject: subject,
        // `source` is what the interface reports, and it is never optimistic.
        source: semanticScores ? 'on-device' : 'rules',
        modelId: semanticScores ? FB.model.MODEL_ID : null,
        latencyMs: Math.round(endedAt - startedAt),
        embedding: semantic ? semantic.vector : null
      };

      profile.plan = FB.recommendations.buildPlan(profile);
      return profile;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Wingman intent centroids                                            */
  /* ------------------------------------------------------------------ */

  var intentCentroids = null;
  var intentBuild = null;

  function buildIntentCentroids() {
    if (intentCentroids) return Promise.resolve(intentCentroids);
    if (!FB.model.isReady()) return Promise.resolve(null);
    if (intentBuild) return intentBuild;

    var intents = FB.fallback.INTENTS;
    var out = {};

    intentBuild = intents.reduce(function (chain, intent) {
      return chain.then(function () {
        return FB.model.embedMany(intent.anchors).then(function (vectors) {
          out[intent.id] = FB.model.meanVector(vectors);
        });
      });
    }, Promise.resolve())
      .then(function () {
        intentCentroids = out;
        intentBuild = null;
        return intentCentroids;
      })
      .catch(function () {
        intentBuild = null;
        return null;
      });

    return intentBuild;
  }

  /**
   * Produce one Wingman reply. Safety is scanned on the message first, exactly
   * as it is for the stress check.
   *
   * @param {string} message
   * @param {object} sessionContext  from js/wingman-context.js
   * @param {number} turn            rotates the composer's slot pools
   * @param {object} [options]       { recent: string[] } previously sent replies,
   *                                 so the composer can avoid repeating one
   */
  function respond(message, sessionContext, turn, options) {
    options = options || {};
    var safety = FB.safety.scan(message);
    if (FB.safety.isBlocking(safety)) {
      return Promise.resolve({ blocked: true, safety: safety });
    }

    // Read once here rather than inside the composer, so the semantic path
    // gets the same extracted nouns and deadlines that the lexical path does.
    var read = FB.fallback.readMessage(message);

    function finish(match) {
      return {
        blocked: false,
        safety: safety,
        intent: match.intent,
        method: match.method,
        confidence: typeof match.confidence === 'number' ? match.confidence : null,
        secondary: match.secondary || null,
        text: FB.fallback.compose(match.intent, sessionContext, turn, {
          read: read,
          secondary: match.secondary || null,
          recent: options.recent || []
        })
      };
    }

    if (!FB.model.isReady()) {
      return Promise.resolve(finish(FB.fallback.matchIntentLexically(message)));
    }

    return buildIntentCentroids()
      .then(function (centroids) {
        if (!centroids) return FB.fallback.matchIntentLexically(message);
        return FB.model.embed(String(message).toLowerCase()).then(function (vector) {
          var match = FB.fallback.matchIntentSemantically(vector, centroids);
          if (!match) return FB.fallback.matchIntentLexically(message);
          // The embedding decides the intent; the lexical pass is still worth
          // running for its runner-up, which is what lets a message about two
          // things be answered as being about two things.
          if (!match.secondary) {
            var lexical = FB.fallback.matchIntentLexically(message);
            if (lexical.intent !== match.intent && lexical.score >= 3) {
              match.secondary = lexical.intent;
            }
          }
          return match;
        });
      })
      .catch(function () {
        return FB.fallback.matchIntentLexically(message);
      })
      .then(finish);
  }

  function resetIntentCache() {
    intentCentroids = null;
    intentBuild = null;
  }

  FB.pipeline = {
    MIN_CHARS: MIN_CHARS,
    MAX_CHARS: MAX_CHARS,
    HARD_MAX_CHARS: HARD_MAX_CHARS,
    validate: validate,
    analyze: analyze,
    respond: respond,
    buildIntentCentroids: buildIntentCentroids,
    resetIntentCache: resetIntentCache
  };
})(window.FB = window.FB || {});
