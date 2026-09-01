/**
 * Progress.
 *
 * A short timeline of self-reported change, drawn from local data with inline
 * SVG. Deliberately not an analytics dashboard: four small facts, one chart,
 * one list, and a clear way to delete everything.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    var state = FB.state.get();
    var history = state.history.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
    // The session that is open right now, before any check-in has been
    // recorded. Without this, running a stress check and doing the exercises
    // left this page insisting nothing had happened.
    var live = FB.state.liveSnapshot();

    if (!history.length && !live) {
      return el('div', { class: 'view view--progress' }, [
        FB.components.sectionHeading('Progress', 'Nothing recorded yet', 'A check-in after a plan is what fills this page. Nothing is recorded automatically.'),
        FB.components.emptyState(
          'No check-ins',
          'Finish the three steps of a plan and record how it went. Free Bird stores a short summary in this browser, never the text you wrote.',
          'Start a stress check',
          '#/stress-test'
        ),
        el('div', { class: 'row' }, [
          el('button', {
            class: 'btn btn--secondary btn--small', type: 'button',
            onclick: function () { FB.demo.start(); }
          }, 'Try a demo instead')
        ])
      ]);
    }

    if (!history.length) {
      return el('div', { class: 'view view--progress' }, [
        FB.components.sectionHeading('Progress', 'One in progress', 'This page fills up once you record a check-in. Here is where the current one has got to.'),
        livePanel(live),
        dataControls(history)
      ]);
    }

    return el('div', { class: 'view view--progress' }, [
      FB.components.sectionHeading('Progress', 'What you have recorded', 'All of this is your own reporting, stored in this browser. None of it is a clinical measure.'),
      live ? livePanel(live) : null,
      summaryRow(history, live),
      chartPanel(history),
      categoryPanel(history),
      timelinePanel(history),
      dataControls(history)
    ]);
  }

  /**
   * The stress check that is open right now.
   *
   * It is shown separately from the timeline, and labelled as not recorded,
   * because nothing goes into history until the user chooses to check in. This
   * page should still tell the truth about what is happening in the meantime.
   */
  function livePanel(live) {
    var pct = live.stepsTotal ? (live.stepsDone / live.stepsTotal) * 100 : 0;

    var status;
    if (live.awaitingCheckin) {
      status = 'All ' + live.stepsTotal + ' steps are done. The check-in is what puts this on the chart below.';
    } else if (live.nextExerciseTitle) {
      status = 'Next up is your ' + String(live.nextStepLabel).toLowerCase() + ' step: ' + live.nextExerciseTitle + '.';
    } else {
      status = 'The plan is ready whenever you are.';
    }

    return el('section', { class: 'panel panel--live' }, [
      el('div', { class: 'live-head' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: 'Happening now · started ' + FB.dom.formatDate(live.createdAt) }),
          el('h3', { class: 'panel__title', text: live.headline || live.subject || labelFor(live.primarySignal) })
        ]),
        el('span', { class: 'tag tag--live', text: live.demo ? 'Demo, not recorded yet' : 'Not recorded yet' })
      ]),

      el('dl', { class: 'summary-row summary-row--tight' }, [
        summaryItem('Pressure at the start', live.pressureBefore === null ? 'Not estimated' : live.pressureBefore + '/10'),
        summaryItem('Plan progress', live.stepsDone + ' of ' + live.stepsTotal + ' steps'),
        summaryItem('Exercises done', String(live.exercisesCompleted)),
        summaryItem('Main driver', (live.drivers && live.drivers[0]) || labelFor(live.primarySignal))
      ]),

      el('div', { class: 'plan-progress' }, [
        el('span', { class: 'plan-progress__label', text: status }),
        el('div', { class: 'plan-progress__track', 'aria-hidden': 'true' }, [
          el('span', { class: 'plan-progress__fill', style: 'width:' + pct + '%' })
        ])
      ]),

      el('div', { class: 'row' }, [
        el('a', { class: 'btn btn--primary btn--small', href: '#/plan' },
          live.awaitingCheckin ? 'Record the check-in' : 'Open the plan'),
        el('a', { class: 'btn btn--text btn--small', href: '#/snapshot' }, 'See the snapshot')
      ]),

      el('p', { class: 'meta', text: 'Nothing here has been written to your history yet. Free Bird only records a check-in you choose to save.' })
    ]);
  }

  function summaryRow(history, live) {
    var withChange = history.filter(function (h) { return typeof h.pressureBefore === 'number' && typeof h.pressureAfter === 'number'; });
    var improved = withChange.filter(function (h) { return h.pressureAfter < h.pressureBefore; }).length;
    var exercises = history.reduce(function (sum, h) { return sum + (h.exercisesCompleted || 1); }, 0);
    // Exercises done in the open session count as done. They are real work,
    // and leaving them out is what made this page lag behind My Plan.
    var liveExercises = live ? live.exercisesCompleted : 0;

    var avgDelta = withChange.length
      ? (withChange.reduce(function (sum, h) { return sum + (h.pressureBefore - h.pressureAfter); }, 0) / withChange.length)
      : 0;

    return el('dl', { class: 'summary-row' }, [
      summaryItem('Check-ins', String(history.length)),
      summaryItem('Exercises completed', String(exercises + liveExercises),
        liveExercises ? liveExercises + ' of them in the session still open' : null),
      summaryItem('Reported lower after', improved + ' of ' + withChange.length),
      summaryItem('Average reported change', avgDelta === 0
        ? 'No change'
        : Math.abs(avgDelta).toFixed(1) + ' points ' + (avgDelta > 0 ? 'lower' : 'higher'))
    ]);
  }

  function summaryItem(label, value, note) {
    return el('div', { class: 'summary-item' }, [
      el('dt', { text: label }),
      el('dd', { text: value }),
      note ? el('p', { class: 'summary-item__note', text: note }) : null
    ]);
  }

  /**
   * Before and after pressure per check-in, drawn as paired bars. The table
   * underneath carries the same numbers for anyone using a screen reader or
   * who simply prefers the figures.
   */
  function chartPanel(history) {
    var recent = history.slice(-8);
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 320 150');
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Reported pressure before and after each of the last ' + recent.length + ' check-ins. The figures are in the table below.');

    var chartW = 300;
    var chartH = 110;
    var left = 16;
    var top = 12;
    var slot = chartW / recent.length;
    var bar = Math.min(16, slot / 3);

    // Horizontal guides at 0, 5 and 10.
    [0, 5, 10].forEach(function (value) {
      var y = top + chartH - (value / 10) * chartH;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(left));
      line.setAttribute('x2', String(left + chartW));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('class', 'chart__guide');
      svg.appendChild(line);

      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', '4');
      label.setAttribute('y', String(y + 3.5));
      label.setAttribute('class', 'chart__axis');
      label.textContent = String(value);
      svg.appendChild(label);
    });

    recent.forEach(function (entry, index) {
      var x = left + (index * slot) + (slot / 2);

      [['before', entry.pressureBefore, -bar * 0.55], ['after', entry.pressureAfter, bar * 0.55]].forEach(function (pair) {
        var value = pair[1];
        if (typeof value !== 'number') return;
        var h = Math.max(2, (value / 10) * chartH);
        var rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', String(x + pair[2] - bar / 2));
        rect.setAttribute('y', String(top + chartH - h));
        rect.setAttribute('width', String(bar));
        rect.setAttribute('height', String(h));
        rect.setAttribute('rx', '1.5');
        rect.setAttribute('class', 'chart__bar chart__bar--' + pair[0]);
        svg.appendChild(rect);
      });

      var tick = document.createElementNS(svgNS, 'text');
      tick.setAttribute('x', String(x));
      tick.setAttribute('y', String(top + chartH + 14));
      tick.setAttribute('text-anchor', 'middle');
      tick.setAttribute('class', 'chart__axis');
      tick.textContent = FB.dom.formatShortDate(entry.createdAt);
      svg.appendChild(tick);
    });

    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: 'Your self-reported change' }),
      el('p', { class: 'panel__lede', text: 'Pressure before a plan, then after the check-in. Both numbers come from you.' }),
      el('div', { class: 'chart__wrap' }, svg),
      el('ul', { class: 'legend' }, [
        el('li', { class: 'legend__item legend__item--before' }, 'Before'),
        el('li', { class: 'legend__item legend__item--after' }, 'After')
      ]),
      el('details', { class: 'disclosure' }, [
        el('summary', { text: 'Show the figures as a table' }),
        el('table', { class: 'table' }, [
          el('thead', {}, el('tr', {}, [
            el('th', { scope: 'col', text: 'Date' }),
            el('th', { scope: 'col', text: 'Situation' }),
            el('th', { scope: 'col', class: 'num', text: 'Before' }),
            el('th', { scope: 'col', class: 'num', text: 'After' }),
            el('th', { scope: 'col', text: 'You said' })
          ])),
          el('tbody', {}, recent.slice().reverse().map(function (entry) {
            return el('tr', {}, [
              el('td', { text: FB.dom.formatShortDate(entry.createdAt) }),
              el('td', { text: entry.subject || labelFor(entry.primarySignal) }),
              el('td', { class: 'num', text: String(entry.pressureBefore) }),
              el('td', { class: 'num', text: String(entry.pressureAfter) }),
              el('td', { text: changeLabel(entry.change) })
            ]);
          }))
        ])
      ])
    ]);
  }

  function categoryPanel(history) {
    var counts = {};
    history.forEach(function (entry) {
      if (!entry.exerciseCategory) return;
      counts[entry.exerciseCategory] = (counts[entry.exerciseCategory] || 0) + 1;
    });

    var entries = Object.keys(counts).map(function (key) {
      return { key: key, count: counts[key] };
    }).sort(function (a, b) { return b.count - a.count; });

    if (!entries.length) return null;
    var max = entries[0].count;

    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: 'What you reach for most' }),
      el('ul', { class: 'catbars' }, entries.map(function (entry) {
        return el('li', { class: 'catbar' }, [
          el('span', { class: 'catbar__label', text: entry.key }),
          el('span', { class: 'catbar__track', 'aria-hidden': 'true' }, [
            el('span', { class: 'catbar__fill', style: 'width:' + ((entry.count / max) * 100) + '%' })
          ]),
          el('span', { class: 'catbar__count', text: entry.count + ' time' + (entry.count === 1 ? '' : 's') })
        ]);
      })),
      el('p', { class: 'meta', text: FB.exercises.categoryBlurb[entries[0].key] })
    ]);
  }

  function timelinePanel(history) {
    var recent = history.slice().reverse().slice(0, 10);

    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: 'Recent check-ins' }),
      el('ol', { class: 'timeline' }, recent.map(function (entry) {
        var exercise = entry.exerciseId ? FB.exercises.get(entry.exerciseId) : null;
        return el('li', { class: 'timeline__item' }, [
          el('div', { class: 'timeline__meta' }, [
            el('time', { datetime: new Date(entry.createdAt).toISOString(), text: FB.dom.formatShortDate(entry.createdAt) }),
            entry.demo ? el('span', { class: 'tag', text: 'Sample entry' }) : null
          ]),
          el('div', { class: 'timeline__body' }, [
            el('p', { class: 'timeline__title', text: entry.subject || labelFor(entry.primarySignal) }),
            el('p', { class: 'timeline__detail', text: (entry.drivers || []).slice(0, 2).join(' · ') }),
            el('p', { class: 'timeline__result' }, [
              el('strong', { text: entry.pressureBefore + ' to ' + entry.pressureAfter }),
              el('span', { text: ' · ' + changeLabel(entry.change) }),
              exercise ? el('span', { text: ' · ' + exercise.title }) : null
            ])
          ])
        ]);
      }))
    ]);
  }

  function dataControls(history) {
    var demoCount = history.filter(function (h) { return h.demo; }).length;

    return el('section', { class: 'panel panel--quiet' }, [
      el('h3', { class: 'panel__title', text: 'Your data' }),
      el('p', { text: 'All of this lives in this browser under keys starting with ' + FB.storage.PREFIX + '. Free Bird stores summaries, never the text you wrote.' }),
      el('div', { class: 'row' }, [
        demoCount
          ? el('button', {
              class: 'btn btn--secondary btn--small', type: 'button',
              onclick: function () {
                FB.state.clearDemoData();
                FB.components.toast('Sample entries removed.');
              }
            }, 'Remove ' + demoCount + ' sample entr' + (demoCount === 1 ? 'y' : 'ies'))
          : null,
        el('button', {
          class: 'btn btn--danger btn--small', type: 'button',
          onclick: function () {
            FB.components.confirmDialog({
              title: 'Clear my data?',
              body: 'This deletes every Free Bird entry in this browser: your preferences, current session, plan, check-ins, and history.',
              detail: 'This cannot be undone, and nothing is stored anywhere else to restore it from.',
              confirmLabel: 'Clear my data',
              onConfirm: function () {
                var removed = FB.state.clearAllData();
                FB.components.toast('Cleared ' + removed + ' stored item' + (removed === 1 ? '' : 's') + '.');
                FB.dom.announce('All local Free Bird data cleared.');
                FB.router.go('home');
              }
            });
          }
        }, 'Clear my data')
      ])
    ]);
  }

  function labelFor(signalId) {
    return FB.recommendations.DRIVER_PHRASE[signalId] || FB.classifier.labelFor(signalId);
  }

  function changeLabel(changeId) {
    var option = FB.state.changeOption(changeId);
    return option ? option.label : 'Not recorded';
  }

  FB.views = FB.views || {};
  FB.views.progress = { title: 'Progress', render: render };
})(window.FB = window.FB || {});
