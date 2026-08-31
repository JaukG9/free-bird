/**
 * Stress check form.
 *
 * One screen, one question, three optional fields. Validation messages are
 * written as sentences and are wired to the field with aria-describedby so a
 * screen reader hears them at the right moment.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  var TOPICS = [
    { id: 'school', label: 'School' },
    { id: 'college', label: 'College' },
    { id: 'friends', label: 'Friends' },
    { id: 'family', label: 'Family' },
    { id: 'activities', label: 'Activities' },
    { id: 'work', label: 'Work' },
    { id: 'health', label: 'Health' },
    { id: 'other', label: 'Other' }
  ];

  var TIMEFRAMES = [
    { id: 'today', label: 'Today' },
    { id: 'tomorrow', label: 'Tomorrow' },
    { id: 'this-week', label: 'This week' },
    { id: 'next-week', label: 'Next week' },
    { id: 'later', label: 'Later' },
    { id: 'none', label: 'No deadline' }
  ];

  var PRESSURE_WORDS = {
    1: 'Barely there',
    2: 'Noticeable',
    3: 'Heavy',
    4: 'Very heavy',
    5: 'About as much as it gets'
  };

  var PLACEHOLDER = 'I have three tests next week and I keep putting everything off because I don’t know where to start.';

  var draft = { text: '', topic: '', timeframe: '', pressure: 3 };

  function render(params) {
    var busy = false;

    var errorNode = el('p', { class: 'field-error', id: 'stressor-error', role: 'alert' });
    var counterNode = el('span', { class: 'counter', id: 'stressor-count', text: '0 characters' });

    var textarea = el('textarea', {
      id: 'stressor',
      class: 'textarea',
      rows: '7',
      placeholder: PLACEHOLDER,
      'aria-describedby': 'stressor-help stressor-count stressor-error',
      maxlength: String(FB.pipeline.HARD_MAX_CHARS),
      oninput: function () {
        draft.text = textarea.value;
        updateCounter();
        if (textarea.getAttribute('aria-invalid') === 'true') {
          clearError();
        }
      }
    });
    textarea.value = draft.text;

    function updateCounter() {
      var len = textarea.value.length;
      counterNode.textContent = len + ' character' + (len === 1 ? '' : 's');
      counterNode.classList.toggle('is-warn', len > FB.pipeline.MAX_CHARS);
      if (len > FB.pipeline.MAX_CHARS) {
        counterNode.textContent += ' · only the first ' + FB.pipeline.MAX_CHARS + ' are read';
      }
    }

    function showError(message) {
      errorNode.textContent = message;
      textarea.setAttribute('aria-invalid', 'true');
      textarea.classList.add('is-invalid');
      textarea.focus();
    }

    function clearError() {
      errorNode.textContent = '';
      textarea.removeAttribute('aria-invalid');
      textarea.classList.remove('is-invalid');
    }

    var pressureOut = el('output', {
      class: 'slider__out',
      for: 'pressure',
      id: 'pressure-out',
      text: draft.pressure + ' of 5 · ' + PRESSURE_WORDS[draft.pressure]
    });

    var slider = el('input', {
      type: 'range',
      id: 'pressure',
      class: 'slider',
      min: '1',
      max: '5',
      step: '1',
      value: String(draft.pressure),
      'aria-describedby': 'pressure-help',
      'aria-valuetext': draft.pressure + ' of 5, ' + PRESSURE_WORDS[draft.pressure],
      oninput: function () {
        draft.pressure = Number(slider.value);
        slider.setAttribute('aria-valuetext', draft.pressure + ' of 5, ' + PRESSURE_WORDS[draft.pressure]);
        pressureOut.textContent = draft.pressure + ' of 5 · ' + PRESSURE_WORDS[draft.pressure];
      }
    });

    var submitBtn = el('button', { class: 'btn btn--primary', type: 'submit' }, [
      el('span', { text: 'Analyse this' }),
      FB.dom.icon('arrow', 16)
    ]);

    var statusNode = el('p', { class: 'form-status', 'aria-live': 'polite' });

    var form = el('form', {
      class: 'stress-form',
      novalidate: true,
      onsubmit: function (event) {
        event.preventDefault();
        if (busy) return;

        var check = FB.pipeline.validate(textarea.value);
        if (!check.ok) {
          showError(check.message);
          FB.dom.announce(check.message, true);
          return;
        }
        clearError();
        if (check.code === 'truncate') {
          statusNode.textContent = check.message;
        }

        busy = true;
        submitBtn.disabled = true;
        submitBtn.classList.add('is-busy');
        submitBtn.textContent = 'Reading what you wrote';
        statusNode.textContent = FB.model.isReady()
          ? 'Running the on-device model.'
          : 'Running the rule engine.';

        var context = { topic: draft.topic, timeframe: draft.timeframe, pressure: draft.pressure };

        FB.pipeline.analyze(textarea.value, context)
          .then(function (profile) {
            if (profile.blocked) {
              FB.state.setSafetyBlock(profile.safety);
              FB.router.go('safety-support');
              return;
            }
            draft = { text: '', topic: '', timeframe: '', pressure: 3 };
            FB.state.setDemo({ active: false, stepIndex: -1 });
            FB.state.startSession(profile);
            FB.dom.announce('Analysis ready. Pressure estimate ' + profile.pressure.value + ' out of 10.');
            FB.router.go('snapshot');
          })
          .catch(function (err) {
            busy = false;
            submitBtn.disabled = false;
            submitBtn.classList.remove('is-busy');
            FB.dom.clear(submitBtn);
            submitBtn.appendChild(el('span', { text: 'Analyse this' }));
            submitBtn.appendChild(FB.dom.icon('arrow', 16));
            statusNode.textContent = '';
            showError('Something failed while analysing that. Your text has not gone anywhere. Try again, and if it keeps failing the offline rule engine will still work.');
            if (window.console && console.error) console.error(err);
          });
      }
    }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label field__label--lead', for: 'stressor', text: 'What’s been weighing on you?' }),
        el('p', { class: 'field__help', id: 'stressor-help', text: 'Write it the way you would say it out loud. A few sentences is enough. Nothing you type here leaves this device.' }),
        textarea,
        el('div', { class: 'field__foot' }, [counterNode, errorNode])
      ]),

      el('div', { class: 'optional-block' }, [
        el('p', { class: 'optional-block__title', text: 'Optional detail' }),
        el('p', { class: 'optional-block__note', text: 'These sharpen the plan. Skip any of them.' }),

        chipGroup('What is it about?', 'topic', TOPICS, function (value) { draft.topic = value; }),
        chipGroup('When is it happening?', 'timeframe', TIMEFRAMES, function (value) { draft.timeframe = value; }),

        el('div', { class: 'field field--slider' }, [
          el('label', { class: 'field__label', for: 'pressure', text: 'How much pressure does it feel like right now?' }),
          el('p', { class: 'field__help', id: 'pressure-help', text: '1 is barely there. 5 is about as much as it gets.' }),
          el('div', { class: 'slider__row' }, [
            el('span', { class: 'slider__end', 'aria-hidden': 'true', text: '1' }),
            slider,
            el('span', { class: 'slider__end', 'aria-hidden': 'true', text: '5' })
          ]),
          pressureOut
        ])
      ]),

      el('div', { class: 'form-actions' }, [
        submitBtn,
        el('button', {
          class: 'btn btn--secondary', type: 'button',
          onclick: function () { FB.demo.start(); }
        }, 'Use the demo situation'),
        statusNode
      ]),

      el('p', { class: 'form-disclaimer', text: 'Free Bird looks for patterns in language. It does not diagnose anything, and it is not a substitute for a counsellor, a doctor, or an adult you trust.' })
    ]);

    updateCounter();

    return el('div', { class: 'view view--stress' }, [
      FB.components.sectionHeading('Stress check', 'Describe the situation', 'One honest paragraph works better than a tidy one.'),
      form
    ]);
  }

  /**
   * Radio group rendered as chips. Real radio inputs underneath, so keyboard
   * and screen reader behaviour is the standard one rather than reinvented.
   */
  function chipGroup(legend, name, options, onChange) {
    var groupId = 'group-' + name;

    var chips = options.map(function (option) {
      var inputId = name + '-' + option.id;
      var input = el('input', {
        type: 'radio',
        class: 'chip__input',
        name: name,
        id: inputId,
        value: option.id,
        checked: draft[name] === option.id,
        onchange: function () { if (input.checked) onChange(option.id); }
      });
      return el('div', { class: 'chip' }, [
        input,
        el('label', { class: 'chip__label', for: inputId, text: option.label })
      ]);
    });

    // The visible word is "Clear", but two groups on one page need distinct
    // accessible names so they are not announced identically.
    var clearBtn = el('button', {
      class: 'btn btn--text btn--tiny', type: 'button',
      'aria-label': 'Clear the answer to: ' + legend,
      onclick: function () {
        FB.dom.qsa('input[name="' + name + '"]').forEach(function (input) { input.checked = false; });
        onChange('');
        FB.dom.announce(legend + ' cleared.');
      }
    }, 'Clear');

    return el('fieldset', { class: 'field field--chips', id: groupId }, [
      el('legend', { class: 'field__label', text: legend }),
      el('div', { class: 'chips' }, chips),
      clearBtn
    ]);
  }

  FB.views = FB.views || {};
  FB.views.stressTest = { title: 'Stress check', render: render };
})(window.FB = window.FB || {});
