/**
 * Shared interface pieces used by more than one view.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  /* ------------------------------------------------------------------ */
  /* Model status                                                        */
  /* ------------------------------------------------------------------ */

  var MODEL_COPY = {
    ready: { label: 'Local AI active', tone: 'ok' },
    loading: { label: 'Loading local AI', tone: 'busy' },
    idle: { label: 'Offline coaching mode', tone: 'muted' },
    disabled: { label: 'Offline coaching mode', tone: 'muted' },
    unavailable: { label: 'Offline coaching mode', tone: 'muted' }
  };

  /**
   * The small status indicator in the header. It says what mode the app is in
   * using plain words, and opens the detail panel for anyone who wants more.
   */
  function modelChip() {
    var modelState = FB.state.get().model;
    var copy = MODEL_COPY[modelState.status] || MODEL_COPY.idle;
    var label = copy.label;

    if (modelState.status === 'loading' && modelState.progress > 0) {
      label = 'Loading local AI ' + modelState.progress + '%';
    }

    return el('button', {
      class: 'model-chip model-chip--' + copy.tone,
      type: 'button',
      'aria-label': 'AI status: ' + label + '. Open details.',
      onclick: function () { openModelDialog(); }
    }, [
      el('span', { class: 'model-chip__dot', 'aria-hidden': 'true' }),
      el('span', { class: 'model-chip__label', text: label })
    ]);
  }

  function modelExplainer() {
    var modelState = FB.state.get().model;
    var prefs = FB.state.get().prefs;
    var nodes = [];

    if (modelState.status === 'ready') {
      nodes.push(el('p', {
        text: 'The on-device model is loaded. Free Bird is comparing what you write against its own reference phrases inside this browser tab. Your text is not sent anywhere.'
      }));
      nodes.push(el('dl', { class: 'kv' }, [
        el('dt', { text: 'Model' }), el('dd', { text: FB.model.MODEL_HUMAN_NAME }),
        el('dt', { text: 'Identifier' }), el('dd', { text: FB.model.MODEL_ID }),
        el('dt', { text: 'Runtime' }), el('dd', { text: modelState.library || 'Transformers.js' }),
        el('dt', { text: 'Load time' }), el('dd', { text: modelState.loadMs ? (modelState.loadMs / 1000).toFixed(1) + ' seconds' : 'not recorded' })
      ]));
    } else if (modelState.status === 'loading') {
      nodes.push(el('p', { text: 'The model is downloading in the background. You can keep using every part of the app while it does.' }));
      nodes.push(progressBar(modelState.progress));
    } else {
      nodes.push(el('p', {
        text: 'Free Bird is running in offline coaching mode. Every feature works: the analysis uses its rule engine instead of the model, and Wingman matches your messages by rules rather than by meaning.'
      }));
      if (modelState.status === 'unavailable' && modelState.error) {
        nodes.push(el('p', { class: 'meta', text: 'Last attempt: ' + modelState.error }));
      }
      if (prefs.allowModelDownload === false) {
        nodes.push(el('p', { class: 'meta', text: 'You have chosen not to download the model on this device.' }));
      }
    }

    return el('div', {}, nodes);
  }

  function modelActions(closeFn) {
    var modelState = FB.state.get().model;
    var actions = [];

    if (modelState.status === 'loading') {
      actions.push(el('button', {
        class: 'btn btn--secondary', type: 'button',
        onclick: function () { FB.model.cancel(); FB.dom.announce('Model loading cancelled. Offline coaching mode.'); }
      }, 'Cancel download'));
    } else if (modelState.status !== 'ready') {
      actions.push(el('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: function () {
          FB.state.setPref('allowModelDownload', true);
          FB.model.reset();
          FB.model.load();
        }
      }, modelState.status === 'unavailable' ? 'Try again' : 'Download and use local AI'));
    }

    if (modelState.status !== 'disabled' && modelState.status !== 'ready') {
      actions.push(el('button', {
        class: 'btn btn--text', type: 'button',
        onclick: function () {
          FB.state.setPref('allowModelDownload', false);
          FB.model.disable();
          FB.dom.announce('Local AI turned off. Offline coaching mode.');
        }
      }, 'Do not download it'));
    }

    if (modelState.status === 'ready') {
      actions.push(el('button', {
        class: 'btn btn--text', type: 'button',
        onclick: function () {
          FB.state.setPref('allowModelDownload', false);
          FB.model.disable();
          FB.pipeline.resetIntentCache();
          FB.dom.announce('Local AI turned off for this session.');
        }
      }, 'Turn it off for now'));
    }

    actions.push(el('button', { class: 'btn btn--secondary', type: 'button', onclick: closeFn }, 'Close'));
    return actions;
  }

  function openModelDialog() {
    openDialog({
      title: 'How the AI is running',
      body: function () { return modelExplainer(); },
      actions: modelActions,
      live: true
    });
  }

  function progressBar(value) {
    return el('div', {
      class: 'progressbar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(value || 0),
      'aria-label': 'Model download progress'
    }, [
      el('span', { class: 'progressbar__fill', style: 'width:' + Math.max(2, value || 0) + '%' })
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* Dialog                                                              */
  /* ------------------------------------------------------------------ */

  var openDialogs = [];

  /**
   * Accessible modal: labelled, focus trapped, escape to close, backdrop click
   * to close, focus returned to whatever opened it.
   */
  function openDialog(config) {
    var previouslyFocused = document.activeElement;
    var titleId = 'dlg-title-' + Date.now();

    var backdrop = el('div', { class: 'dialog-backdrop' });
    var panel = el('div', {
      class: 'dialog' + (config.wide ? ' dialog--wide' : ''),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId
    });

    function close() {
      document.removeEventListener('keydown', onKeydown, true);
      release();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      openDialogs = openDialogs.filter(function (d) { return d.panel !== panel; });
      if (!openDialogs.length) document.body.classList.remove('has-dialog');
      // The view underneath may have re-rendered while the dialog was open, in
      // which case the original trigger no longer exists and focus would fall
      // to the body. Send it somewhere sensible instead.
      if (previouslyFocused && previouslyFocused.isConnected && previouslyFocused.focus) {
        previouslyFocused.focus();
      } else {
        var main = document.getElementById('main');
        if (main && main.focus) main.focus();
      }
      if (config.onClose) config.onClose();
    }

    function onKeydown(event) {
      if (event.key === 'Escape' && openDialogs.length && openDialogs[openDialogs.length - 1].panel === panel) {
        event.stopPropagation();
        close();
      }
    }

    var header = el('div', { class: 'dialog__head' }, [
      el('h2', { id: titleId, class: 'dialog__title', text: config.title }),
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Close dialog', onclick: close
      }, FB.dom.icon('close', 16))
    ]);

    var bodyNode = el('div', { class: 'dialog__body' }, typeof config.body === 'function' ? config.body(close) : config.body);
    var footer = el('div', { class: 'dialog__actions' }, typeof config.actions === 'function' ? config.actions(close) : (config.actions || []));

    panel.appendChild(header);
    panel.appendChild(bodyNode);
    panel.appendChild(footer);
    backdrop.appendChild(panel);

    backdrop.addEventListener('mousedown', function (event) {
      if (event.target === backdrop) close();
    });

    document.body.appendChild(backdrop);
    document.body.classList.add('has-dialog');
    var release = FB.dom.trapFocus(panel);
    document.addEventListener('keydown', onKeydown, true);
    openDialogs.push({ panel: panel, close: close });

    var firstField = panel.querySelector('input, textarea, select, button.btn');
    (firstField || panel.querySelector('.icon-btn')).focus();

    // Some dialogs show live state, so they refresh themselves on store changes.
    if (config.live) {
      var unsubscribe = FB.state.subscribe(function () {
        if (!panel.isConnected) { unsubscribe(); return; }
        FB.dom.clear(bodyNode);
        bodyNode.appendChild(typeof config.body === 'function' ? config.body(close) : config.body);
        FB.dom.clear(footer);
        (typeof config.actions === 'function' ? config.actions(close) : (config.actions || []))
          .forEach(function (node) { footer.appendChild(node); });
      });
    }

    return { close: close, panel: panel };
  }

  function confirmDialog(config) {
    openDialog({
      title: config.title,
      body: el('div', {}, [
        el('p', { text: config.body }),
        config.detail ? el('p', { class: 'meta', text: config.detail }) : null
      ]),
      actions: function (close) {
        return [
          el('button', {
            class: 'btn btn--danger', type: 'button',
            onclick: function () { close(); config.onConfirm(); }
          }, config.confirmLabel || 'Confirm'),
          el('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, 'Cancel')
        ];
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Exercise runner                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Runs one exercise: steps, an optional timer, and a completion control.
   * The timer is opt-in because a countdown is not calming for everyone.
   */
  function openExercise(exercise, options) {
    options = options || {};
    var timerHandle = null;
    var remaining = exercise.durationSeconds;
    var running = false;
    var timeNode = null;
    var toggleBtn = null;

    function formatTime(seconds) {
      var m = Math.floor(seconds / 60);
      var s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function stopTimer() {
      if (timerHandle) window.clearInterval(timerHandle);
      timerHandle = null;
      running = false;
    }

    function tick() {
      remaining = Math.max(0, remaining - 1);
      if (timeNode) timeNode.textContent = formatTime(remaining);
      if (remaining === 0) {
        stopTimer();
        if (toggleBtn) toggleBtn.textContent = 'Start timer';
        FB.dom.announce('Timer finished for ' + exercise.title + '.');
      }
    }

    function buildBody() {
      timeNode = el('span', { class: 'timer__value', text: formatTime(remaining), 'aria-hidden': 'true' });

      toggleBtn = el('button', {
        class: 'btn btn--secondary btn--small', type: 'button',
        onclick: function () {
          if (running) {
            stopTimer();
            toggleBtn.textContent = 'Resume timer';
            FB.dom.announce('Timer paused.');
          } else {
            if (remaining === 0) remaining = exercise.durationSeconds;
            running = true;
            timerHandle = window.setInterval(tick, 1000);
            toggleBtn.textContent = 'Pause timer';
            FB.dom.announce('Timer started, ' + exercise.duration + '.');
          }
        }
      }, 'Start timer');

      return el('div', { class: 'exercise-run' }, [
        el('p', { class: 'exercise-run__why', text: exercise.why }),
        el('ol', { class: 'steps' }, exercise.steps.map(function (step) {
          return el('li', { text: step });
        })),
        el('div', { class: 'timer' }, [
          el('span', { class: 'timer__label', text: 'Optional timer' }),
          timeNode,
          el('span', { class: 'sr-only', 'aria-live': 'off', text: 'Suggested length ' + exercise.duration }),
          toggleBtn
        ]),
        el('p', { class: 'meta', text: 'Practice family: ' + exercise.evidenceNote }),
        el('p', { class: 'meta', text: 'Free Bird does not claim this will work for everyone. If it does not help, the plan can be swapped for a different step.' })
      ]);
    }

    openDialog({
      title: exercise.title + ' · ' + exercise.duration,
      wide: true,
      body: buildBody(),
      onClose: stopTimer,
      actions: function (close) {
        var buttons = [];
        if (options.onComplete) {
          buttons.push(el('button', {
            class: 'btn btn--primary', type: 'button',
            onclick: function () {
              stopTimer();
              close();
              options.onComplete();
            }
          }, options.completeLabel || 'Mark as done'));
        }
        buttons.push(el('button', {
          class: 'btn btn--secondary', type: 'button',
          onclick: function () { stopTimer(); close(); }
        }, options.onComplete ? 'Not now' : 'Close'));
        return buttons;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Display pieces                                                      */
  /* ------------------------------------------------------------------ */

  var BAND_WORD = {
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    'very high': 'Very high'
  };

  /**
   * Pressure display. The number, the band word, and the filled marks all carry
   * the same information, so nothing depends on colour alone.
   */
  function pressureMeter(pressure, options) {
    options = options || {};
    var marks = [];
    for (var i = 1; i <= 10; i++) {
      marks.push(el('span', {
        class: 'meter__mark' + (i <= pressure.value ? ' is-filled' : ''),
        'aria-hidden': 'true'
      }));
    }

    return el('div', { class: 'meter meter--' + pressure.band.replace(' ', '-') }, [
      el('div', { class: 'meter__top' }, [
        el('span', { class: 'meter__value' }, [
          el('strong', { text: String(pressure.value) }),
          el('span', { class: 'meter__scale', text: '/10' })
        ]),
        el('span', { class: 'meter__band', text: BAND_WORD[pressure.band] || pressure.band })
      ]),
      el('div', {
        class: 'meter__track',
        role: 'img',
        'aria-label': 'Pressure estimate ' + pressure.value + ' out of 10, described as ' + (BAND_WORD[pressure.band] || pressure.band)
      }, marks),
      options.caption ? el('p', { class: 'meta', text: options.caption }) : null
    ]);
  }

  /** A labelled bar for a signal score. The percentage is always written out. */
  function scoreBar(label, score, detail) {
    var pct = Math.round(score * 100);
    return el('div', { class: 'scorebar' }, [
      el('div', { class: 'scorebar__head' }, [
        el('span', { class: 'scorebar__label', text: label }),
        el('span', { class: 'scorebar__value', text: pct + '%' })
      ]),
      el('div', { class: 'scorebar__track', 'aria-hidden': 'true' }, [
        el('span', { class: 'scorebar__fill', style: 'width:' + Math.max(2, pct) + '%' })
      ]),
      detail ? el('p', { class: 'scorebar__detail', text: detail }) : null
    ]);
  }

  function sectionHeading(eyebrow, title, description) {
    return el('header', { class: 'section-head' }, [
      eyebrow ? el('p', { class: 'eyebrow', text: eyebrow }) : null,
      el('h1', { text: title }),
      description ? el('p', { class: 'lede', text: description }) : null
    ]);
  }

  function emptyState(title, body, actionLabel, actionHref) {
    return el('div', { class: 'empty' }, [
      el('h2', { text: title }),
      el('p', { text: body }),
      actionLabel ? el('a', { class: 'btn btn--secondary', href: actionHref }, actionLabel) : null
    ]);
  }

  /** The line that says where an analysis came from. Never optimistic. */
  function sourceNote(profile) {
    if (!profile) return null;
    var text = profile.source === 'on-device'
      ? 'Analysed on this device with ' + FB.model.MODEL_HUMAN_NAME + ' combined with Free Bird rule engine, in ' + profile.latencyMs + ' ms.'
      : 'Analysed with the Free Bird rule engine only. The on-device model was not loaded, so no model confidence is shown.';
    return el('p', { class: 'meta source-note' }, [
      FB.dom.icon(profile.source === 'on-device' ? 'wing' : 'dot', 14),
      el('span', { text: text })
    ]);
  }

  function toast(message) {
    var host = document.getElementById('toast-host');
    if (!host) return;
    var node = el('div', { class: 'toast', role: 'status' }, message);
    host.appendChild(node);
    window.setTimeout(function () {
      node.classList.add('is-leaving');
      window.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 300);
    }, 3200);
  }

  FB.components = {
    modelChip: modelChip,
    openModelDialog: openModelDialog,
    openDialog: openDialog,
    confirmDialog: confirmDialog,
    openExercise: openExercise,
    pressureMeter: pressureMeter,
    scoreBar: scoreBar,
    sectionHeading: sectionHeading,
    emptyState: emptyState,
    sourceNote: sourceNote,
    progressBar: progressBar,
    toast: toast,
    BAND_WORD: BAND_WORD
  };
})(window.FB = window.FB || {});
