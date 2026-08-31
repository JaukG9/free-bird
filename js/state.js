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
    refreshHistoryEntry();
    notify('plan');
  }

  function uncompleteStep(stage) {
    if (!hasSession()) return;
    state.session.plan.steps.forEach(function (s) {
      if (s.stage === stage) { s.done = false; delete s.doneAt; }
    });
    state.session.completedAt = null;
    persistSession();
    refreshHistoryEntry();
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
    refreshHistoryEntry();
    notify('plan');
  }

  function restartPlan() {
    if (!hasSession()) return;
    state.session.plan = FB.recommendations.buildPlan(state.session.profile);
    state.session.exerciseLog = [];
    state.session.checkin = null;
    state.session.completedAt = null;
    persistSession();
    refreshHistoryEntry();
    notify('plan');
  }

  /**
   * Swap in a freshly analysed profile while keeping the progress the user has
   * already made: which steps are done, the exercise log, the check-in, and
   * the conversation. Used when the demo re-runs the same text through the
   * on-device model, where losing the walkthrough's place would be worse than
   * the stale analysis it replaces.
   *
   * This exists so that re-analysis goes through one action that persists and
   * notifies, rather than being assembled by mutating the store from outside.
   */
  function replaceSession(profile, options) {
    options = options || {};
    var previous = state.session;
    var previousChat = state.chat;

    startSession(profile, { demo: options.demo !== undefined ? options.demo : (previous && previous.demo) });

    var next = state.session;
    if (previous && options.carryProgress !== false) {
      (previous.plan.steps || []).forEach(function (oldStep) {
        next.plan.steps.forEach(function (newStep) {
          if (newStep.stage === oldStep.stage && oldStep.done) {
            newStep.done = true;
            if (oldStep.doneAt) newStep.doneAt = oldStep.doneAt;
          }
        });
      });
      next.exerciseLog = previous.exerciseLog || [];
      next.checkin = previous.checkin || null;
      next.completedAt = previous.completedAt || null;
    }
    if (options.carryChat !== false) {
      state.chat = previousChat;
    }

    persistSession();
    persistChat();
    refreshHistoryEntry();
    notify('session');
    return next;
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
  function historyEntryFromSession() {
    if (!hasSession() || !state.session.checkin) return null;
    var session = state.session;
    var lastExercise = session.exerciseLog[session.exerciseLog.length - 1];
    var exercise = lastExercise ? FB.exercises.get(lastExercise.exerciseId) : null;

    return {
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
  }

  function addHistoryFromSession() {
    var entry = historyEntryFromSession();
    if (!entry) return;
    var history = state.history.filter(function (h) { return h.id !== entry.id; });
    history.push(entry);
    state.history = FB.storage.setHistory(history);
  }

  /**
   * Keep an already-recorded history entry in step with the live plan.
   *
   * Without this, completing a fourth exercise or swapping a step after the
   * check-in leaves Progress showing figures that no longer match My Plan.
   * Does nothing until the session has actually been recorded, because an
   * un-checked-in session belongs in the live panel, not in the timeline.
   */
  function refreshHistoryEntry() {
    if (!hasSession() || !state.session.checkin) return;
    var id = state.session.profile.id;
    var exists = state.history.some(function (h) { return h.id === id; });
    if (!exists) return;
    addHistoryFromSession();
  }

  /* ------------------------------------------------------------------ */
  /* Live session summary                                                */
  /* ------------------------------------------------------------------ */

  /**
   * A compact read of the session that is happening right now, in the same
   * shape Progress uses for recorded entries. Progress calls this so a stress
   * check shows up there immediately rather than only after a check-in.
   * Returns null when there is nothing in flight, or when this session has
   * already been written to history and so appears in the timeline instead.
   */
  function liveSnapshot() {
    if (!hasSession()) return null;
    var session = state.session;
    var profile = session.profile;
    var id = profile.id;

    if (state.history.some(function (h) { return h.id === id; })) return null;

    var steps = (session.plan && session.plan.steps) || [];
    var doneSteps = steps.filter(function (step) { return step.done; });
    var next = steps.filter(function (step) { return !step.done; })[0] || null;
    var nextExercise = next ? FB.exercises.get(next.exerciseId) : null;

    return {
      id: id,
      demo: !!session.demo,
      createdAt: profile.createdAt,
      subject: profile.subject || null,
      headline: session.plan ? session.plan.headline : null,
      primarySignal: profile.primarySignal,
      drivers: FB.recommendations.driversFor(profile).map(function (d) { return d.label; }),
      pressureBefore: profile.pressure ? profile.pressure.value : null,
      pressureBand: profile.pressure ? profile.pressure.band : null,
      stepsDone: doneSteps.length,
      stepsTotal: steps.length,
      exercisesCompleted: session.exerciseLog ? session.exerciseLog.length : 0,
      nextStepLabel: next ? next.label : null,
      nextExerciseTitle: nextExercise ? nextExercise.title : null,
      awaitingCheckin: steps.length > 0 && doneSteps.length === steps.length && !session.checkin,
      source: profile.source
    };
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
  /* Cross-tab synchronisation                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Adopt a write made by another tab of Free Bird.
   *
   * Two tabs used to drift apart silently: finishing a plan in one left the
   * other showing a stale plan until it was reloaded, and both then wrote over
   * each other. The `storage` event fires only in the *other* document, so
   * this is never triggered by our own writes and cannot loop.
   *
   * `slice` is 'prefs', 'session', 'history', 'chat', or null when the whole
   * store was cleared. Everything held only in memory (the embedding, model
   * state, demo position, an unsaved conversation) is deliberately left alone:
   * it belongs to this tab.
   */
  function adoptExternalChange(slice) {
    if (slice === null || slice === undefined) {
      state.prefs = FB.storage.getPrefs();
      state.session = FB.storage.getSession() || null;
      state.history = FB.storage.getHistory();
      if (!state.prefs.saveChat) state.chat = { messages: [], turn: 0 };
      applyMotionPreference();
      notify('external');
      return;
    }

    if (slice === 'prefs') {
      state.prefs = FB.storage.getPrefs();
      applyMotionPreference();
      notify('external');
      return;
    }

    if (slice === 'session') {
      var stored = FB.storage.getSession();
      // A session written elsewhere has no embedding, and it does not need
      // one: the vector is only used during analysis, which has finished.
      state.session = (stored && stored.profile) ? stored : null;
      notify('external');
      return;
    }

    if (slice === 'history') {
      state.history = FB.storage.getHistory();
      notify('external');
      return;
    }

    if (slice === 'chat') {
      // Only adopt a conversation the user asked to have saved. When saving is
      // off, this tab's conversation is its own and stays in memory.
      if (!state.prefs.saveChat) return;
      var chat = FB.storage.getChat();
      state.chat = Array.isArray(chat)
        ? { messages: chat, turn: chat.filter(function (m) { return m.role === 'user'; }).length }
        : { messages: [], turn: 0 };
      notify('external');
    }
  }

  /** Start listening for other tabs. Called once, from the app bootstrap. */
  function watchOtherTabs() {
    if (!FB.storage.onExternalChange) return function () {};
    return FB.storage.onExternalChange(function (slice) {
      try {
        adoptExternalChange(slice);
      } catch (err) {
        if (window.console && console.error) console.error('Cross-tab sync failed:', err);
      }
    });
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
    replaceSession: replaceSession,
    hasSession: hasSession,
    clearSession: clearSession,
    liveSnapshot: liveSnapshot,
    adoptExternalChange: adoptExternalChange,
    watchOtherTabs: watchOtherTabs,
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
