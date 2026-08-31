/**
 * Free Bird bootstrap.
 *
 * Wires the router, the navigation, the model status chip, the first-run
 * notice, and the global error handling, then hands control to the views.
 * Everything below runs after the page has already painted, so a slow model or
 * a failing feature never delays the interface appearing.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  /* ------------------------------------------------------------------ */
  /* Routes                                                              */
  /* ------------------------------------------------------------------ */

  function registerRoutes() {
    FB.router.register('home', FB.views.home);
    FB.router.register('stress-test', FB.views.stressTest);
    FB.router.register('snapshot', FB.views.snapshot);
    FB.router.register('plan', FB.views.plan);
    FB.router.register('wingman', FB.views.wingman);
    FB.router.register('progress', FB.views.progress);
    FB.router.register('safety', FB.views.about);
    FB.router.register('safety-support', FB.views.safetySupport);
    FB.router.register('not-found', {
      title: 'Page not found',
      render: function () {
        return FB.components.emptyState(
          'That page does not exist',
          'The link may be out of date. Everything in Free Bird is reachable from the navigation above.',
          'Go home',
          '#/home'
        );
      }
    });
  }

  /**
   * Route guards.
   *
   * The safety redirect comes first and is unconditional: while a crisis scan
   * result is being held, no other screen renders.
   */
  function registerGuards() {
    FB.router.beforeEach(function (target) {
      var state = FB.state.get();

      if (state.safetyBlock && target.name !== 'safety-support' && target.name !== 'safety') {
        return 'safety-support';
      }
      if (target.name === 'safety-support' && !state.safetyBlock) {
        return 'safety';
      }
      if ((target.name === 'snapshot' || target.name === 'plan') && !FB.state.hasSession()) {
        return 'stress-test';
      }
      return null;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */

  var NAV = [
    { route: 'home', label: 'Home' },
    { route: 'stress-test', label: 'Stress check' },
    { route: 'plan', label: 'My plan' },
    { route: 'wingman', label: 'Wingman' },
    { route: 'progress', label: 'Progress' },
    { route: 'safety', label: 'Safety and about' }
  ];

  function buildNav() {
    var list = document.getElementById('nav-list');
    if (!list) return;
    FB.dom.clear(list);

    NAV.forEach(function (item) {
      list.appendChild(el('li', { class: 'nav__item' }, [
        el('a', {
          class: 'nav__link',
          href: '#/' + item.route,
          dataset: { route: item.route }
        }, item.label)
      ]));
    });
  }

  function markActiveNav(routeName) {
    // Sub-routes belong to a nav entry so the highlight does not disappear.
    var owner = {
      snapshot: 'stress-test',
      'safety-support': 'safety',
      'not-found': null
    };
    var active = Object.prototype.hasOwnProperty.call(owner, routeName) ? owner[routeName] : routeName;

    FB.dom.qsa('.nav__link').forEach(function (link) {
      var isActive = link.dataset.route === active;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function setupMobileNav() {
    var toggle = document.getElementById('nav-toggle');
    var nav = document.getElementById('nav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Header chip                                                         */
  /* ------------------------------------------------------------------ */

  function paintModelChip() {
    var host = document.getElementById('model-status');
    if (!host) return;
    FB.dom.clear(host);
    host.appendChild(FB.components.modelChip());
  }

  /* ------------------------------------------------------------------ */
  /* First-run notice                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Shown once, only when the user has never answered the question. Downloading
   * roughly 25 MB should be a choice rather than something that happens quietly
   * in the background on a school connection.
   */
  function paintFirstRunNotice() {
    var host = document.getElementById('notice-host');
    if (!host) return;
    var prefs = FB.state.get().prefs;

    FB.dom.clear(host);
    if (prefs.allowModelDownload !== null) {
      host.hidden = true;
      return;
    }
    host.hidden = false;

    host.appendChild(el('div', { class: 'notice-bar', role: 'region', 'aria-label': 'On-device AI choice' }, [
      el('p', { class: 'notice-bar__text' }, [
        el('strong', { text: 'Free Bird works right now. ' }),
        el('span', { text: 'It can also run a small AI model on this device for a sharper read of what you write. About 25 MB, downloaded once. Your writing is never part of that request.' })
      ]),
      el('div', { class: 'notice-bar__actions' }, [
        el('button', {
          class: 'btn btn--primary btn--small', type: 'button',
          onclick: function () {
            FB.state.setPref('allowModelDownload', true);
            FB.model.load();
            paintFirstRunNotice();
            FB.dom.announce('Downloading the on-device model.');
          }
        }, 'Turn on local AI'),
        el('button', {
          class: 'btn btn--text btn--small', type: 'button',
          onclick: function () {
            FB.state.setPref('allowModelDownload', false);
            FB.model.disable();
            paintFirstRunNotice();
            FB.dom.announce('Staying in offline coaching mode.');
          }
        }, 'Not now')
      ])
    ]));
  }

  /* ------------------------------------------------------------------ */
  /* Re-render policy                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Reasons that change what a view shows. Chat and model updates are handled
   * locally by the views that care, so a Wingman message does not wipe the
   * text someone is in the middle of typing.
   */
  var RERENDER_REASONS = ['session', 'plan', 'checkin', 'cleared', 'restore', 'history', 'demo'];

  function subscribeToState() {
    FB.state.subscribe(function (state, reason) {
      if (reason === 'model') {
        paintModelChip();
        return;
      }
      if (reason === 'prefs') {
        paintFirstRunNotice();
        paintModelChip();
        var route = FB.router.currentRoute();
        if (route && route.name === 'safety') FB.router.render();
        return;
      }
      if (reason === 'safety') {
        if (state.safetyBlock) FB.router.go('safety-support');
        return;
      }
      if (RERENDER_REASONS.indexOf(reason) !== -1) {
        if (reason === 'cleared') paintFirstRunNotice();
        FB.router.render();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Error handling                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * A last line of defence. If something unexpected throws, the user gets a
   * readable message rather than a page that has silently stopped working.
   */
  function installErrorHandlers() {
    var shown = false;

    function report(message) {
      if (shown) return;
      shown = true;
      window.setTimeout(function () { shown = false; }, 8000);
      FB.components.toast('Something went wrong in the app. Your saved data has not changed.');
      if (window.console && console.error) console.error('Free Bird error:', message);
    }

    window.addEventListener('error', function (event) {
      report(event.message || 'Unknown error');
    });

    window.addEventListener('unhandledrejection', function (event) {
      report((event.reason && event.reason.message) || 'Unhandled promise rejection');
    });
  }

  function checkBrowserSupport() {
    var missing = [];
    if (typeof Promise === 'undefined') missing.push('Promises');
    if (!document.querySelector) missing.push('querySelector');
    if (typeof Object.assign !== 'function') missing.push('Object.assign');

    if (!missing.length) return true;

    var root = document.getElementById('app');
    if (root) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'unsupported' }, [
        el('h1', { text: 'Free Bird needs a newer browser' }),
        el('p', { text: 'This browser is missing ' + missing.join(', ') + '. Free Bird should work in a recent version of Chrome, Edge, Firefox or Safari.' })
      ]));
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Model loading policy                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Load only if the user has already said yes, and only after the interface
   * is on screen. First paint is never blocked by the model.
   */
  function maybeLoadModel() {
    var prefs = FB.state.get().prefs;
    if (prefs.allowModelDownload !== true) {
      if (prefs.allowModelDownload === false) FB.model.disable();
      return;
    }
    var start = function () { FB.model.load(); };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(start, { timeout: 2500 });
    } else {
      window.setTimeout(start, 900);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    if (!checkBrowserSupport()) return;

    installErrorHandlers();
    FB.state.applyMotionPreference();
    FB.state.restore();

    registerRoutes();
    registerGuards();
    buildNav();
    setupMobileNav();
    subscribeToState();
    paintModelChip();
    paintFirstRunNotice();
    FB.demo.init();

    FB.router.afterEach(function (target) {
      markActiveNav(target.name);
      var main = document.getElementById('main');
      if (main) {
        main.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
    });

    FB.router.start();
    maybeLoadModel();

    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  FB.app = { boot: boot, NAV: NAV };
})(window.FB = window.FB || {});
