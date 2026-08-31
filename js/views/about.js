/**
 * Safety and about. Also holds settings, because on a tool this size a
 * separate settings page would be one click of ceremony for four controls.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    return el('div', { class: 'view view--about' }, [
      FB.components.sectionHeading('Safety and about', 'What Free Bird is, and what it is not', 'Worth reading once, especially the first two sections.'),
      safetyBlock(),
      aboutBlock(),
      aiBlock(),
      privacyBlock(),
      limitsBlock(),
      settingsBlock(),
      libraryBlock(),
      creditsBlock()
    ]);
  }

  function safetyBlock() {
    return el('section', { class: 'panel panel--safety', id: 'safety' }, [
      el('h3', { class: 'panel__title', text: 'If you need real support right now' }),
      el('p', { class: 'panel__lede', text: 'You deserve real support right now. Free Bird cannot keep you safe in an emergency. Consider contacting a trusted adult, a school counsellor, emergency services, or a crisis resource.' }),
      el('ul', { class: 'resource-list' }, FB.safety.RESOURCES.map(resourceItem)),
      el('p', { class: 'meta', text: 'This list is not exhaustive and is focused on the United States. Free Bird cannot contact anyone on your behalf.' })
    ]);
  }

  function resourceItem(resource) {
    return el('li', { class: 'resource' }, [
      el('div', {}, [
        el('p', { class: 'resource__name', text: resource.name }),
        el('p', { class: 'resource__detail', text: resource.detail })
      ]),
      resource.href
        ? el('a', {
            class: 'btn btn--secondary btn--small',
            href: resource.href,
            rel: resource.href.indexOf('http') === 0 ? 'noopener noreferrer' : null,
            target: resource.href.indexOf('http') === 0 ? '_blank' : null
          }, resource.hrefLabel)
        : null
    ]);
  }

  function aboutBlock() {
    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: 'About Free Bird' }),
      el('p', { text: 'Free Bird is a student wellness tool designed to help with everyday stress. It uses on-device AI to look for patterns in what you describe and turn them into a practical plan. It is not a therapist, diagnosis tool, or emergency service.' }),
      el('p', { text: 'It works best on the ordinary things: a week with too much in it, an application you cannot start, a friendship that has gone quiet, a test that has taken over your evenings. It is not built for, and should not be used for, anything that needs a clinician.' })
    ]);
  }

  function aiBlock() {
    var modelState = FB.state.get().model;

    return el('section', { class: 'panel', id: 'ai' }, [
      el('h3', { class: 'panel__title', text: 'On-device AI' }),
      el('p', { text: 'Free Bird is designed to run its language analysis in your browser rather than sending your reflections to a remote AI service.' }),
      el('p', { text: 'When you turn it on, the app downloads a small sentence-embedding model once and runs it locally with WebAssembly. It compares what you wrote against reference phrases for each stress signal. The only network requests Free Bird makes are for that model file and the library that runs it. Your writing is never part of a request.' }),
      el('p', { text: 'Free Bird does not ship a generative language model. Wingman replies are composed from a written template set using your session context, and the model, when it is loaded, decides which reply strategy fits your message. The interface labels every reply with which matcher chose it.' }),
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Current mode' }),
        el('dd', { text: modelState.status === 'ready' ? 'Local AI active' : (modelState.status === 'loading' ? 'Loading local AI' : 'Offline coaching mode') }),
        el('dt', { text: 'Model' }),
        el('dd', { text: FB.model.MODEL_ID }),
        el('dt', { text: 'Runtime' }),
        el('dd', { text: modelState.library || 'Transformers.js, loaded on demand' })
      ]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn--secondary btn--small', type: 'button',
          onclick: function () { FB.components.openModelDialog(); }
        }, 'Model status and controls')
      ]),
      el('p', { class: 'meta', text: 'Everything in the app works without the model. In offline coaching mode the analysis uses the rule engine and no model confidence is shown anywhere.' })
    ]);
  }

  function privacyBlock() {
    var state = FB.state.get();
    var keys = FB.storage.listKeys();
    var bytes = FB.storage.approximateBytes();

    return el('section', { class: 'panel', id: 'privacy' }, [
      el('h3', { class: 'panel__title', text: 'Your data' }),
      el('p', { text: 'Free Bird is designed to keep your reflections on your device. The app does not require an account or a backend server.' }),
      el('ul', { class: 'plain-list' }, [
        el('li', { text: 'What you write is analysed in this page and stored in this browser, under keys beginning with ' + FB.storage.PREFIX + '.' }),
        el('li', { text: 'Your Wingman conversation is held in memory only, unless you switch on saving it.' }),
        el('li', { text: 'Progress entries store a short summary and your own before and after numbers, not the text you wrote.' }),
        el('li', { text: 'There are no analytics, no trackers, no advertising, and no third-party API calls carrying your text.' })
      ]),
      !state.storageWorking
        ? el('p', { class: 'notice', text: 'This browser is not allowing local storage, so nothing will be kept after you close the tab. Everything else still works.' })
        : null,
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Stored items' }),
        el('dd', { text: String(keys.length) }),
        el('dt', { text: 'Approximate size' }),
        el('dd', { text: bytes < 1024 ? bytes + ' bytes' : (bytes / 1024).toFixed(1) + ' KB' })
      ])
    ]);
  }

  function limitsBlock() {
    return el('section', { class: 'panel', id: 'limits' }, [
      el('h3', { class: 'panel__title', text: 'Limitations worth knowing' }),
      el('ul', { class: 'plain-list' }, [
        el('li', { text: 'Free Bird reads wording. It can misread sarcasm, negation, slang it does not know, and anything written in another language.' }),
        el('li', { text: 'The pressure number is an arithmetic summary of your own rating and the language you used. It is not a measurement of you.' }),
        el('li', { text: 'The safety scan matches specific words and phrases. It will miss crisis expressed indirectly, and it will sometimes fire when there is no crisis.' }),
        el('li', { text: 'Signals describe language patterns and are not diagnoses. Free Bird never claims to detect a condition.' }),
        el('li', { text: 'The exercises come from common stress-management practice. Free Bird does not claim any of them is clinically proven for you.' }),
        el('li', { text: 'Self-reported change is exactly that. It is not evidence that the app works.' })
      ])
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  function settingsBlock() {
    var state = FB.state.get();
    var prefs = state.prefs;
    var demoCount = state.history.filter(function (h) { return h.demo; }).length;

    return el('section', { class: 'panel', id: 'settings' }, [
      el('h3', { class: 'panel__title', text: 'Settings' }),

      toggleRow('reduced-motion', 'Reduce motion', 'Removes transitions and the short pause before Wingman replies.', prefs.reducedMotion, function (checked) {
        FB.state.setPref('reducedMotion', checked);
        FB.components.toast(checked ? 'Motion reduced.' : 'Motion restored.');
      }),

      toggleRow('save-chat-setting', 'Save Wingman conversations', 'Off by default. When off, conversations are gone when the tab closes.', prefs.saveChat, function (checked) {
        FB.state.setPref('saveChat', checked);
      }),

      toggleRow('allow-model', 'Allow the on-device model to download', 'About 25 MB, once, from a public model CDN. Your text is never part of that request.', prefs.allowModelDownload === true, function (checked) {
        FB.state.setPref('allowModelDownload', checked);
        if (checked) {
          FB.model.reset();
          FB.model.load();
        } else {
          FB.model.disable();
          FB.pipeline.resetIntentCache();
        }
      }),

      el('div', { class: 'setting-row' }, [
        el('div', {}, [
          el('p', { class: 'setting-row__label', text: 'Demo mode' }),
          el('p', { class: 'setting-row__help', text: demoCount
            ? 'There are ' + demoCount + ' sample entries in your progress. Resetting removes them and the demo session.'
            : 'No demo data is currently stored.' })
        ]),
        el('div', { class: 'row row--tight' }, [
          el('button', {
            class: 'btn btn--secondary btn--small', type: 'button',
            onclick: function () { FB.demo.start(); }
          }, 'Run the demo'),
          el('button', {
            class: 'btn btn--text btn--small', type: 'button', disabled: !demoCount && !(state.session && state.session.demo),
            onclick: function () {
              FB.state.clearDemoData();
              FB.components.toast('Demo data reset.');
            }
          }, 'Reset demo data')
        ])
      ]),

      el('div', { class: 'setting-row setting-row--danger' }, [
        el('div', {}, [
          el('p', { class: 'setting-row__label', text: 'Clear all local data' }),
          el('p', { class: 'setting-row__help', text: 'Deletes every Free Bird entry in this browser. Nothing is kept anywhere else, so this cannot be undone.' })
        ]),
        el('button', {
          class: 'btn btn--danger btn--small', type: 'button',
          onclick: function () {
            FB.components.confirmDialog({
              title: 'Clear all local data?',
              body: 'Preferences, your current session, your plan, your check-ins, and your history will be deleted from this browser.',
              detail: 'There is no copy on a server, so this cannot be undone.',
              confirmLabel: 'Delete everything',
              onConfirm: function () {
                var removed = FB.state.clearAllData();
                FB.components.toast('Cleared ' + removed + ' stored item' + (removed === 1 ? '' : 's') + '.');
                FB.dom.announce('All local Free Bird data cleared.');
                FB.router.go('home');
              }
            });
          }
        }, 'Clear all local data')
      ])
    ]);
  }

  function toggleRow(id, label, help, checked, onChange) {
    var input = el('input', {
      type: 'checkbox', id: id, class: 'switch__input', checked: checked,
      onchange: function () { onChange(input.checked); }
    });

    return el('div', { class: 'setting-row' }, [
      el('div', {}, [
        el('label', { class: 'setting-row__label', for: id, text: label }),
        el('p', { class: 'setting-row__help', text: help })
      ]),
      el('div', { class: 'switch' }, input)
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* Library and credits                                                 */
  /* ------------------------------------------------------------------ */

  function libraryBlock() {
    return el('section', { class: 'panel', id: 'library' }, [
      el('h3', { class: 'panel__title', text: 'Exercise library' }),
      el('p', { text: 'Every plan is built from these ' + FB.exercises.all.length + ' exercises. You can open any of them without running a stress check.' }),
      el('div', { class: 'library' }, FB.exercises.categories.map(function (category) {
        var items = FB.exercises.byCategory(category);
        return el('div', { class: 'library__group' }, [
          el('h4', { class: 'library__title', text: category }),
          el('p', { class: 'library__blurb', text: FB.exercises.categoryBlurb[category] }),
          el('ul', { class: 'library__list' }, items.map(function (exercise) {
            return el('li', {}, el('button', {
              class: 'library__item', type: 'button',
              onclick: function () { FB.components.openExercise(exercise, {}); }
            }, [
              el('span', { class: 'library__item-title', text: exercise.title }),
              el('span', { class: 'library__item-meta', text: exercise.duration })
            ]));
          }))
        ]);
      }))
    ]);
  }

  function creditsBlock() {
    return el('section', { class: 'panel panel--quiet' }, [
      el('h3', { class: 'panel__title', text: 'Credits' }),
      el('p', { text: 'Built with plain HTML, CSS and JavaScript, with no build step and no backend.' }),
      el('ul', { class: 'plain-list' }, [
        el('li', { text: 'Transformers.js by Hugging Face, loaded from a public CDN, runs the model in the browser.' }),
        el('li', { text: 'all-MiniLM-L6-v2, originally from the Sentence-Transformers project, converted for browser use by Xenova.' }),
        el('li', { text: 'Exercise content is written for this project and draws on widely taught stress-management practice. Sources are listed in the README.' })
      ]),
      el('p', { class: 'meta', text: 'Free Bird is a student project. It is not a medical device and has not been clinically evaluated.' })
    ]);
  }

  FB.views = FB.views || {};
  FB.views.about = { title: 'Safety and about', render: render };
})(window.FB = window.FB || {});
