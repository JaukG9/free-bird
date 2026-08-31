/**
 * Small DOM helpers. No framework, no virtual DOM, no dependencies.
 */
(function (FB) {
  'use strict';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);

    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;

      if (key === 'class') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key === 'html') {
        node.innerHTML = value;
      } else if (key === 'dataset') {
        Object.keys(value).forEach(function (dataKey) { node.dataset[dataKey] = value[dataKey]; });
      } else if (key.indexOf('on') === 0 && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, value);
      }
    });

    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) { appendChildren(node, child); });
      return;
    }
    if (children instanceof Node) {
      node.appendChild(children);
      return;
    }
    node.appendChild(document.createTextNode(String(children)));
  }

  function frag(children) {
    var f = document.createDocumentFragment();
    appendChildren(f, children);
    return f;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /** Inline SVG icons. Stroke colour is inherited so they follow the text. */
  var ICON_PATHS = {
    arrow: '<path d="M4 10h12M11 5l5 5-5 5"/>',
    check: '<path d="M4 10.5l4 4 8-9"/>',
    wing: '<path d="M2 13c3 .6 5.4-.3 7.5-2.6 1.5-1.7 2.9-2.8 4.2-3.2 1.5-.5 2.9-.1 4.3.9-1 4.1-3.8 6.4-8.1 6.8"/>',
    lock: '<rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
    dot: '<circle cx="10" cy="10" r="3.5"/>',
    refresh: '<path d="M16 6v4h-4"/><path d="M15.6 10a5.6 5.6 0 11-1.6-4"/>',
    close: '<path d="M5 5l10 10M15 5L5 15"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    warning: '<path d="M10 3.5l7 12.5H3z"/><path d="M10 8.5v3.5"/><circle cx="10" cy="13.8" r=".6" fill="currentColor"/>',
    chevron: '<path d="M7 4l6 6-6 6"/>',
    play: '<path d="M6.5 4.5l9 5.5-9 5.5z"/>'
  };

  function icon(name, size) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('icon');
    svg.innerHTML = ICON_PATHS[name] || ICON_PATHS.dot;
    return svg;
  }

  /* ------------------------------------------------------------------ */
  /* Announcements and focus                                             */
  /* ------------------------------------------------------------------ */

  var liveRegion = null;

  function announce(message, assertive) {
    if (!liveRegion) liveRegion = document.getElementById('live-region');
    if (!liveRegion) return;
    liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    // Clearing first makes repeated identical messages announce again.
    liveRegion.textContent = '';
    window.setTimeout(function () { liveRegion.textContent = message; }, 60);
  }

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusablesIn(root) {
    return qsa(FOCUSABLE, root).filter(function (node) {
      return node.offsetParent !== null || node === document.activeElement;
    });
  }

  /** Keep tab focus inside a dialog while it is open. */
  function trapFocus(container) {
    function onKeydown(event) {
      if (event.key !== 'Tab') return;
      var items = focusablesIn(container);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    container.addEventListener('keydown', onKeydown);
    return function release() { container.removeEventListener('keydown', onKeydown); };
  }

  /* ------------------------------------------------------------------ */
  /* Formatting                                                          */
  /* ------------------------------------------------------------------ */

  function formatDate(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var sameDay = date.toDateString() === now.toDateString();
    var yesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
    var time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (sameDay) return 'Today, ' + time;
    if (yesterday) return 'Yesterday, ' + time;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
  }

  function formatShortDate(timestamp) {
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function truncate(text, max) {
    var value = String(text || '');
    if (value.length <= max) return value;
    return value.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  FB.dom = {
    el: el,
    frag: frag,
    clear: clear,
    qs: qs,
    qsa: qsa,
    icon: icon,
    announce: announce,
    trapFocus: trapFocus,
    focusablesIn: focusablesIn,
    formatDate: formatDate,
    formatShortDate: formatShortDate,
    truncate: truncate
  };
})(window.FB = window.FB || {});
