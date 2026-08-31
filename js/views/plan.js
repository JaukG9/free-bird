/**
 * My Plan: the Calm, Clarify, Act sequence, plus the check-in once the work
 * has been done.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    var session = FB.state.get().session;
    if (!session) {
      return el('div', { class: 'view view--plan' }, [
        FB.components.sectionHeading('My plan', 'Nothing to work on yet', null),
        FB.components.emptyState(
          'No plan yet',
          'A plan is built from a stress check, so it stays specific to the situation you described.',
          'Start a stress check',
          '#/stress-test'
        )
      ]);
    }

    var profile = session.profile;
    var plan = session.plan;
    var doneCount = plan.steps.filter(function (s) { return s.done; }).length;
    var allDone = doneCount === plan.steps.length;

    return el('div', { class: 'view view--plan' }, [
      el('header', { class: 'plan-head' }, [
        el('p', { class: 'eyebrow', text: 'Your plan · built ' + FB.dom.formatDate(plan.createdAt) }),
        el('h1', { text: plan.headline }),
        el('p', { class: 'lede', text: FB.recommendations.firstStepRead(profile) }),
        el('div', { class: 'plan-progress' }, [
          el('span', {
            class: 'plan-progress__label',
            text: doneCount + ' of ' + plan.steps.length + ' steps done'
          }),
          el('div', { class: 'plan-progress__track', 'aria-hidden': 'true' }, [
            el('span', { class: 'plan-progress__fill', style: 'width:' + ((doneCount / plan.steps.length) * 100) + '%' })
          ])
        ])
      ]),

      el('ol', { class: 'plan-steps' }, plan.steps.map(function (step, index) {
        return stepCard(step, index, profile);
      })),

      allDone ? checkinSection(session) : nextNudge(plan),

      el('div', { class: 'plan-footer' }, [
        el('a', { class: 'btn btn--secondary', href: '#/wingman' }, 'Talk to Wingman about this'),
        el('button', {
          class: 'btn btn--text', type: 'button',
          onclick: function () {
            FB.components.confirmDialog({
              title: 'Restart this plan?',
              body: 'The three steps will be rebuilt from the same analysis and marked as not done. Your stress check and your history stay as they are.',
              confirmLabel: 'Restart plan',
              onConfirm: function () {
                FB.state.restartPlan();
                FB.components.toast('Plan restarted.');
                FB.dom.announce('Plan restarted.');
              }
            });
          }
        }, 'Restart plan'),
        el('a', { class: 'btn btn--text', href: '#/stress-test' }, 'New stress check')
      ])
    ]);
  }

  function stepCard(step, index, profile) {
    var exercise = FB.exercises.get(step.exerciseId);
    if (!exercise) return el('li', { text: 'Missing exercise.' });

    var stepId = 'step-' + step.stage;

    return el('li', {
      class: 'plan-step' + (step.done ? ' is-done' : ''),
      'aria-labelledby': stepId + '-title'
    }, [
      el('div', { class: 'plan-step__marker' }, [
        el('span', { class: 'plan-step__stage', text: step.label }),
        step.done
          ? el('span', { class: 'plan-step__tick' }, [FB.dom.icon('check', 14), el('span', { class: 'sr-only', text: 'Completed' })])
          : el('span', { class: 'plan-step__num', 'aria-hidden': 'true', text: String(index + 1) })
      ]),

      el('div', { class: 'plan-step__body' }, [
        el('h3', { id: stepId + '-title', class: 'plan-step__title' }, [
          el('span', { text: exercise.title }),
          el('span', { class: 'plan-step__duration', text: exercise.duration })
        ]),
        el('p', { class: 'plan-step__rationale', text: step.rationale }),
        el('p', { class: 'plan-step__summary', text: exercise.summary }),

        el('div', { class: 'plan-step__actions' }, [
          el('button', {
            class: step.done ? 'btn btn--secondary btn--small' : 'btn btn--primary btn--small',
            type: 'button',
            onclick: function () {
              FB.components.openExercise(exercise, {
                onComplete: step.done ? null : function () {
                  FB.state.completeStep(step.stage);
                  FB.components.toast(exercise.title + ' marked as done.');
                  FB.dom.announce(step.label + ' step complete.');
                },
                completeLabel: 'Mark ' + step.label + ' as done'
              });
            }
          }, step.done ? 'Do it again' : 'Start'),

          step.done
            ? el('button', {
                class: 'btn btn--text btn--small', type: 'button',
                onclick: function () {
                  FB.state.uncompleteStep(step.stage);
                  FB.dom.announce(step.label + ' step marked as not done.');
                }
              }, 'Mark as not done')
            : el('button', {
                class: 'btn btn--text btn--small', type: 'button',
                onclick: function () { openSwap(step, profile); }
              }, 'Swap this step')
        ])
      ])
    ]);
  }

  /** Let the user choose a different exercise for the same stage. */
  function openSwap(step, profile) {
    var alternatives = FB.recommendations.alternativesForStage(step.stage, profile, step.exerciseId);
    // Assigned below; the handlers that use it only run after openDialog returns.
    var handle = null;

    handle = FB.components.openDialog({
      title: 'Another ' + step.label.toLowerCase() + ' step',
      wide: true,
      body: el('div', {}, [
        el('p', { text: 'These are the next best matches for the same profile. Picking one replaces the current step.' }),
        el('ul', { class: 'swap-list' }, alternatives.map(function (exercise) {
          return el('li', { class: 'swap-item' }, [
            el('div', {}, [
              el('h4', { class: 'swap-item__title', text: exercise.title }),
              el('p', { class: 'swap-item__meta', text: exercise.category + ' · ' + exercise.duration }),
              el('p', { text: exercise.summary })
            ]),
            el('button', {
              class: 'btn btn--secondary btn--small', type: 'button',
              onclick: function () {
                FB.state.swapStep(step.stage, exercise.id);
                FB.components.toast(step.label + ' step is now ' + exercise.title + '.');
                FB.dom.announce(step.label + ' step changed to ' + exercise.title + '.');
                if (handle) handle.close();
              }
            }, 'Use this')
          ]);
        }))
      ]),
      actions: function (close) {
        return [el('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, 'Keep the current one')];
      }
    });
  }

  function nextNudge(plan) {
    var next = plan.steps.filter(function (s) { return !s.done; })[0];
    var exercise = FB.exercises.get(next.exerciseId);
    return el('aside', { class: 'nudge' }, [
      el('p', { class: 'eyebrow', text: 'Next' }),
      el('p', { text: 'Your ' + next.label.toLowerCase() + ' step is ' + exercise.title + ', about ' + exercise.duration + '. The check-in opens once all three are done.' })
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* Check-in                                                            */
  /* ------------------------------------------------------------------ */

  function checkinSection(session) {
    if (session.checkin) return checkinSummary(session);

    var selected = null;
    var noteField = el('textarea', {
      id: 'checkin-note',
      class: 'textarea textarea--small',
      rows: '3',
      maxlength: '300',
      placeholder: 'Optional. One line is plenty.'
    });

    var errorNode = el('p', { class: 'field-error', id: 'checkin-error', role: 'alert' });

    var radios = FB.state.CHANGE_OPTIONS.map(function (option) {
      var id = 'change-' + option.id;
      var input = el('input', {
        type: 'radio', name: 'change', id: id, value: option.id, class: 'chip__input',
        onchange: function () {
          if (input.checked) {
            selected = option.id;
            errorNode.textContent = '';
          }
        }
      });
      return el('div', { class: 'chip chip--wide' }, [
        input,
        el('label', { class: 'chip__label', for: id, text: option.label })
      ]);
    });

    return el('section', { class: 'panel panel--checkin' }, [
      el('h3', { class: 'panel__title', text: 'Did that help?' }),
      el('p', { text: 'All three steps are done. This is the part that turns the plan into something you can look back at.' }),

      el('form', {
        class: 'checkin-form',
        novalidate: true,
        onsubmit: function (event) {
          event.preventDefault();
          if (!selected) {
            errorNode.textContent = 'Pick one of the five options so there is something to record.';
            FB.dom.announce('Pick one of the five options.', true);
            return;
          }
          var checkin = FB.state.recordCheckin(selected, noteField.value);
          if (checkin) {
            FB.components.toast('Check-in saved on this device.');
            FB.dom.announce('Check-in saved. Self-reported change recorded.');
          }
        }
      }, [
        el('fieldset', { class: 'field field--chips' }, [
          el('legend', { class: 'field__label', text: 'Compared with before you started' }),
          el('div', { class: 'chips chips--scale' }, radios),
          errorNode
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'checkin-note', text: 'What feels different now?' }),
          noteField
        ]),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--primary', type: 'submit' }, 'Save check-in'),
          el('span', { class: 'meta', text: 'Stored in this browser only.' })
        ])
      ])
    ]);
  }

  function checkinSummary(session) {
    var checkin = session.checkin;
    var delta = checkin.before - checkin.after;
    var direction = delta > 0 ? 'lower' : (delta < 0 ? 'higher' : 'unchanged');

    return el('section', { class: 'panel panel--checkin is-done' }, [
      el('h3', { class: 'panel__title', text: 'Your self-reported change' }),
      el('div', { class: 'checkin-result' }, [
        el('div', { class: 'checkin-result__pair' }, [
          el('span', { class: 'checkin-result__num', text: String(checkin.before) }),
          el('span', { class: 'checkin-result__arrow', 'aria-hidden': 'true' }, FB.dom.icon('arrow', 18)),
          el('span', { class: 'checkin-result__num', text: String(checkin.after) }),
          el('span', { class: 'sr-only', text: 'Pressure went from ' + checkin.before + ' to ' + checkin.after + ' out of 10.' })
        ]),
        el('p', { class: 'checkin-result__label', text: checkin.changeLabel + ' · ' + Math.abs(delta) + ' point' + (Math.abs(delta) === 1 ? '' : 's') + ' ' + direction })
      ]),
      checkin.note ? el('blockquote', { class: 'quoted' }, el('p', { text: checkin.note })) : null,
      el('p', { class: 'meta', text: checkin.afterDerived
        ? 'The second number is derived from the option you picked, not a separate rating. This is what you reported, not a clinical outcome.'
        : 'This is what you reported, not a clinical outcome.' }),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn btn--secondary', href: '#/progress' }, 'See your progress'),
        el('a', { class: 'btn btn--text', href: '#/stress-test' }, 'Start a new check')
      ])
    ]);
  }

  FB.views = FB.views || {};
  FB.views.plan = { title: 'My plan', render: render };
})(window.FB = window.FB || {});
