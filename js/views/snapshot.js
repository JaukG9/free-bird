/**
 * Stress snapshot.
 *
 * Everything shown here is traceable: the pressure number has a visible
 * breakdown, the signals have visible scores, and the source line says which
 * engine produced them. Nothing on this page is presented as a clinical
 * finding, and the wording is chosen to keep that clear.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    var session = FB.state.get().session;
    if (!session) {
      return el('div', { class: 'view view--snapshot' }, [
        FB.components.sectionHeading('Stress snapshot', 'Nothing to show yet', null),
        FB.components.emptyState(
          'No stress check yet',
          'Once you describe a situation, the snapshot appears here.',
          'Start a stress check',
          '#/stress-test'
        )
      ]);
    }

    var profile = session.profile;
    var drivers = FB.recommendations.driversFor(profile);

    return el('div', { class: 'view view--snapshot' }, [
      el('header', { class: 'snapshot-head' }, [
        el('p', { class: 'eyebrow', text: 'Stress snapshot · ' + FB.dom.formatDate(profile.createdAt) }),
        el('h1', { text: profile.plan.headline }),
        el('blockquote', { class: 'quoted quoted--full' }, [
          el('p', { text: profile.text }),
          profile.truncated ? el('footer', { class: 'meta', text: 'Only the first 2000 characters were read.' }) : null
        ])
      ]),

      el('div', { class: 'snapshot-grid' }, [
        pressurePanel(profile),
        driversPanel(drivers, profile),
        patternsPanel(profile)
      ]),

      readingPanel(profile),
      transparencyPanel(profile),

      el('div', { class: 'snapshot-actions' }, [
        el('a', { class: 'btn btn--primary', href: '#/plan' }, [
          el('span', { text: 'See the plan' }),
          FB.dom.icon('arrow', 16)
        ]),
        el('a', { class: 'btn btn--secondary', href: '#/wingman' }, 'Talk it through'),
        el('a', { class: 'btn btn--text', href: '#/stress-test' }, 'Describe something else')
      ])
    ]);
  }

  function pressurePanel(profile) {
    return el('section', { class: 'panel panel--pressure' }, [
      el('h3', { class: 'panel__title', text: 'Pressure estimate' }),
      FB.components.pressureMeter(profile.pressure),
      el('p', { class: 'panel__note', text: 'This is a summary of what you told us and how the situation is worded. It is not a measurement of you, and it is not a clinical score.' }),
      breakdown(profile.pressure)
    ]);
  }

  function breakdown(pressure) {
    var rows = pressure.breakdown.filter(function (row) { return row.value !== 0 || row.note !== 'not given'; });

    return el('details', { class: 'disclosure' }, [
      el('summary', { text: 'Where this number came from' }),
      el('table', { class: 'table table--breakdown' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { scope: 'col', text: 'Input' }),
          el('th', { scope: 'col', text: 'Detail' }),
          el('th', { scope: 'col', class: 'num', text: 'Points' })
        ])),
        el('tbody', {}, rows.map(function (row) {
          return el('tr', {}, [
            el('th', { scope: 'row', text: row.key }),
            el('td', { text: row.note }),
            el('td', { class: 'num', text: (row.value > 0 ? '+' : '') + row.value })
          ]);
        }))
      ]),
      el('p', { class: 'meta', text: 'Points are added to a base value and rounded to the 1 to 10 scale.' })
    ]);
  }

  function driversPanel(drivers, profile) {
    if (profile.primarySignal === 'low-stress') {
      return el('section', { class: 'panel' }, [
        el('h3', { class: 'panel__title', text: 'What’s weighing on you' }),
        el('p', { text: 'Nothing in the wording points clearly at a source of pressure right now. That is a legitimate result, not a failure to detect something.' }),
        el('p', { class: 'meta', text: 'If that does not match how you feel, adding a sentence about the specific situation usually helps.' })
      ]);
    }

    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: 'What’s weighing on you' }),
      el('p', { class: 'panel__lede', text: 'Free Bird noticed language that may reflect:' }),
      el('ul', { class: 'driver-list' }, drivers.map(function (driver) {
        return el('li', { class: 'driver' }, [
          el('span', { class: 'driver__label', text: driver.label }),
          el('span', { class: 'driver__detail', text: driver.detail })
        ]);
      })),
      profile.evidence === 'thin'
        ? el('p', { class: 'meta', text: 'This one is a weak match. There was not much in the wording to go on, so treat it as a starting guess rather than a read. Adding a sentence about the specific situation usually sharpens it.' })
        : null
    ]);
  }

  function patternsPanel(profile) {
    if (!profile.patterns.length) {
      return el('section', { class: 'panel' }, [
        el('h3', { class: 'panel__title', text: 'Patterns Free Bird noticed' }),
        el('p', { text: 'None of the wording patterns Free Bird looks for showed up here.' }),
        el('p', { class: 'meta', text: 'These are observations about phrasing, not traits.' })
      ]);
    }

    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: 'Patterns Free Bird noticed' }),
      el('ul', { class: 'pattern-list' }, profile.patterns.map(function (pattern) {
        return el('li', { class: 'pattern' }, [
          el('span', { class: 'pattern__label', text: pattern.label }),
          el('span', { class: 'pattern__detail', text: pattern.blurb })
        ]);
      })),
      el('p', { class: 'meta', text: 'These describe wording, not you. Everyone writes this way sometimes.' })
    ]);
  }

  function readingPanel(profile) {
    return el('section', { class: 'panel panel--reading' }, [
      el('div', { class: 'reading' }, [
        el('h3', { class: 'panel__title', text: 'The short version' }),
        el('p', { class: 'reading__lead', text: FB.recommendations.primaryRead(profile) })
      ]),
      el('div', { class: 'reading' }, [
        el('h3', { class: 'panel__title', text: 'What may help first' }),
        el('p', { text: FB.recommendations.firstStepRead(profile) })
      ])
    ]);
  }

  /**
   * Full score transparency, tucked behind a disclosure so it does not clutter
   * the page for someone who just wants the plan.
   */
  function transparencyPanel(profile) {
    var ranked = profile.ranked.filter(function (s) { return s.score > 0.02; }).slice(0, 8);

    return el('details', { class: 'disclosure disclosure--wide' }, [
      el('summary', { text: 'Show every signal score' }),
      el('div', { class: 'transparency' }, [
        FB.components.sourceNote(profile),
        el('div', { class: 'transparency__bars' }, ranked.map(function (signal) {
          return FB.components.scoreBar(signal.label, signal.score, signal.blurb);
        })),
        profile.semanticScores
          ? el('p', { class: 'meta', text: 'Each score is a blend of the rule engine (' + Math.round(FB.classifier.BLEND.lexical * 100) + '%) and on-device sentence similarity (' + Math.round(FB.classifier.BLEND.semantic * 100) + '%).' })
          : el('p', { class: 'meta', text: 'These scores come from the rule engine alone. Free Bird does not show a model confidence when no model ran.' }),
        el('p', { class: 'meta', text: 'Signals describe language, not people. A high score means those words appeared, not that anything is wrong with you.' })
      ])
    ]);
  }

  FB.views = FB.views || {};
  FB.views.snapshot = { title: 'Snapshot', render: render };
})(window.FB = window.FB || {});
