/**
 * On-device model loader.
 *
 * Free Bird uses a sentence-embedding model that runs entirely in the browser
 * through Transformers.js and WebAssembly. The only network traffic this module
 * ever produces is fetching the library and the model weights from a public
 * package and model CDN. User text is never sent anywhere: it is tokenised and
 * embedded inside the page.
 *
 * Design decisions worth knowing:
 *
 *   - Loading is lazy and never blocks first paint. The app is fully usable in
 *     "Offline coaching mode" before, during, and after a failed load.
 *   - Loading requires an explicit opt-in the first time, because downloading
 *     roughly 25 MB of weights should be the user's choice, not a surprise.
 *   - We deliberately do NOT ship a generative language model. A small
 *     embedding model is enough for the classification work Free Bird actually
 *     does, and it keeps the download and the latency reasonable on a school
 *     laptop. See the README for the reasoning.
 */
(function (FB) {
  'use strict';

  var STATUS = {
    DISABLED: 'disabled',
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    UNAVAILABLE: 'unavailable'
  };

  /**
   * Candidate library builds, tried in order. Both expose a compatible
   * `pipeline` factory. Having two means a single CDN hiccup does not remove
   * on-device inference for everyone.
   */
  var LIB_SOURCES = [
    { url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.4', name: '@huggingface/transformers 3.7.4' },
    { url: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2', name: '@xenova/transformers 2.17.2' }
  ];

  var MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
  var MODEL_HUMAN_NAME = 'all-MiniLM-L6-v2 (quantised)';
  var LOAD_TIMEOUT_MS = 90000;

  var state = {
    status: STATUS.IDLE,
    progress: 0,
    error: null,
    libName: null,
    extractor: null,
    anchorCentroids: null,
    loadStartedAt: null,
    loadMs: null,
    cancelled: false
  };

  var listeners = [];

  function on(fn) {
    listeners.push(fn);
    return function off() {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  function emit() {
    var snapshot = getState();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (err) { /* a bad listener must not break loading */ }
    });
  }

  function setStatus(status, extra) {
    state.status = status;
    if (extra) {
      Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
    }
    emit();
  }

  function getState() {
    return {
      status: state.status,
      progress: state.progress,
      error: state.error,
      modelId: MODEL_ID,
      modelName: MODEL_HUMAN_NAME,
      library: state.libName,
      loadMs: state.loadMs,
      ready: state.status === STATUS.READY
    };
  }

  function isReady() {
    return state.status === STATUS.READY && !!state.extractor;
  }

  /* ------------------------------------------------------------------ */
  /* Loading                                                             */
  /* ------------------------------------------------------------------ */

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          reject(new Error(message));
        }
      }, ms);
      promise.then(function (value) {
        if (!done) { done = true; clearTimeout(timer); resolve(value); }
      }, function (err) {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      });
    });
  }

  /**
   * Dynamic import of an ES module from inside a classic script. This is what
   * lets index.html stay a plain page that also opens from the filesystem.
   * Under file:// the import is expected to fail, and that failure is handled
   * as Offline coaching mode rather than as an error the user has to read.
   */
  function importLibrary() {
    var attempt = 0;

    function tryNext() {
      if (attempt >= LIB_SOURCES.length) {
        return Promise.reject(new Error('No Transformers.js build could be loaded.'));
      }
      var source = LIB_SOURCES[attempt++];
      return import(/* webpackIgnore: true */ source.url)
        .then(function (mod) {
          state.libName = source.name;
          return mod;
        })
        .catch(function () {
          return tryNext();
        });
    }

    return tryNext();
  }

  function handleProgress(report) {
    if (!report) return;
    if (report.status === 'progress' && typeof report.progress === 'number') {
      state.progress = Math.max(state.progress, Math.min(99, Math.round(report.progress)));
      emit();
    } else if (report.status === 'done') {
      state.progress = Math.max(state.progress, 90);
      emit();
    }
  }

  /**
   * Load the library and warm up the extractor. Safe to call repeatedly:
   * concurrent calls share one promise.
   */
  var inFlight = null;

  function load() {
    if (isReady()) return Promise.resolve(getState());
    if (state.status === STATUS.DISABLED) {
      return Promise.resolve(getState());
    }
    if (inFlight) return inFlight;

    state.cancelled = false;
    state.error = null;
    state.progress = 0;
    state.loadStartedAt = Date.now();
    setStatus(STATUS.LOADING);

    inFlight = withTimeout(
      importLibrary().then(function (transformers) {
        if (state.cancelled) throw new Error('cancelled');

        // Both library versions accept an options bag; unknown keys are ignored,
        // so one call covers the v2 (`quantized`) and v3 (`dtype`) spellings.
        return transformers.pipeline('feature-extraction', MODEL_ID, {
          quantized: true,
          dtype: 'q8',
          progress_callback: handleProgress
        });
      }),
      LOAD_TIMEOUT_MS,
      'Model loading took too long.'
    )
      .then(function (extractor) {
        if (state.cancelled) throw new Error('cancelled');
        state.extractor = extractor;
        state.progress = 100;
        state.loadMs = Date.now() - state.loadStartedAt;
        setStatus(STATUS.READY);
        // Anchor centroids are computed once, in the background, so the first
        // real analysis is not slowed down by embedding 40 anchor phrases.
        return buildAnchorCentroids().then(function () { return getState(); });
      })
      .catch(function (err) {
        state.extractor = null;
        state.error = err && err.message ? err.message : 'Unknown loading error';
        setStatus(state.cancelled ? STATUS.IDLE : STATUS.UNAVAILABLE);
        return getState();
      })
      .then(function (result) {
        inFlight = null;
        return result;
      });

    return inFlight;
  }

  function cancel() {
    if (state.status !== STATUS.LOADING) return;
    state.cancelled = true;
    state.error = null;
    setStatus(STATUS.IDLE);
  }

  function disable() {
    state.cancelled = true;
    state.extractor = null;
    state.anchorCentroids = null;
    setStatus(STATUS.DISABLED);
  }

  function reset() {
    state.cancelled = false;
    state.error = null;
    state.progress = 0;
    setStatus(STATUS.IDLE);
  }

  /* ------------------------------------------------------------------ */
  /* Inference                                                           */
  /* ------------------------------------------------------------------ */

  /** Mean-pooled, L2-normalised sentence embedding as a plain array. */
  function embed(text) {
    if (!isReady()) return Promise.reject(new Error('Model is not loaded.'));
    return state.extractor(String(text || ''), { pooling: 'mean', normalize: true })
      .then(function (output) {
        var data = output && output.data ? output.data : output;
        return Array.prototype.slice.call(data);
      });
  }

  function embedMany(texts) {
    // Sequential rather than batched: it keeps peak memory low on the kind of
    // laptop this app is meant to run on, and the anchor set is small.
    var results = [];
    return texts.reduce(function (chain, text) {
      return chain.then(function () {
        return embed(text).then(function (vec) { results.push(vec); });
      });
    }, Promise.resolve()).then(function () { return results; });
  }

  function meanVector(vectors) {
    if (!vectors.length) return null;
    var dim = vectors[0].length;
    var out = new Array(dim).fill(0);
    vectors.forEach(function (vec) {
      for (var i = 0; i < dim; i++) out[i] += vec[i];
    });
    for (var j = 0; j < dim; j++) out[j] /= vectors.length;
    return out;
  }

  /**
   * Embed the anchor phrases for each stress signal and store the centroid.
   * Classification is then a cosine comparison against these ten vectors.
   */
  function buildAnchorCentroids() {
    if (!isReady()) return Promise.resolve(null);
    if (state.anchorCentroids) return Promise.resolve(state.anchorCentroids);

    var signals = FB.classifier.SIGNALS;
    var centroids = {};

    return signals.reduce(function (chain, signal) {
      return chain.then(function () {
        return embedMany(signal.anchors).then(function (vectors) {
          centroids[signal.id] = meanVector(vectors);
        });
      });
    }, Promise.resolve()).then(function () {
      state.anchorCentroids = centroids;
      emit();
      return centroids;
    }).catch(function () {
      // If anchor embedding fails we stay in lexical mode rather than crashing.
      state.anchorCentroids = null;
      return null;
    });
  }

  function getAnchorCentroids() {
    return state.anchorCentroids;
  }

  function semanticReady() {
    return isReady() && !!state.anchorCentroids;
  }

  FB.model = {
    STATUS: STATUS,
    MODEL_ID: MODEL_ID,
    MODEL_HUMAN_NAME: MODEL_HUMAN_NAME,
    load: load,
    cancel: cancel,
    disable: disable,
    reset: reset,
    on: on,
    getState: getState,
    isReady: isReady,
    semanticReady: semanticReady,
    embed: embed,
    embedMany: embedMany,
    meanVector: meanVector,
    getAnchorCentroids: getAnchorCentroids,
    buildAnchorCentroids: buildAnchorCentroids
  };
})(window.FB = window.FB || {});
