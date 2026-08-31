/**
 * Demo mode.
 *
 * Built for a five minute walkthrough: one button starts it, one button moves
 * to the next beat, and every beat uses the real pipeline rather than a
 * screenshot. The analysis runs with the semantic scorer forced off so the
 * result is identical on every machine and no download is needed before the
 * presentation can begin. "Use live AI" then reruns the same text through the
 * on-device model so the two paths can be compared in front of an audience.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;
  var host = null;

  function steps() {
    return FB.demoData.SCRIPT;
  }

  function currentIndex() {
    return FB.state.get().demo.stepIndex;
  }

  /* ------------------------------------------------------------------ */
  /* Start and advance                                                   */
  /* ------------------------------------------------------------------ */

  function start() {
    var scenario = FB.demoData.SCENARIO;

    // forceLexical keeps the demo deterministic and instant.
    FB.pipeline.analyze(scenario.text, scenario.context, { forceLexical: true })
      .then(function (profile) {
        FB.state.seedDemoHistory();
        FB.state.startSession(profile, { demo: true });
        FB.state.setDemo({ active: true, stepIndex: 1, usedLiveAi: false });
        FB.router.go('snapshot');
        FB.dom.announce('Demo started. Stress snapshot ready.');
        renderBar();
      })
      .catch(function (err) {
        FB.components.toast('The demo could not start. Try reloading the page.');
        if (window.console && console.error) console.error(err);
      });
  }

  function exit() {
    FB.state.setDemo({ active: false, stepIndex: -1, usedLiveAi: false });
    renderBar();
    FB.dom.announce('Demo mode ended. Your demo session is still here until you reset it.');
  }

  function goToStep(index) {
    var list = steps();
    var clamped = Math.max(0, Math.min(list.length - 1, index));
    FB.state.setDemo({ stepIndex: clamped });
    var step = list[clamped];

    if (step.id === 'exercise') {
      FB.router.go('plan');
      window.setTimeout(runCalmExercise, 120);
    } else if (step.id === 'wingman') {
      FB.router.go('wingman');
      window.setTimeout(runConversation, 200);
    } else if (step.id === 'checkin') {
      FB.router.go('plan');
      window.setTimeout(runCheckin, 120);
    } else {
      FB.router.go(step.route);
    }
    renderBar();
  }

  function next() {
    goToStep(currentIndex() + 1);
  }

  /* ------------------------------------------------------------------ */
  /* Scripted beats                                                      */
  /* ------------------------------------------------------------------ */

  /** Completes the Calm step, and opens it first so the audience sees it. */
  function runCalmExercise() {
    var session = FB.state.get().session;
    if (!session) return;
    var step = session.plan.steps[0];
    if (step.done) {
      FB.components.toast('Calm step is already done.');
      return;
    }
    var exercise = FB.exercises.get(step.exerciseId);
    FB.components.openExercise(exercise, {
      completeLabel: 'Mark Calm as done',
      onComplete: function () {
        FB.state.completeStep('calm');
        FB.state.completeStep('clarify');
        FB.state.completeStep('act');
        FB.components.toast('All three steps marked as done for the demo.');
        FB.dom.announce('Plan steps completed.');
      }
    });
  }

  /**
   * Mark any outstanding plan steps as done.
   *
   * A presenter who clicks straight through Next without opening the exercise
   * dialog would otherwise reach the check-in with a plan showing 0 of 3 done,
   * which reads as a broken app on stage. Later beats call this so the demo
   * state stays coherent however it is driven.
   */
  function ensurePlanComplete() {
    var session = FB.state.get().session;
    if (!session) return;
    session.plan.steps.forEach(function (step) {
      if (!step.done) FB.state.completeStep(step.stage);
    });
  }

  /** Sends the scripted messages through the real responder, one at a time. */
  function runConversation() {
    ensurePlanComplete();
    var messages = FB.demoData.CONVERSATION;
    var chat = FB.state.get().chat;

    // If the demo conversation has already run, do not duplicate it.
    var alreadySent = chat.messages.filter(function (m) { return m.role === 'user'; }).length;
    if (alreadySent >= messages.length) return;

    var reduced = FB.state.get().prefs.reducedMotion;
    var gap = reduced ? 120 : 900;

    function sendAt(index) {
      if (index >= messages.length) return;
      var text = messages[index];

      FB.state.addChatMessage({ role: 'user', text: text, at: Date.now() });
      var turn = FB.state.get().chat.turn;

      FB.pipeline.respond(text, FB.wingmanContext.build(), turn).then(function (reply) {
        if (reply.blocked) return;
        FB.state.addChatMessage({
          role: 'wingman',
          text: reply.text,
          at: Date.now(),
          method: reply.method,
          intent: reply.intent,
          confidence: reply.confidence
        });
        window.setTimeout(function () { sendAt(index + 1); }, gap);
      });
    }

    sendAt(alreadySent);
  }

  function runCheckin() {
    ensurePlanComplete();
    var session = FB.state.get().session;
    if (!session || session.checkin) return;
    var demoCheckin = FB.demoData.CHECKIN;
    FB.state.recordCheckin(demoCheckin.change, demoCheckin.note, demoCheckin.after);
    FB.dom.announce('Demo check-in recorded.');
  }

  /* ------------------------------------------------------------------ */
  /* Live AI switch                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Re-run the same demo text through the on-device model, keeping the plan
   * state that has already been demonstrated. This is where an audience sees
   * the difference between the rule engine and the blended result.
   */
  function useLiveAi() {
    var session = FB.state.get().session;
    if (!session) return;

    function rerun() {
      var scenario = FB.demoData.SCENARIO;
      FB.components.toast('Re-running the same text with the on-device model.');
      return FB.pipeline.analyze(scenario.text, scenario.context).then(function (profile) {
        if (profile.blocked) return;
        // replaceSession carries over the steps already demonstrated, the
        // exercise log, the check-in and the conversation, and persists and
        // notifies once, so every screen picks up the new analysis together.
        FB.state.replaceSession(profile, { demo: true });
        FB.state.setDemo({ usedLiveAi: true });
        FB.dom.announce('Re-analysed with the on-device model.');
      });
    }

    if (FB.model.semanticReady()) {
      rerun();
      return;
    }

    FB.state.setPref('allowModelDownload', true);
    FB.model.reset();
    FB.components.toast('Downloading the model. The demo keeps working while it loads.');
    FB.model.load().then(function () {
      if (FB.model.semanticReady()) {
        rerun();
      } else {
        FB.components.toast('The model could not load. Staying in offline coaching mode.');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* The demo bar                                                        */
  /* ------------------------------------------------------------------ */

  function renderBar() {
    if (!host) host = document.getElementById('demo-bar');
    if (!host) return;

    var demo = FB.state.get().demo;
    FB.dom.clear(host);
    host.hidden = !demo.active;
    if (!demo.active) return;

    var list = steps();
    var index = Math.max(0, demo.stepIndex);
    var step = list[index];
    var isLast = index >= list.length - 1;

    host.appendChild(el('div', { class: 'demo-bar__inner' }, [
      el('div', { class: 'demo-bar__label' }, [
        el('span', { class: 'demo-bar__tag', text: 'Demo' }),
        el('span', { class: 'demo-bar__step', text: (index + 1) + ' of ' + list.length + ' · ' + step.label }),
        el('span', { class: 'demo-bar__detail', text: step.detail })
      ]),
      el('div', { class: 'demo-bar__actions' }, [
        el('button', {
          class: 'btn btn--text btn--small', type: 'button', disabled: index === 0,
          onclick: function () { goToStep(index - 1); }
        }, 'Back'),
        isLast
          ? el('button', { class: 'btn btn--secondary btn--small', type: 'button', onclick: exit }, 'Finish demo')
          : el('button', { class: 'btn btn--primary btn--small', type: 'button', onclick: next }, [
              el('span', { text: 'Next' }), FB.dom.icon('chevron', 14)
            ]),
        demo.usedLiveAi
          ? el('span', { class: 'demo-bar__note', text: 'Live on-device AI in use' })
          : el('button', {
              class: 'btn btn--text btn--small', type: 'button',
              onclick: useLiveAi
            }, 'Use live AI'),
        el('button', { class: 'btn btn--text btn--small', type: 'button', onclick: exit }, 'Exit')
      ])
    ]));
  }

  function init() {
    host = document.getElementById('demo-bar');
    FB.state.subscribe(function (state, reason) {
      if (reason === 'demo' || reason === 'cleared') renderBar();
    });
    renderBar();
  }

  FB.demo = {
    start: start,
    exit: exit,
    next: next,
    goToStep: goToStep,
    useLiveAi: useLiveAi,
    renderBar: renderBar,
    init: init
  };
})(window.FB = window.FB || {});
