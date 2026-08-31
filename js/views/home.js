/**
 * Home. Landing page on a first visit, a light dashboard once there is a
 * session. Deliberately not a metrics wall.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    var state = FB.state.get();
    var hasSession = FB.state.hasSession();

    return el('div', { class: 'view view--home' }, [
      hero(hasSession),
      hasSession ? currentWork(state) : firstUse(),
      loopExplainer(),
      assurances()
    ]);
  }

  function hero(hasSession) {
    return el('section', { class: 'hero' }, [
      el('div', { class: 'hero__text' }, [
        el('p', { class: 'hero__eyebrow', text: 'Student wellness, on your device' }),
        el('h1', { class: 'hero__title' }, [
          el('span', { class: 'hero__word', text: 'Free' }),
          ' ',
          el('span', { class: 'hero__word', text: 'Bird' })
        ]),
        el('p', { class: 'hero__tagline', text: 'Fly free, fly high.' }),
        el('p', { class: 'hero__lede', text: 'Turn what’s weighing on you into your next step.' }),
        el('div', { class: 'hero__actions' }, [
          el('a', { class: 'btn btn--primary', href: '#/stress-test' }, [
            el('span', { text: hasSession ? 'Start a new stress check' : 'Start a stress check' }),
            FB.dom.icon('arrow', 16)
          ]),
          el('button', {
            class: 'btn btn--secondary', type: 'button',
            onclick: function () { FB.demo.start(); }
          }, 'Try a demo')
        ]),
        el('p', { class: 'hero__note', text: 'No account. No server. Your writing stays in this browser.' })
      ]),
      el('div', { class: 'hero__art', 'aria-hidden': 'true' }, [
        el('img', { src: 'assets/illustrations/sky.svg', alt: '', width: '480', height: '300' })
      ])
    ]);
  }

  function firstUse() {
    return el('section', { class: 'intro-grid', 'aria-label': 'What Free Bird is' }, [
      introItem('What it does', 'You describe a real situation in your own words. Free Bird reads the language for non-clinical stress signals and turns them into a three step plan you can actually finish.'),
      introItem('What it is not', 'It is not therapy, not a diagnosis, and not an emergency service. It is a study-and-stress tool, and it says so wherever that matters.'),
      introItem('Where your words go', 'Nowhere. The analysis runs inside this page. There is no account, no backend, and no request carrying your text.')
    ]);
  }

  function introItem(title, body) {
    return el('div', { class: 'intro-item' }, [
      el('h2', { class: 'intro-item__title', text: title }),
      el('p', { text: body })
    ]);
  }

  function currentWork(state) {
    var session = state.session;
    var profile = session.profile;
    var plan = session.plan;
    var nextStep = plan.steps.filter(function (s) { return !s.done; })[0];
    var doneCount = plan.steps.filter(function (s) { return s.done; }).length;

    return el('section', { class: 'home-current', 'aria-label': 'Where you are now' }, [
      el('div', { class: 'home-current__main' }, [
        el('p', { class: 'eyebrow', text: 'Last stress check · ' + FB.dom.formatDate(profile.createdAt) }),
        el('h2', { class: 'home-current__title', text: plan.headline }),
        el('blockquote', { class: 'quoted' }, [
          el('p', { text: FB.dom.truncate(profile.text, 180) })
        ]),
        el('div', { class: 'home-current__facts' }, [
          fact('Pressure estimate', profile.pressure.value + '/10 (' + FB.components.BAND_WORD[profile.pressure.band] + ')'),
          fact('Main driver', FB.recommendations.DRIVER_PHRASE[profile.primarySignal] || profile.primarySignal),
          fact('Plan progress', doneCount + ' of 3 steps done')
        ]),
        el('div', { class: 'row' }, [
          nextStep
            ? el('a', { class: 'btn btn--primary', href: '#/plan' }, [
                el('span', { text: 'Continue: ' + nextStep.label }),
                FB.dom.icon('arrow', 16)
              ])
            : el('a', { class: 'btn btn--primary', href: '#/plan' }, 'Do the check-in'),
          el('a', { class: 'btn btn--secondary', href: '#/wingman' }, 'Talk to Wingman'),
          el('a', { class: 'btn btn--text', href: '#/snapshot' }, 'See the snapshot')
        ])
      ]),
      quickAction(session)
    ]);
  }

  function fact(label, value) {
    return el('div', { class: 'fact' }, [
      el('dt', { class: 'fact__label', text: label }),
      el('dd', { class: 'fact__value', text: value })
    ]);
  }

  /**
   * One thing the user could do in the next two minutes, chosen from the plan
   * rather than picked at random.
   */
  function quickAction(session) {
    var nextStep = session.plan.steps.filter(function (s) { return !s.done; })[0];
    var exercise = nextStep ? FB.exercises.get(nextStep.exerciseId) : null;

    if (!exercise) {
      return el('aside', { class: 'quick' }, [
        el('p', { class: 'eyebrow', text: 'Quick action' }),
        el('h3', { text: 'Record how it went' }),
        el('p', { text: 'You have finished all three steps. A fifteen second check-in is what turns this into something you can look back at.' }),
        el('a', { class: 'btn btn--secondary btn--small', href: '#/plan' }, 'Open check-in')
      ]);
    }

    return el('aside', { class: 'quick' }, [
      el('p', { class: 'eyebrow', text: 'Quick action · ' + exercise.duration }),
      el('h3', { text: exercise.title }),
      el('p', { text: exercise.summary }),
      el('button', {
        class: 'btn btn--secondary btn--small', type: 'button',
        onclick: function () {
          FB.components.openExercise(exercise, {
            onComplete: function () {
              FB.state.completeStep(nextStep.stage);
              FB.components.toast(exercise.title + ' marked as done.');
              FB.dom.announce(exercise.title + ' marked as done.');
            }
          });
        }
      }, 'Start it now')
    ]);
  }

  function loopExplainer() {
    var items = [
      ['Calm', 'Something physical and short, because the body settles faster than the thinking does.'],
      ['Clarify', 'One reflection step that makes the situation smaller and more specific than it currently is.'],
      ['Act', 'One concrete move, sized so it can actually happen today rather than in theory.']
    ];

    return el('section', { class: 'loop', 'aria-label': 'How a plan is built' }, [
      el('h2', { class: 'loop__title', text: 'Every plan has three steps' }),
      el('ol', { class: 'loop__list' }, items.map(function (item, index) {
        return el('li', { class: 'loop__item' }, [
          el('span', { class: 'loop__num', 'aria-hidden': 'true', text: String(index + 1) }),
          el('h3', { class: 'loop__name', text: item[0] }),
          el('p', { text: item[1] })
        ]);
      }))
    ]);
  }

  function assurances() {
    return el('section', { class: 'assure' }, [
      el('p', { class: 'assure__text' }, [
        el('strong', { text: 'Free Bird is not a therapist, a diagnosis, or an emergency service. ' }),
        el('span', { text: 'If you are in danger or thinking about harming yourself, please use the resources on the safety page or call 988 in the United States.' })
      ]),
      el('a', { class: 'btn btn--text', href: '#/safety' }, 'Safety and about')
    ]);
  }

  FB.views = FB.views || {};
  FB.views.home = { title: 'Home', render: render };
})(window.FB = window.FB || {});
