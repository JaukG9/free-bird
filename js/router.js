/**
 * Hash router.
 *
 * Hash routing rather than the History API, because GitHub Pages serves static
 * files with no rewrite rules and a deep link like /plan would 404. Hashes work
 * identically from a file:// page, a local static server, and Pages.
 */
(function (FB) {
  'use strict';

  var routes = {};
  var order = [];
  var current = null;
  var beforeHooks = [];
  var afterHooks = [];

  function register(name, config) {
    routes[name] = config;
    order.push(name);
  }

  function exists(name) {
    return Object.prototype.hasOwnProperty.call(routes, name);
  }

  function parseHash() {
    var raw = window.location.hash.replace(/^#\/?/, '').trim();
    if (!raw) return { name: 'home', params: {} };

    var parts = raw.split('?');
    var name = parts[0].replace(/\/+$/, '');
    var params = {};

    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }

    return { name: exists(name) ? name : 'not-found', params: params };
  }

  function go(name, params) {
    var hash = '#/' + name;
    if (params && Object.keys(params).length) {
      hash += '?' + Object.keys(params).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      }).join('&');
    }
    if (window.location.hash === hash) {
      render();
    } else {
      // A hashchange render is already on its way. Suppress any queued render
      // until it lands, so the screen being navigated away from is not redrawn
      // against the new state on the way out.
      awaitNavigation();
      window.location.hash = hash;
    }
  }

  function replace(name) {
    var hash = '#/' + name;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
      render();
    } else {
      window.location.hash = hash;
    }
  }

  function beforeEach(fn) { beforeHooks.push(fn); }
  function afterEach(fn) { afterHooks.push(fn); }

  var outlet = null;
  var cleanups = [];
  var renderQueued = false;
  var navigationPending = false;

  /**
   * Hold off scheduled renders until a hashchange render arrives. The timeout
   * is a safety net: if the navigation somehow produces no event, the app
   * recovers rather than never painting again.
   */
  function awaitNavigation() {
    navigationPending = true;
    renderQueued = false;
    window.setTimeout(function () {
      if (!navigationPending) return;
      navigationPending = false;
      render();
    }, 80);
  }

  /**
   * Register a teardown for the view currently being rendered.
   *
   * Views are plain functions that build a DOM tree, so anything a view
   * subscribes to would otherwise outlive it and keep firing against nodes
   * that are no longer on the page. A view calls this during render, and the
   * router runs the teardown immediately before the next render.
   */
  function onCleanup(fn) {
    if (typeof fn === 'function') cleanups.push(fn);
    return fn;
  }

  function runCleanups() {
    var pending = cleanups;
    cleanups = [];
    pending.forEach(function (fn) {
      try { fn(); } catch (e) { /* a failing teardown must not block the render */ }
    });
  }

  /**
   * Ask for a render without doing one per state change.
   *
   * A single user action often produces several notifications in a row: a
   * stress check clears demo mode, starts a session, and navigates. Rendering
   * on each one is wasted work and, worse, briefly paints a screen against
   * half-applied state. Coalescing to the end of the current task means every
   * view is drawn once, from the finished state.
   */
  function scheduleRender() {
    if (renderQueued || navigationPending) return;
    renderQueued = true;
    var run = function () {
      renderQueued = false;
      render();
    };
    if (typeof Promise !== 'undefined' && Promise.resolve) {
      Promise.resolve().then(run);
    } else {
      window.setTimeout(run, 0);
    }
  }

  function render() {
    if (!outlet) outlet = document.getElementById('view');
    if (!outlet) return;

    // Anything queued is about to happen anyway; do not draw the same screen
    // twice because a synchronous render overtook a scheduled one.
    renderQueued = false;
    navigationPending = false;
    runCleanups();

    var target = parseHash();

    // Guards can redirect, for example away from the snapshot when there is no
    // analysis yet, or on to the safety screen when the scan has fired.
    for (var i = 0; i < beforeHooks.length; i++) {
      var redirect = beforeHooks[i](target);
      if (redirect && redirect !== target.name) {
        replace(redirect);
        return;
      }
    }

    var route = routes[target.name] || routes['not-found'];
    current = target;

    FB.dom.clear(outlet);
    try {
      var node = route.render(target.params || {});
      if (node) outlet.appendChild(node);
    } catch (err) {
      if (window.console && console.error) console.error('View failed to render:', err);
      outlet.appendChild(errorPanel(err));
    }

    document.title = (route.title ? route.title + ' | Free Bird' : 'Free Bird');

    afterHooks.forEach(function (fn) {
      try { fn(target, route); } catch (e) { /* ignore */ }
    });
  }

  /** Last-resort panel so a broken view never leaves a blank page. */
  function errorPanel(err) {
    var el = FB.dom.el;
    return el('section', { class: 'panel panel--error', role: 'alert' }, [
      el('h2', { text: 'This page did not load' }),
      el('p', { text: 'Something went wrong while drawing this screen. Your saved data has not been changed.' }),
      el('p', { class: 'meta', text: err && err.message ? String(err.message) : 'Unknown error' }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn--primary',
          type: 'button',
          onclick: function () { render(); }
        }, 'Try again'),
        el('a', { class: 'btn btn--secondary', href: '#/home' }, 'Go home')
      ])
    ]);
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  function currentRoute() {
    return current;
  }

  FB.router = {
    register: register,
    go: go,
    replace: replace,
    start: start,
    render: render,
    scheduleRender: scheduleRender,
    onCleanup: onCleanup,
    beforeEach: beforeEach,
    afterEach: afterEach,
    parseHash: parseHash,
    currentRoute: currentRoute,
    exists: exists
  };
})(window.FB = window.FB || {});
