/**
 * Wingman.
 *
 * A conversation, not a chatbot. Every reply is chosen by matching the user's
 * message to an intent and then composing from the session context. The label
 * under each reply says which matcher chose it, so the interface never implies
 * a language model wrote the words.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;

  function render() {
    var state = FB.state.get();
    var ctx = FB.wingmanContext.build();

    // The opening message is generated once per conversation, on first view.
    if (!state.chat.messages.length) {
      FB.state.addChatMessage({
        role: 'wingman',
        text: FB.fallback.openingMessage(ctx),
        at: Date.now(),
        method: 'opening'
      });
    }

    var listNode = el('div', {
      class: 'chat__list',
      id: 'chat-log',
      role: 'log',
      'aria-label': 'Conversation with Wingman',
      'aria-live': 'polite'
    });

    var typingNode = el('div', { class: 'chat__typing', hidden: true }, [
      el('span', { class: 'chat__typing-dots', 'aria-hidden': 'true' }, [
        el('i', {}), el('i', {}), el('i', {})
      ]),
      el('span', { class: 'sr-only', text: 'Wingman is preparing a reply.' })
    ]);

    var input = el('textarea', {
      id: 'wingman-input',
      class: 'chat__input',
      rows: '2',
      placeholder: 'Tell Wingman what is actually in the way.',
      'aria-describedby': 'wingman-input-help',
      maxlength: '1200',
      onkeydown: function (event) {
        // Enter sends, Shift and Enter makes a new line.
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submit();
        }
      }
    });

    var sendBtn = el('button', {
      class: 'btn btn--primary btn--small', type: 'submit', id: 'wingman-send'
    }, [el('span', { text: 'Send' }), FB.dom.icon('arrow', 15)]);

    var busy = false;

    function paint() {
      FB.dom.clear(listNode);
      FB.state.get().chat.messages.forEach(function (message) {
        listNode.appendChild(bubble(message));
      });
      listNode.scrollTop = listNode.scrollHeight;
    }

    function submit(preset) {
      var text = (preset !== undefined ? preset : input.value).trim();
      if (!text || busy) return;

      FB.state.addChatMessage({ role: 'user', text: text, at: Date.now() });
      input.value = '';
      paint();

      busy = true;
      sendBtn.disabled = true;
      typingNode.hidden = false;
      listNode.scrollTop = listNode.scrollHeight;

      var turn = FB.state.get().chat.turn;

      FB.pipeline.respond(text, FB.wingmanContext.build(), turn)
        .then(function (reply) {
          if (reply.blocked) {
            FB.state.setSafetyBlock(reply.safety);
            FB.router.go('safety-support');
            return;
          }
          // A short pause so the exchange does not feel like a lookup table.
          // It is presentation, not thinking time, and it is skipped when the
          // user has asked for reduced motion.
          var delay = FB.state.get().prefs.reducedMotion ? 0 : 420;
          window.setTimeout(function () {
            typingNode.hidden = true;
            FB.state.addChatMessage({
              role: 'wingman',
              text: reply.text,
              at: Date.now(),
              method: reply.method,
              intent: reply.intent,
              confidence: reply.confidence
            });
            paint();
            busy = false;
            sendBtn.disabled = false;
            FB.dom.announce('Wingman replied.');
          }, delay);
        })
        .catch(function () {
          typingNode.hidden = true;
          busy = false;
          sendBtn.disabled = false;
          FB.state.addChatMessage({
            role: 'wingman',
            text: 'Something went wrong on my side. Nothing you wrote has left this device. Try saying that again, or use one of the suggestions below.',
            at: Date.now(),
            method: 'error'
          });
          paint();
        });
    }

    var form = el('form', {
      class: 'chat__form',
      onsubmit: function (event) { event.preventDefault(); submit(); }
    }, [
      el('label', { class: 'sr-only', for: 'wingman-input', text: 'Message to Wingman' }),
      input,
      el('div', { class: 'chat__form-foot' }, [
        el('p', { class: 'meta', id: 'wingman-input-help', text: 'Enter sends. Shift and Enter starts a new line.' }),
        sendBtn
      ])
    ]);

    var suggestions = el('div', { class: 'chat__suggestions' }, [
      el('p', { class: 'chat__suggestions-label', id: 'suggestion-label', text: 'Or start with one of these' }),
      el('ul', { class: 'chat__suggestion-list', 'aria-labelledby': 'suggestion-label' },
        FB.fallback.SUGGESTED_PROMPTS.map(function (prompt) {
          return el('li', {}, el('button', {
            class: 'suggestion', type: 'button',
            onclick: function () { submit(prompt); }
          }, prompt));
        }))
    ]);

    paint();

    return el('div', { class: 'view view--wingman' }, [
      el('header', { class: 'wingman-head' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: 'Wingman' }),
          el('h1', { text: ctx.hasAnalysis ? 'Working from what you described' : 'Nothing to work from yet' }),
          el('p', { class: 'lede', text: ctx.hasAnalysis
            ? 'Wingman answers using your snapshot and your plan. It is not a therapist and it does not diagnose anything.'
            : 'Wingman is much more useful after a stress check, because it answers from your snapshot rather than in general.' })
        ]),
        el('button', {
          class: 'btn btn--text btn--small', type: 'button',
          onclick: function () {
            FB.components.confirmDialog({
              title: 'Reset this conversation?',
              body: 'The messages will be cleared from this page and from storage. Your stress check and plan are not affected.',
              confirmLabel: 'Reset conversation',
              onConfirm: function () {
                FB.state.resetChat();
                FB.components.toast('Conversation reset.');
              }
            });
          }
        }, 'Reset conversation')
      ]),

      ctx.hasAnalysis ? contextStrip() : el('div', { class: 'row row--start' }, [
        el('a', { class: 'btn btn--secondary btn--small', href: '#/stress-test' }, 'Run a stress check'),
        el('button', {
          class: 'btn btn--text btn--small', type: 'button',
          onclick: function () { FB.demo.start(); }
        }, 'Try the demo instead')
      ]),

      el('section', { class: 'chat' }, [
        listNode,
        typingNode,
        suggestions,
        form
      ]),

      chatPrivacyRow()
    ]);
  }

  function contextStrip() {
    var lines = FB.wingmanContext.summaryLines();
    return el('div', { class: 'context-strip' }, [
      el('h3', { class: 'sr-only', text: 'What Wingman is working from' }),
      el('dl', { class: 'context-strip__list' }, lines.map(function (line) {
        return el('div', { class: 'context-strip__item' }, [
          el('dt', { text: line.label }),
          el('dd', { text: line.value })
        ]);
      })),
      el('a', { class: 'btn btn--text btn--tiny', href: '#/snapshot' }, 'Full snapshot')
    ]);
  }

  function bubble(message) {
    var isUser = message.role === 'user';

    return el('article', {
      class: 'msg msg--' + (isUser ? 'user' : 'wingman')
    }, [
      el('h4', { class: 'sr-only', text: isUser ? 'You said' : 'Wingman said' }),
      el('div', { class: 'msg__body' }, message.text.split('\n').map(function (line) {
        return el('p', { text: line });
      })),
      !isUser && message.method && message.method !== 'opening'
        ? el('p', { class: 'msg__meta', text: methodLabel(message) })
        : null
    ]);
  }

  /**
   * The honest label. "on-device" means the embedding model chose the intent.
   * "rules" means the lexical matcher did. Neither means a model wrote the text.
   */
  function methodLabel(message) {
    if (message.method === 'error') return 'Error response';
    if (message.method === 'on-device') {
      var pct = typeof message.confidence === 'number' ? ' · similarity ' + message.confidence.toFixed(2) : '';
      return 'Intent matched on device' + pct + ' · reply composed from a written template';
    }
    return 'Intent matched by rules · reply composed from a written template';
  }

  function chatPrivacyRow() {
    var prefs = FB.state.get().prefs;
    var id = 'save-chat';
    var input = el('input', {
      type: 'checkbox', id: id, class: 'switch__input', checked: prefs.saveChat,
      onchange: function () {
        FB.state.setPref('saveChat', input.checked);
        FB.components.toast(input.checked
          ? 'This conversation will be kept in this browser.'
          : 'Saved conversation removed from this browser.');
      }
    });

    return el('div', { class: 'chat-privacy' }, [
      el('div', { class: 'switch' }, [
        input,
        el('label', { class: 'switch__label', for: id, text: 'Save this conversation on this device' })
      ]),
      el('p', { class: 'meta', text: 'Off by default. When it is off, the conversation is held in memory for this visit and is gone when you close the tab.' })
    ]);
  }

  FB.views = FB.views || {};
  FB.views.wingman = { title: 'Wingman', render: render };
})(window.FB = window.FB || {});
