/**
 * Safety support screen.
 *
 * Shown instead of the coaching flow when the deterministic scan in
 * ai/safety.js matches crisis language. There is no score, no analysis, and no
 * plan on this page on purpose. The ordinary flow does not resume until the
 * person chooses to continue.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    var block = FB.state.get().safetyBlock;

    return el('div', { class: 'view view--safety-support' }, [
      el('section', { class: 'support', role: 'region', 'aria-labelledby': 'support-title' }, [
        el('p', { class: 'eyebrow', text: 'Free Bird has paused the usual flow' }),
        el('h1', { id: 'support-title', class: 'support__title', text: 'This sounds like more than a study plan can hold.' }),
        el('p', { class: 'support__lede', text: 'Something in what you wrote suggests you may be going through something serious. Free Bird is not going to give you a stress exercise for that.' }),
        el('p', { text: 'You deserve real support right now. Free Bird cannot keep you safe in an emergency. Please consider reaching out to someone who can: a trusted adult, a school counsellor, emergency services, or one of the resources below.' }),

        el('ul', { class: 'resource-list resource-list--support' }, FB.safety.RESOURCES.map(function (resource) {
          return el('li', { class: 'resource' }, [
            el('div', {}, [
              el('p', { class: 'resource__name', text: resource.name }),
              el('p', { class: 'resource__detail', text: resource.detail })
            ]),
            resource.href
              ? el('a', {
                  class: 'btn btn--primary btn--small',
                  href: resource.href,
                  rel: resource.href.indexOf('http') === 0 ? 'noopener noreferrer' : null,
                  target: resource.href.indexOf('http') === 0 ? '_blank' : null
                }, resource.hrefLabel)
              : null
          ]);
        })),

        el('div', { class: 'support__note' }, [
          el('p', { text: 'Telling one person is often the thing that changes the day. It does not have to be a perfect conversation, and you do not have to explain all of it.' }),
          el('p', { class: 'meta', text: 'Free Bird is a browser tool with no connection to any service. It cannot call anyone for you, and it has not sent anything anywhere.' })
        ]),

        el('div', { class: 'support__actions' }, [
          el('button', {
            class: 'btn btn--secondary', type: 'button',
            onclick: function () {
              FB.state.clearSafetyBlock();
              FB.router.go('stress-test');
            }
          }, 'Write about something else'),
          el('a', { class: 'btn btn--text', href: '#/safety' }, 'More about what Free Bird is')
        ]),

        block ? el('details', { class: 'disclosure' }, [
          el('summary', { text: 'Why this screen appeared' }),
          el('p', { text: 'A deterministic word and phrase scan runs on everything you type, before any analysis. It matched: ' + (block.matched || []).join(', ') + '.' }),
          el('p', { class: 'meta', text: 'This scan is intentionally cautious. It sometimes shows this screen when there is no crisis, and it can miss crisis language it does not recognise. It does not produce a risk score and it is not a clinical assessment.' })
        ]) : null
      ])
    ]);
  }

  FB.views = FB.views || {};
  FB.views.safetySupport = { title: 'Support', render: render };
})(window.FB = window.FB || {});
