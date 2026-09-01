/**
 * Local storage layer.
 *
 * Everything Free Bird keeps lives in this browser under keys prefixed with
 * "freebird.v1.". Nothing is sent anywhere. If localStorage is unavailable,
 * blocked, or full, the app degrades to an in-memory store for the session and
 * says so rather than failing.
 */
(function (FB) {
  'use strict';

  var PREFIX = 'freebird.v1.';

  var KEYS = {
    prefs: PREFIX + 'prefs',
    session: PREFIX + 'session',
    history: PREFIX + 'history',
    chat: PREFIX + 'chat',
    firstRun: PREFIX + 'seen-intro'
  };

  var memoryStore = {};
  var available = null;
  var lastError = null;

  function testAvailability() {
    if (available !== null) return available;
    try {
      var probe = PREFIX + 'probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      available = true;
    } catch (err) {
      lastError = err;
      available = false;
    }
    return available;
  }

  function read(key, fallback) {
    try {
      var raw = testAvailability()
        ? window.localStorage.getItem(key)
        : (Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      // Corrupt or unreadable value: drop it rather than breaking the page.
      lastError = err;
      remove(key);
      return fallback;
    }
  }

  function write(key, value) {
    var raw;
    try {
      raw = JSON.stringify(value);
    } catch (err) {
      lastError = err;
      return false;
    }
    if (!testAvailability()) {
      memoryStore[key] = raw;
      return false;
    }
    try {
      window.localStorage.setItem(key, raw);
      return true;
    } catch (err) {
      // Most often a quota error. Keep the session working in memory.
      lastError = err;
      available = false;
      memoryStore[key] = raw;
      return false;
    }
  }

  function remove(key) {
    try {
      if (testAvailability()) window.localStorage.removeItem(key);
    } catch (err) { lastError = err; }
    delete memoryStore[key];
  }

  /** Remove every key this application created, and nothing else. */
  function clearAll() {
    var removed = 0;
    try {
      if (testAvailability()) {
        var toRemove = [];
        for (var i = 0; i < window.localStorage.length; i++) {
          var key = window.localStorage.key(i);
          if (key && key.indexOf(PREFIX) === 0) toRemove.push(key);
        }
        toRemove.forEach(function (key) {
          window.localStorage.removeItem(key);
          removed++;
        });
      }
    } catch (err) { lastError = err; }

    Object.keys(memoryStore).forEach(function (key) {
      delete memoryStore[key];
      removed++;
    });
    return removed;
  }

  function listKeys() {
    var found = [];
    try {
      if (testAvailability()) {
        for (var i = 0; i < window.localStorage.length; i++) {
          var key = window.localStorage.key(i);
          if (key && key.indexOf(PREFIX) === 0) found.push(key);
        }
      }
    } catch (err) { lastError = err; }
    Object.keys(memoryStore).forEach(function (key) {
      if (found.indexOf(key) === -1) found.push(key);
    });
    return found;
  }

  function approximateBytes() {
    var total = 0;
    listKeys().forEach(function (key) {
      var raw = null;
      try {
        raw = testAvailability() ? window.localStorage.getItem(key) : memoryStore[key];
      } catch (err) { raw = memoryStore[key] || null; }
      if (raw) total += key.length + raw.length;
    });
    return total;
  }

  /* ------------------------------------------------------------------ */
  /* Typed accessors                                                     */
  /* ------------------------------------------------------------------ */

  var DEFAULT_PREFS = {
    reducedMotion: false,
    allowModelDownload: null,   // null means the user has not chosen yet
    saveChat: false,            // chat is never persisted unless this is true
    seenIntro: false
  };

  function getPrefs() {
    var stored = read(KEYS.prefs, {});
    var prefs = {};
    Object.keys(DEFAULT_PREFS).forEach(function (key) {
      prefs[key] = Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : DEFAULT_PREFS[key];
    });
    return prefs;
  }

  function setPrefs(patch) {
    var next = getPrefs();
    Object.keys(patch || {}).forEach(function (key) { next[key] = patch[key]; });
    write(KEYS.prefs, next);
    return next;
  }

  function getSession() {
    return read(KEYS.session, null);
  }

  function setSession(session) {
    if (!session) {
      remove(KEYS.session);
      return;
    }
    write(KEYS.session, session);
  }

  function getHistory() {
    var history = read(KEYS.history, []);
    return Array.isArray(history) ? history : [];
  }

  function setHistory(entries) {
    // A cap keeps the stored payload small and predictable.
    var trimmed = (entries || []).slice(-60);
    write(KEYS.history, trimmed);
    return trimmed;
  }

  function addHistoryEntry(entry) {
    var history = getHistory();
    history.push(entry);
    return setHistory(history);
  }

  function getChat() {
    return read(KEYS.chat, null);
  }

  function setChat(messages) {
    if (!messages) {
      remove(KEYS.chat);
      return;
    }
    write(KEYS.chat, messages);
  }

  function clearChat() {
    remove(KEYS.chat);
  }

  /* ------------------------------------------------------------------ */
  /* Cross-tab change notification                                       */
  /* ------------------------------------------------------------------ */

  /** Reverse lookup: storage key -> the slice name the state store uses. */
  var SLICE_BY_KEY = {};
  Object.keys(KEYS).forEach(function (name) { SLICE_BY_KEY[KEYS[name]] = name; });

  function sliceForKey(key) {
    return Object.prototype.hasOwnProperty.call(SLICE_BY_KEY, key) ? SLICE_BY_KEY[key] : null;
  }

  /**
   * Watch for writes made by another tab of this app.
   *
   * The `storage` event only fires in documents *other* than the one that made
   * the write, so this can never echo our own change back at us. `fn` receives
   * the slice name ('prefs', 'session', 'history', 'chat'), or null when the
   * whole store was cleared, which is what `localStorage.clear()` and our own
   * clearAll() look like from the outside.
   */
  function onExternalChange(fn) {
    if (typeof window.addEventListener !== 'function') return function () {};

    function handler(event) {
      // Some browsers fire for sessionStorage too. We only own localStorage.
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key === null || event.key === undefined) {
        fn(null);
        return;
      }
      var key = String(event.key);
      if (key.indexOf(PREFIX) !== 0) return;
      fn(sliceForKey(key));
    }

    window.addEventListener('storage', handler);
    return function stop() { window.removeEventListener('storage', handler); };
  }

  FB.storage = {
    PREFIX: PREFIX,
    KEYS: KEYS,
    DEFAULT_PREFS: DEFAULT_PREFS,
    isAvailable: testAvailability,
    lastError: function () { return lastError; },
    read: read,
    write: write,
    remove: remove,
    clearAll: clearAll,
    listKeys: listKeys,
    approximateBytes: approximateBytes,
    getPrefs: getPrefs,
    setPrefs: setPrefs,
    getSession: getSession,
    setSession: setSession,
    getHistory: getHistory,
    setHistory: setHistory,
    addHistoryEntry: addHistoryEntry,
    getChat: getChat,
    setChat: setChat,
    clearChat: clearChat,
    sliceForKey: sliceForKey,
    onExternalChange: onExternalChange
  };
})(window.FB = window.FB || {});
