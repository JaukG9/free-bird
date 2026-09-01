/**
 * How it works: the model card, in the product.
 *
 * A README explains the architecture to someone who has already decided to
 * read the repository. This page explains it to the person using the app, and
 * to anyone evaluating it, without either of them leaving the page they are on.
 *
 * Everything stated here is checkable somewhere else in the repository, and the
 * page links to the place. Nothing on it is a claim the code does not support.
 */
(function (FB) {
  'use strict';

  var el = FB.dom.el;
  var svgNS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var node = document.createElementNS(svgNS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function svgText(x, y, text, cls, anchor) {
    var node = svg('text', {
      x: x, y: y, class: cls || 'diagram__label',
      'text-anchor': anchor || 'middle'
    });
    node.textContent = text;
    return node;
  }

  /**
   * The pipeline, drawn rather than described.
   *
   * The two things worth seeing at a glance are that the safety scan sits on
   * the main path before any coaching output exists, and that the model sits
   * on a branch that can be absent without stopping the flow.
   */
  function pipelineDiagram() {
    var root = svg('svg', {
      viewBox: '0 0 720 300',
      class: 'diagram',
      role: 'img',
      'aria-label': 'The Free Bird analysis pipeline. User text is validated and preprocessed, then passed to a deterministic safety scan. A blocking result goes straight to the support screen and no plan is produced. Otherwise the text is scored by the rule engine, which always runs, and optionally by an on-device embedding model when it has been loaded. The two score sets are blended into a stress profile, which produces a pressure estimate and a three step plan.'
    });

    function box(x, y, w, h, label, sub, cls) {
      var g = svg('g', {});
      g.appendChild(svg('rect', { x: x, y: y, width: w, height: h, rx: 6, class: 'diagram__box ' + (cls || '') }));
      g.appendChild(svgText(x + w / 2, y + (sub ? h / 2 - 2 : h / 2 + 4), label, 'diagram__label'));
      if (sub) g.appendChild(svgText(x + w / 2, y + h / 2 + 13, sub, 'diagram__sub'));
      root.appendChild(g);
      return g;
    }

    function arrow(x1, y1, x2, y2, dashed) {
      root.appendChild(svg('path', {
        d: 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2,
        class: 'diagram__arrow' + (dashed ? ' diagram__arrow--dashed' : '')
      }));
    }

    var marker = svg('marker', {
      id: 'fb-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5',
      markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse'
    });
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'diagram__head' }));
    var defs = svg('defs', {});
    defs.appendChild(marker);
    root.appendChild(defs);

    // Main path
    box(10, 120, 96, 46, 'Your text', 'never sent');
    arrow(106, 143, 140, 143);
    box(140, 120, 96, 46, 'Validate', 'and clean');
    arrow(236, 143, 270, 143);
    box(270, 112, 110, 62, 'Safety scan', 'deterministic', 'diagram__box--safety');

    // Safety branch, upward
    arrow(325, 112, 325, 74);
    box(258, 34, 134, 40, 'Support screen', 'no plan produced', 'diagram__box--stop');

    arrow(380, 143, 414, 143);
    box(414, 120, 104, 46, 'Rule engine', 'always runs');

    // Model branch, downward and back
    arrow(466, 166, 466, 206, true);
    box(400, 206, 132, 44, 'On-device model', 'optional, 23 MB', 'diagram__box--optional');
    arrow(532, 228, 566, 228, true);

    arrow(518, 143, 566, 143);
    box(566, 112, 144, 62, 'Blended profile', 'pressure + plan');
    arrow(638, 206, 638, 174, true);

    root.appendChild(svgText(325, 96, 'if crisis language', 'diagram__note'));
    root.appendChild(svgText(466, 268, 'if loaded and allowed', 'diagram__note'));

    return root;
  }

  function fact(term, detail) {
    return el('div', { class: 'modelcard__row' }, [
      el('dt', { class: 'modelcard__term', text: term }),
      el('dd', { class: 'modelcard__detail', text: detail })
    ]);
  }

  function render() {
    return el('div', { class: 'view view--how' }, [
      FB.components.sectionHeading(
        'How it works',
        'The whole system, on one page',
        'Free Bird tries to be checkable rather than impressive. Everything below can be verified in the repository or by opening your own developer tools.'
      ),

      el('section', { class: 'panel' }, [
        el('h3', { class: 'panel__title', text: 'The pipeline' }),
        el('p', { class: 'panel__lede', text: 'Order is fixed and enforced in one file, ai/pipeline.js. Two properties of this diagram are the ones that matter.' }),
        el('div', { class: 'diagram__wrap' }, pipelineDiagram()),
        el('ul', { class: 'plainlist' }, [
          el('li', {}, [
            el('strong', { text: 'The safety scan runs before any coaching output exists. ' }),
            el('span', { text: 'It is a deterministic pattern scan with no model dependency, so it behaves identically on every machine and cannot be affected by a failed download. A blocking result stops the pipeline: there is no score and no plan on that path, by design.' })
          ]),
          el('li', {}, [
            el('strong', { text: 'The model sits on a branch, not on the main path. ' }),
            el('span', { text: 'The rule engine always runs. The embedding model contributes only when it has been downloaded and you have said yes. If it is absent, everything still works, and the interface says which mode produced your result.' })
          ])
        ])
      ]),

      el('section', { class: 'panel' }, [
        el('h3', { class: 'panel__title', text: 'Where AI is used, and where it is deliberately not' }),
        el('div', { class: 'twocol' }, [
          el('div', {}, [
            el('h4', { class: 'twocol__head', text: 'Used' }),
            el('ul', { class: 'plainlist' }, [
              el('li', { text: 'Recovering the many ways a student can express the same pressure. A hand-written rule list has good precision and poor recall; sentence embeddings recover much of that recall.' }),
              el('li', { text: 'Matching what you say to Wingman to an intent. "That will not work" and "I already tried that" mean the same thing and share no words.' })
            ])
          ]),
          el('div', {}, [
            el('h4', { class: 'twocol__head', text: 'Not used' }),
            el('ul', { class: 'plainlist' }, [
              el('li', { text: 'Crisis detection. A safety check should be auditable and identical everywhere, so it is deterministic rules with no model in the path.' }),
              el('li', { text: 'Writing Wingman’s replies. Free Bird ships no generative language model. Replies are composed from a written template set using your session context, and every message says so.' })
            ])
          ])
        ]),
        el('p', { class: 'meta', text: 'The test for any AI feature here was whether a lookup table would do the same job. Where it would, there is a lookup table.' })
      ]),

      el('section', { class: 'panel' }, [
        el('h3', { class: 'panel__title', text: 'Model card' }),
        el('dl', { class: 'modelcard' }, [
          fact('Model', 'Xenova/all-MiniLM-L6-v2, quantised. 384 dimensions, roughly 23 MB.'),
          fact('Runtime', 'Transformers.js on WebAssembly, loaded by dynamic import only after you opt in.'),
          fact('Task', 'Sentence embedding for similarity scoring. It classifies nothing on its own and generates no text.'),
          fact('Training data', 'Not trained by this project. It is used as published, with no fine-tuning, so its biases are those of its original corpus.'),
          fact('Inputs', 'The text you type, on your device only. No request carries it anywhere.'),
          fact('Outputs', 'Similarity scores blended with the rule engine to rank stress signals and match Wingman intents.'),
          fact('Out of scope', 'Diagnosis, risk prediction, clinical measurement, and crisis detection. None of these are things this system does.'),
          fact('Failure modes', 'Sarcasm, heavy metaphor, code-switching, and languages other than English are all handled poorly. Unusual phrasing tends to score low rather than wrong, which shows up as a low-stress reading.')
        ])
      ]),

      el('section', { class: 'panel' }, [
        el('h3', { class: 'panel__title', text: 'How it is evaluated' }),
        el('p', { text: 'Two labelled sets, kept apart on purpose. The development set was written alongside the classifier, so it can only tell you whether a change broke something. The held-out set was written after the classifier was finished and never used to tune it, so it is the one that estimates how the system behaves on wording it has not seen.' }),
        el('p', { text: 'The gap between the two is reported rather than smoothed over. Building the held-out set is what exposed a large recall problem in the rule engine, and two crisis phrasings the safety scan was missing. Both were fixed, and the fact that the fix used the held-out set is recorded, because it makes the current held-out figure optimistic.' }),
        el('div', { class: 'row' }, [
          el('a', { class: 'btn btn--secondary btn--small', href: 'tests/index.html' }, 'Run the evaluation yourself'),
          el('a', { class: 'btn btn--text btn--small', href: 'tests/label.html' }, 'Label the data blind')
        ]),
        el('p', { class: 'meta', text: 'Both open the real runners. Every figure they show is computed in your browser at the moment you press the button, from the same files this page is running on.' })
      ]),

      el('section', { class: 'panel panel--quiet' }, [
        el('h3', { class: 'panel__title', text: 'Check the privacy claim yourself' }),
        el('p', { text: 'Open your browser’s developer tools, go to the Network tab, filter to Fetch or XHR, and then use Free Bird normally. Run a stress check, talk to Wingman, finish a plan.' }),
        el('p', { text: 'You will see no requests at all. The only network request this application can make is the optional model download, which happens once, only if you agree to it, and never contains anything you wrote.' }),
        el('div', { class: 'row' }, [
          el('a', { class: 'btn btn--text btn--small', href: '#/safety' }, 'Safety, data, and settings'),
          el('a', { class: 'btn btn--text btn--small', href: '#/progress' }, 'See or delete your data')
        ])
      ])
    ]);
  }

  FB.views = FB.views || {};
  FB.views.howItWorks = { title: 'How it works', render: render };
})(window.FB = window.FB || {});
