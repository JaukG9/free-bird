/**
 * Application state.
 *
 * One store, plain objects, explicit actions, synchronous notification. Views
 * subscribe and re-render themselves. That is the whole architecture: the app
 * is small enough that anything more would be overhead.
 *
 * What is persisted, and what is deliberately not:
 *   persisted   preferences, the current session (stressor text, profile,
 *               plan state, check-in), and a short history of self-reported
 *               change per completed plan
 *   in memory   the sentence embedding, model state, demo step, and the
 *               Wingman conversation unless the user turns on "Save this
 *               conversation on this device"
 */
(function (FB) {
  'use strict';

  var listeners = [];

  var state = {
    prefs: FB.storage.getPrefs(),
    session: null,
    history: FB.storage.getHistory(),
    chat: { messages: [], turn: 0 },
    model: FB.model.getState(),
    safetyBlock: null,
    demo: { active: false, stepIndex: -1, usedLiveAi: false },
    storageWorking: FB.storage.isAvailable(),
    lastError: null
  };

  /* ------------------------------------------------------------------ */
  /* Subscription                                                        */
  /* ------------------------------------------------------------------ */

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  function notify(reason) {
    listeners.forEach(function (fn) {
      try {
        fn(state, reason);
      } catch (err) {
        // A failing view must not stop the others from updating.
        if (window.console && console.error) console.error('Listener failed:', err);
      }
    });
  }

  function get() {
    return state;
  }

  /* ------------------------------------------------------------------ */
  /* Persistence helpers                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * The embedding is a 384 number array. It is useful in memory and useless on
   * disk, so it is stripped before the session is written.
   */
  function serialisableSession(session) {
    if (!session) return null;
    var copy = JSON.parse(JSON.stringify({
      createdAt: session.createdAt,
      demo: session.demo,
      profile: Object.assign({}, session.profile, { embedding: null }),
      plan: session.plan,
      checkin: session.checkin,
      exerciseLog: session.exerciseLog,
      completedAt: session.completedAt
    }));
    return copy;
  }

  function persistSession() {
    FB.storage.setSession(serialisableSession(state.session));
    state.storageWorking = FB.storage.isAvailable();
  }

  function persistChat() {
    if (state.prefs.saveChat) {
      FB.storage.setChat(state.chat.messages);
    } else {
      FB.storage.clearChat();
    }
  }

  function restore() {
    var stored = FB.storage.getSession();
    if (stored && stored.profile) {
      state.session = stored;
    }
    if (state.prefs.saveChat) {
      var chat = FB.storage.getChat();
      if (Array.isArray(chat)) {
        state.chat = { messages: chat, turn: chat.filter(function (m) { return m.role === 'user'; }).length };
      }
    }
    state.history = FB.storage.getHistory();
    notify('restore');
  }

  /* ------------------------------------------------------------------ */
  /* Preferences                                                         */
  /* ------------------------------------------------------------------ */

  function setPref(key, value) {
    var patch = {};
    patch[key] = value;
    state.prefs = FB.storage.setPrefs(patch);
    if (key === 'saveChat') persistChat();
    applyMotionPreference();
    notify('prefs');
    return state.prefs;
  }

  /**
   * The user's own setting wins over the system one when it is turned on. We
   * never override a system reduced-motion preference in the other direction.
   */
  function applyMotionPreference() {
    var root = document.documentElement;
    if (state.prefs.reducedMotion) {
      root.setAttribute('data-reduced-motion', 'true');
    } else {
      root.removeAttribute('data-reduced-motion');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Session                                                             */
  /* ------------------------------------------------------------------ */

  function startSession(profile, options) {
    options = options || {};
    state.session = {
      createdAt: Date.now(),
      demo: !!options.demo,
      profile: profile,
      plan: profile.plan,
      checkin: null,
      exerciseLog: [],
      completedAt: null
    };
    state.chat = { messages: [], turn: 0 };
    state.safetyBlock = null;
    persistSession();
    persistChat();
    notify('session');
    return state.session;
  }

  function setSafetyBlock(result) {
    state.safetyBlock = result || null;
    notify('safety');
  }

  function clearSafetyBlock() {
    state.safetyBlock = null;
    notify('safety');
  }

  function hasSession() {
    return !!(state.session && state.session.profile);
  }

  function completeStep(stage) {
    if (!hasSession()) return;
    var step = null;
    state.session.plan.steps.forEach(function (s) {
      if (s.stage === stage) { s.done = true; s.doneAt = Date.now(); step = s; }
    });
    if (step) {
      state.session.exerciseLog.push({
        exerciseId: step.exerciseId,
        stage: stage,
        at: Date.now()
      });
    }
    if (state.session.plan.steps.every(function (s) { return s.done; })) {
      state.session.completedAt = Date.now();
    }
    persistSession();
    notify('plan');
  }

  function uncompleteStep(stage) {
    if (!hasSession()) return;
    state.session.plan.steps.forEach(function (s) {
      if (s.stage === stage) { s.done = false; delete s.doneAt; }
    });
    state.session.completedAt = null;
    persistSession();
    notify('plan');
  }

  function swapStep(stage, exerciseId) {
    if (!hasSession()) return;
    state.session.plan.steps.forEach(function (s) {
      if (s.stage === stage) {
        s.exerciseId = exerciseId;
        s.done = false;
        delete s.doneAt;
      }
    });
    state.session.completedAt = null;
    persistSession();
    notify('plan');
  }

  function restartPlan() {
    if (!hasSession()) return;
    state.session.plan = FB.recommendations.buildPlan(state.session.profile);
    state.session.exerciseLog = [];
    state.session.checkin = null;
    state.session.completedAt = null;
    persistSession();
    notify('plan');
  }

  function clearSession() {
    state.session = null;
    state.chat = { messages: [], turn: 0 };
    FB.storage.setSession(null);
    FB.storage.clearChat();
    notify('session');
  }

  /* ------------------------------------------------------------------ */
  /* Check-in                                                            */
  /* ------------------------------------------------------------------ */

  var CHANGE_OPTIONS = [
    { id: 'much-worse', label: 'Much worse', delta: 2 },
    { id: 'a-little-worse', label: 'A little worse', delta: 1 },
    { id: 'about-the-same', label: 'About the same', delta: 0 },
    { id: 'a-little-better', label: 'A little better', delta: -2 },
    { id: 'much-better', label: 'Much better', delta: -3 }
  ];

  function changeOption(id) {
    for (var i = 0; i < CHANGE_OPTIONS.length; i++) {
      if (CHANGE_OPTIONS[i].id === id) return CHANGE_OPTIONS[i];
    }
    return null;
  }

  /**
   * Record a check-in.
   *
   * `after` is the user's own second rating when they give one. If they only
   * pick a change option, we derive an approximate after-value from the delta
   * and mark it as derived so the Progress page can label it honestly.
   */
  function recordCheckin(changeId, note, afterValue) {
    if (!hasSession()) return null;
    var option = changeOption(changeId);
    if (!option) return null;

    var before = state.session.profile.pressure.value;
    var derived = typeof afterValue !== 'number';
    var after = derived
      ? Math.max(1, Math.min(10, before + option.delta))
      : afterValue;

    var checkin = {
      at: Date.now(),
      change: option.id,
      changeLabel: option.label,
      note: (note || '').slice(0, 300),
      before: before,
      after: after,
      afterDerived: derived
    };

    state.session.checkin = checkin;
    persistSession();
    addHistoryFromSession();
    notify('checkin');
    return checkin;
  }

  /**
   * History stores a compact summary only. It never stores the raw stressor
   * text, so clearing a session does not leave the written reflection behind.
   */
  function addHistoryFromSession() {
    if (!hasSession() || !state.session.checkin) return;
    var session = state.session;
    var lastExercise = session.exerciseLog[session.exerciseLog.length - 1];
    var exercise = lastExercise ? FB.exercises.get(lastExercise.exerciseId) : null;

    var entry = {
      id: session.profile.id,
      demo: !!session.demo,
      createdAt: session.checkin.at,
      subject: session.profile.subject || null,
      primarySignal: session.profile.primarySignal,
      drivers: FB.recommendations.driversFor(session.profile).map(function (d) { return d.label; }),
      pressureBefore: session.checkin.before,
      pressureAfter: session.checkin.after,
      afterDerived: session.checkin.afterDerived,
      change: session.checkin.change,
      exerciseId: exercise ? exercise.id : null,
      exerciseCategory: exercise ? exercise.category : null,
      exercisesCompleted: session.exerciseLog.length,
      source: session.profile.source
    };

    var history = state.history.filter(function (h) { return h.id !== entry.id; });
    history.push(entry);
    state.history = FB.storage.setHistory(history);
  }

  /* ------------------------------------------------------------------ */
  /* Chat                                                                */
  /* ------------------------------------------------------------------ */

  function addChatMessage(message) {
    state.chat.messages.push(message);
    if (message.role === 'user') state.chat.turn++;
    persistChat();
    notify('chat');
    return message;
  }

  function resetChat() {
    state.chat = { messages: [], turn: 0 };
    FB.storage.clearChat();
    notify('chat');
  }

  /* ------------------------------------------------------------------ */
  /* Demo                                                                */
  /* ------------------------------------------------------------------ */

  function setDemo(patch) {
    Object.keys(patch || {}).forEach(function (key) { state.demo[key] = patch[key]; });
    notify('demo');
  }

  function seedDemoHistory() {
    var seeded = FB.demoData.seedHistory(Date.now());
    var existingIds = state.history.map(function (h) { return h.id; });
    var toAdd = seeded.filter(function (entry) { return existingIds.indexOf(entry.id) === -1; });
    if (toAdd.length) {
      state.history = FB.storage.setHistory(state.history.concat(toAdd).sort(function (a, b) {
        return a.createdAt - b.createdAt;
      }));
      notify('history');
    }
  }

  function clearDemoData() {
    state.history = FB.storage.setHistory(state.history.filter(function (h) { return !h.demo; }));
    if (state.session && state.session.demo) {
      clearSession();
    }
    state.demo = { active: false, stepIndex: -1, usedLiveAi: false };
    notify('demo');
  }

  /* ------------------------------------------------------------------ */
  /* Data deletion                                                       */
  /* ------------------------------------------------------------------ */

  function clearAllData() {
    var removed = FB.storage.clearAll();
    state.prefs = FB.storage.getPrefs();
    state.session = null;
    state.history = [];
    state.chat = { messages: [], turn: 0 };
    state.safetyBlock = null;
    state.demo = { active: false, stepIndex: -1, usedLiveAi: false };
    applyMotionPreference();
    notify('cleared');
    return removed;
  }

  /* ------------------------------------------------------------------ */
  /* Model state mirror                                                  */
  /* ------------------------------------------------------------------ */

  FB.model.on(function (modelState) {
    state.model = modelState;
    notify('model');
  });

  FB.state = {
    CHANGE_OPTIONS: CHANGE_OPTIONS,
    get: get,
    subscribe: subscribe,
    notify: notify,
    restore: restore,
    setPref: setPref,
    applyMotionPreference: applyMotionPreference,
    startSession: startSession,
    hasSession: hasSession,
    clearSession: clearSession,
    setSafetyBlock: setSafetyBlock,
    clearSafetyBlock: clearSafetyBlock,
    completeStep: completeStep,
    uncompleteStep: uncompleteStep,
    swapStep: swapStep,
    restartPlan: restartPlan,
    recordCheckin: recordCheckin,
    changeOption: changeOption,
    addChatMessage: addChatMessage,
    resetChat: resetChat,
    setDemo: setDemo,
    seedDemoHistory: seedDemoHistory,
    clearDemoData: clearDemoData,
    clearAllData: clearAllData
  };
})(window.FB = window.FB || {});
