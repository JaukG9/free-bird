# Free Bird

**Fly free, fly high.**

Free Bird turns a real stressful situation into a personalised Calm → Clarify → Act plan using private, on-device AI.

A student writes what is weighing on them in their own words. Free Bird analyses the language **in the browser**, identifies non-clinical stress signals, explains where the pressure appears to be coming from, builds a three-step plan out of a structured exercise library, and offers a contextual conversational companion called Wingman. Nothing the student writes is ever sent anywhere.

No backend. No API keys. No accounts. No build step. Open `index.html` and it runs.

---

## Table of contents

1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [Why AI is needed](#3-why-ai-is-needed)
4. [AI architecture](#4-ai-architecture)
5. [Local inference and the privacy model](#5-local-inference-and-the-privacy-model)
6. [Stress-signal taxonomy](#6-stress-signal-taxonomy)
7. [Safety architecture](#7-safety-architecture)
8. [Exercise recommendation system](#8-exercise-recommendation-system)
9. [Tech stack](#9-tech-stack)
10. [File structure](#10-file-structure)
11. [Local setup](#11-local-setup)
12. [GitHub Pages deployment](#12-github-pages-deployment)
13. [Testing](#13-testing)
14. [Evaluation methodology](#14-evaluation-methodology)
15. [Measured performance](#15-measured-performance)
16. [Demo mode](#16-demo-mode)
17. [Accessibility](#17-accessibility)
18. [Limitations](#18-limitations)
19. [Ethics and responsible AI](#19-ethics-and-responsible-ai)
20. [Future improvements](#20-future-improvements)
21. [Credits and attributions](#21-credits-and-attributions)
22. [Licensing](#22-licensing)

---

## 1. Problem

Ordinary student stress is high-volume and low-support. Exams stack up, applications have hard dates, extracurriculars overrun, friendships go quiet, and the work that would fix it is exactly the work that feels impossible to start.

The tools available fall into two groups, and both miss:

- **Generic wellness apps** offer the same breathing exercise regardless of whether you are avoiding an essay or worried about a friendship. They never engage with the actual situation.
- **General-purpose chatbots** will engage with the situation, but they send deeply personal text to a remote server, they have no structure, they will happily drift into territory they are not competent in, and a student is rarely told what happens to what they typed.

There is also a specific privacy problem. Mental-health-adjacent text is some of the most sensitive text a teenager will ever write. Sending it to a third-party API is a real cost, and most products do not treat it as one.

## 2. Solution

Free Bird is a single-purpose tool built around one loop:

```
STRESSOR
  → LOCAL AI UNDERSTANDING
    → STRESS SNAPSHOT
      → PERSONALISED CALM / CLARIFY / ACT PLAN
        → WINGMAN SUPPORT
          → CHECK-IN
            → LOCAL PROGRESS
```

What makes it different from a wellness app is that the plan is derived from what the student actually wrote. What makes it different from a chatbot is that it is structured, bounded, transparent about its own reasoning, and it never transmits the text.

**Calm** is a short physiological or grounding step, because the body settles faster than the thinking does. **Clarify** is a reflection step that makes the situation smaller and more specific. **Act** is one concrete move sized so it can genuinely happen today.

## 3. Why AI is needed

The honest test for any AI feature is whether a lookup table would do the same job. Here is where it would not:

- **Students do not describe stress in categories.** They write "every time I open the essay document I close it again after two minutes." Mapping that to *avoidance* rather than *deadline pressure* requires reading the sentence, not matching a dropdown.
- **The same words mean different things.** "I have three tests next week" is workload. "I have three tests next week and I have not started" is avoidance plus deadline pressure, and the right first step is different.
- **Phrasing varies without limit.** A hand-written rule list gets precision but loses recall on the hundreds of ways a person can express feeling behind. Sentence embeddings recover much of that recall.
- **Intent matters in conversation.** "That will not work" and "I already tried that" are the same intent with no shared words. Semantic matching handles that; keyword matching does not.

Equally, here is where AI is deliberately **not** used:

- **Safety detection is not a model.** It is a deterministic scan, so its behaviour is auditable, testable, and identical on every machine. A crisis check should never depend on whether a download succeeded.
- **Wingman's words are not generated.** Free Bird does not ship a generative language model. See [AI architecture](#4-ai-architecture) for why, and note that the interface says so on every message.

## 4. AI architecture

### 4.1 The pipeline

Order is fixed and enforced in `ai/pipeline.js`:

```
user text
  → validate            (ai/pipeline.js)
  → preprocess          (ai/normalize.js, ai/classifier.js)
  → SAFETY SCAN         (ai/safety.js)          ← blocking, deterministic, no model
  → lexical scoring     (ai/classifier.js)      ← always runs
  → semantic scoring    (ai/model.js + classifier)  ← only if the model is loaded
  → blended profile     (ai/classifier.js)
  → pressure estimate   (ai/classifier.js)
  → plan selection      (ai/recommendations.js)
  → Wingman context     (js/wingman-context.js)
```

The safety scan runs **before** any coaching output is produced. If it fires, the pipeline short-circuits and returns immediately with no profile, no score, and no plan.

### 4.2 Two scorers, one blend

Free Bird runs two independent classifiers over the same text and combines them explicitly.

**1. Lexical rule engine** (`ai/classifier.js`). Word-boundary regular expressions per signal, each with a hand-set weight from 1 to 3. Evidence per signal is summed, capped so a repeated word cannot dominate, then squashed with `x / (x + 4)` into a 0 to 1 score. Always available, needs no download, byte-for-byte reproducible.

**2. Semantic scorer** (`ai/model.js` + `ai/classifier.js`). The text is embedded with `Xenova/all-MiniLM-L6-v2` running in WebAssembly through Transformers.js. Each of the ten signals has four hand-written anchor phrases; their embeddings are averaged once at load time into a centroid. Classification is cosine similarity against those ten centroids, rescaled from the useful `[0.10, 0.60]` band onto `[0, 1]` and clamped. The rescale is a presentation transform, applied identically to every signal, so it never changes the ranking.

The blend is a documented constant:

```js
BLEND = { lexical: 0.55, semantic: 0.45 };
```

Lexical is weighted slightly higher because it is precise about the exact words the student used. The model contributes recall for phrasings the lexicon does not contain. When the model is not loaded, the semantic term is simply absent and the profile is tagged `source: "rules"`, which is what the interface displays.

**Free Bird never shows a model confidence when no model ran.** In offline coaching mode the snapshot says so in plain words.

### 4.3 Wingman

Wingman is the conversational surface, and its architecture is stated plainly in the interface because it would be easy to imply more than it does.

- The user's message is matched to one of **twenty-two intents** plus a general fallback.
- With the model loaded, matching is **embedding similarity** against per-intent anchor centroids, with a floor of 0.28 below which the general intent is returned instead of pretending to have understood.
- Without the model, matching is **lexical**, and no confidence figure is reported at all.
- The reply itself is **composed from a written template set**, filled with the live session context: the student's own subject phrase, pressure estimate, detected drivers, current plan step, completed exercises, and check-in state.

  A reply is assembled from four slots, each drawn from its own pool: **reflect** (say back what they wrote, using their nouns), **insight** (the observation this intent is worth making), **move** (one concrete action, sized to their pressure and deadline), and **ask** (a question that hands the turn back). A message reader pulls the task, the person, the deadline and any quantity out of the student's own sentence first, so a reply can say "write the one sentence you would say to your mum" rather than "speak to the person involved". Slot selection is deterministic from the intent, the turn, and a hash of the message, so the same input always reproduces exactly while real conversations vary widely. Before a reply is returned it is checked for at least one reference to the student's own session, and grounded if it has none.

  Two constraints worth naming. Patterns are matched against text that `ai/normalize.js` has already contracted, so they must be written in contracted form; there is a test that fails on the long form. And when a message asks whether Wingman is a therapist or a person, the refusal is not left to slot rotation, it short-circuits the pool.

Every Wingman message carries a label saying which matcher chose it: *"Intent matched on device · similarity 0.41 · reply composed from a written template"* or *"Intent matched by rules · reply composed from a written template."*

**Why no generative model?** A browser-runnable generative model small enough to ship (roughly 100 to 500 MB) produces text that is unreliable in exactly the domain where unreliability is most costly. A 23 MB embedding model does the part it is genuinely good at, and hand-written copy handles the part where a wrong sentence matters. This is a deliberate product decision, not a limitation we are hiding.

### 4.4 Graceful degradation

There are three states, shown in an unobtrusive header chip:

| Chip | Meaning |
| --- | --- |
| **Local AI active** | Model loaded, blended scoring, semantic intent matching |
| **Loading local AI** | Downloading in the background, the whole app remains usable |
| **Offline coaching mode** | Rule engine only. Every feature still works |

Offline coaching mode produces a full stress snapshot, a full intervention plan, a full Wingman conversation, and a full check-in. It is not a degraded shell; it is the same product with one of two scorers.

Loading never blocks first paint, is lazy, opt-in on first run, cancellable, retryable, and falls back to a second CDN build before giving up.

## 5. Local inference and the privacy model

> Free Bird is designed to keep your reflections on your device. The app does not require an account or a backend server.

Concretely, and verifiably:

- **There is no backend.** The repository is static files. There is nothing to send data to.
- **User text is never in a network request.** It is tokenised and embedded inside the page by WebAssembly.
- **The only network traffic is the model itself.** When you opt in, the Transformers.js library is fetched from `cdn.jsdelivr.net` and the model weights from the Hugging Face model CDN. Both are one-time asset downloads and neither carries your writing.
- **The model download is opt-in.** A first-run notice explains the roughly 25 MB cost and offers "Turn on local AI" or "Not now". Downloading tens of megabytes on a school connection should be a choice.
- **No analytics, no trackers, no advertising, no fonts from a CDN.** The typeface is a system font stack, so the app makes zero requests on a normal page load beyond its own files.
- **Storage is `localStorage` only**, under keys prefixed `freebird.v1.`, and the app degrades to in-memory storage if that is blocked.

### What is stored, and what is deliberately not

| Stored | Not stored |
| --- | --- |
| Preferences (motion, model consent, chat saving) | The sentence embedding (in memory only) |
| Current session: stressor text, profile, plan state, check-in | Raw chat, unless the user explicitly opts in |
| History: a short summary and before/after numbers | The stressor text in history entries |

Progress history stores the subject phrase and the drivers, never the paragraph the student wrote. Clearing a session does not leave the reflection behind.

**Clear all local data** in Settings removes every key beginning with `freebird.v1.` and nothing else, and reports how many items were removed.

### How to verify the privacy claim yourself

Open DevTools, go to the Network tab, filter to `Fetch/XHR`, run a stress check, and send a Wingman message. You should see no requests at all. For a stronger check, paste this into the console before using the app, then use it:

```js
window.__net = [];
const of = window.fetch;
window.fetch = function (i, init) {
  window.__net.push({ url: String(i && i.url || i), body: init && init.body ? String(init.body) : null });
  return of.apply(this, arguments);
};
// ...use the app, then:
window.__net.filter(r => r.body && r.body.includes('<a phrase you typed>'));  // expect []
```

This exact check was run during development with the model loaded: a full analysis plus a Wingman exchange produced **zero** network requests.

## 6. Stress-signal taxonomy

Ten **non-clinical** signals. They describe language, not people, and the interface always frames them as *"Free Bird noticed language that may reflect..."*.

| Signal | What the wording points at |
| --- | --- |
| `deadline-pressure` | A fixed date that is close, or closer than the work is ready for |
| `overwhelm` | The situation held as one large undivided thing |
| `uncertainty` | Not knowing what is required, what happens next, or how it lands |
| `avoidance` | Putting the task off, circling it, or not being able to begin |
| `rumination` | The same thoughts repeating without resolving |
| `fear-of-failure` | Falling short, being judged, an outcome that feels final |
| `social-pressure` | Other people: expectation, comparison, conflict, obligation |
| `workload-pressure` | Volume of commitments rather than a single task |
| `sleep-strain` | Short sleep, late nights, being worn down |
| `low-stress` | Nothing in the wording points at current pressure |

Separately, seven **thinking patterns** are matched deterministically and presented as observations about phrasing: all-or-nothing thinking, worst-case thinking, harsh self-talk, comparing to others, time scarcity, assuming what others think, carrying it alone.

### Language rules, enforced by tests

Free Bird says: *"Free Bird noticed language that may reflect deadline pressure."*
Free Bird never says: *"You have anxiety." / "You are depressed." / "You have a disorder."*

`tests/recommendation-tests.js` asserts that no snapshot copy matches a diagnostic-language pattern, and that no Wingman reply claims to be a therapist.

### The pressure estimate is arithmetic, not a prediction

The 1 to 10 number is a transparent sum of four inputs, and the snapshot shows the breakdown in an expandable table:

| Input | Range | Source |
| --- | --- | --- |
| Your own rating | 0 to 4.5 | The 1 to 5 slider, the single largest input |
| Wording | 0 to 3.2 | Strength of the top signals |
| Intensity words | -1 to 1.6 | Intensifiers and dampeners |
| Timing | 0 to 1.6 | How close the stated deadline is |

The page says plainly: *"This is a summary of what you told us and how the situation is worded. It is not a measurement of you, and it is not a clinical score."*

## 7. Safety architecture

`ai/safety.js` is a separate, deterministic module with **no model dependency**. It runs on every piece of user text, including every Wingman message, before any coaching output.

### Design

- Roughly 20 pattern groups across four categories: suicidal statements, self-harm, immediate danger or inability to stay safe, and threat to others.
- Two levels. `crisis` **halts the coaching flow entirely**. `concern` surfaces a supportive acknowledgement but allows the flow to continue, because the language points at strain rather than danger.
- A **hyperbole mask** blanks out common school idioms before matching, so "this course is killing me", "dying of boredom" and "I killed that presentation" do not fire.
- A **reporting-context step-down** reduces a crisis match to concern when the language is framed as being about another person or clearly in the past, so a student carrying a friend's disclosure still gets resources without being treated as in immediate danger themselves.

### What the safety screen does

Stops the normal flow. Shows no score, no analysis, no plan. Offers 988, Crisis Text Line, emergency services, a prompt to tell one trusted person, and an international pointer. States explicitly that Free Bird is not an emergency service and cannot contact anyone. Includes an expandable explanation of why the screen appeared, and a route back for someone who wants to write about something else.

While a crisis result is held, a route guard prevents every other screen from rendering.

### What it explicitly does not do

- **No numeric risk score.** Tests assert that the result object has no `score`, `risk`, or `probability` field.
- **No diagnosis.** No claim about the person at all.
- **No claim of completeness.** The source comments and the in-app explanation both state that pattern matching cannot detect crisis expressed indirectly, in metaphor, in another language, or in slang the list does not contain.

The error direction is chosen deliberately: showing support resources to someone who did not need them costs far less than missing someone who did.

## 8. Exercise recommendation system

**26 exercises** across five categories (Breathe, Ground, Reset, Think, Act), each mapped to a plan stage and a set of signals it is a reasonable answer to. Every exercise has a title, duration, one-line summary, a "why", numbered steps, an optional timer, a completion control, and an `evidenceNote` naming the practice family it comes from.

Selection is **fully deterministic**:

```
score = Σ (signal score for each profile signal the exercise addresses)
      + 0.35 if it addresses the primary signal
      + context adjustment (timeframe, topic, pressure band)
      - 0.5 if already completed in this plan
ties broken by library order
```

Context adjustments are small and explicit so the language signals stay dominant: a deadline of today favours exercises under three minutes; a topic of friends favours *One conversation* and *Controllable versus not*; a pressure estimate of 8 or more favours starting with something physical.

Each step carries a generated rationale explaining why *this* exercise for *this* profile, and any step can be swapped for the next-best alternatives for the same stage.

### On evidence claims

Exercises draw on widely taught stress-management practice: paced and extended-exhale breathing, sensory grounding, abbreviated progressive muscle relaxation, brief body scan from mindfulness-based stress reduction, evidence-checking and decatastrophising from cognitive behavioural skills training, control appraisal, self-compassion reframing, behavioural activation, task decomposition, implementation intentions, stimulus control, and sleep hygiene.

**Free Bird does not claim any of these is clinically proven for any individual.** `tests/recommendation-tests.js` fails the build if any exercise copy contains a clinical-efficacy claim. The in-app text says: *"Free Bird does not claim this will work for everyone."*

## 9. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Markup | Semantic HTML5, one page | Works from `file://` and from Pages |
| Styling | Hand-written CSS with custom properties | No framework, no build |
| Scripting | ES5-compatible classic scripts, `FB` namespace | Classic scripts load from `file://`; ES modules do not |
| Routing | Hash router | Pages has no rewrite rules, so `/plan` would 404 |
| ML runtime | Transformers.js (WebAssembly), lazy dynamic `import()` | Only ES-module usage in the project, and it is optional |
| Model | `Xenova/all-MiniLM-L6-v2`, quantised | ~23 MB, CPU-friendly, deterministic, 384 dimensions |
| Storage | `localStorage` with in-memory fallback | No server, no account |
| Charts | Inline SVG, hand-built | No charting dependency |
| Icons | Inline SVG | No icon font, no external request |
| Type | System font stack | Zero network requests, fast first paint |
| Tests | Custom harness, runs in browser and Node `vm` | No dependencies at all |

**Total runtime dependencies: zero.** `npm install` is not needed and there is no `package.json` to run.

## 10. File structure

```
.
├── index.html                  Single page, classic script tags in dependency order
├── styles.css                  Design system and all component styles
├── app.js                      Bootstrap: routes, guards, nav, error handling
│
├── ai/
│   ├── normalize.js            Shared text normalisation (contractions, quotes)
│   ├── classifier.js           Taxonomy, lexicon, semantic scoring, pressure estimate
│   ├── safety.js               Deterministic crisis scan (no model dependency)
│   ├── model.js                Transformers.js loader, embeddings, anchor centroids
│   ├── recommendations.js      Plan construction and snapshot language
│   ├── fallback.js             Wingman intents and template composition
│   └── pipeline.js             Orchestration and input validation
│
├── data/
│   ├── exercises.js            26-exercise library
│   ├── demo-data.js            Demo scenario, script, seeded history
│   └── evaluation-data.js      48 labelled cases (test input only, no results)
│
├── js/
│   ├── storage.js              localStorage layer with in-memory fallback
│   ├── state.js                Single store, explicit actions
│   ├── dom.js                  Element helpers, icons, focus trap, announcements
│   ├── components.js           Dialogs, meters, chips, exercise runner
│   ├── router.js               Hash router with guards
│   ├── wingman-context.js      Session context assembly
│   ├── demo.js                 Demo controller and presenter bar
│   └── views/
│       ├── home.js  stress-test.js  snapshot.js  plan.js
│       └── wingman.js  progress.js  about.js  safety-support.js
│
├── assets/
│   ├── logo.svg
│   └── illustrations/sky.svg
│
├── tests/
│   ├── index.html              Browser runner: tests + both evaluation modes
│   ├── run-node.js             Node runner, no dependencies
│   ├── test-harness.js         Tiny assertion framework
│   ├── classifier-tests.js     Preprocessing, scoring, patterns, pressure, validation
│   ├── safety-tests.js         Crisis language, hyperbole, pipeline blocking
│   ├── recommendation-tests.js Library integrity, plan construction, Wingman copy
│   └── evaluate.js             Metric computation and report formatting
│
├── .nojekyll                   Stops Pages running the files through Jekyll
└── README.md
```

## 11. Local setup

There is no build step and no dependency install.

**Option A, open the file.** Double-click `index.html`, or:

```bash
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

Everything works, including the full analysis, plan, Wingman, check-in and progress. The on-device model will **not** load from `file://` because the browser blocks module imports from a filesystem origin, so the app runs in Offline coaching mode. This is handled, not broken.

**Option B, a static server** (needed for the on-device model):

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`. Any static server works:

```bash
npx --yes http-server -p 4173 -c-1
```

## 12. GitHub Pages deployment

No build, no Actions workflow, no environment variables.

```bash
git init
git add .
git commit -m "Free Bird"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder: `/ (root)` → Save.**

The site is served at `https://<you>.github.io/<repo>/` within a minute or two.

Why it works unchanged:

- Every path in the project is **relative** (`js/state.js`, `assets/logo.svg`), so the repository-subpath prefix is irrelevant.
- Routing is **hash-based**, so there is no server-side routing to configure and deep links like `#/plan` resolve client-side.
- `.nojekyll` is present, so Pages serves the files as-is.
- There are **no secrets and no environment variables** anywhere in the project.

## 13. Testing

**In a browser:** open `tests/index.html` and press **Run tests**.

**In Node** (no dependencies, no install):

```bash
node tests/run-node.js
```

The Node runner loads the real application source into a `vm` context with a minimal `window`, so the code under test is the code that ships. The single shim is that `ai/model.js`'s CDN `import()` is replaced with a rejected promise, since downloading a model has no place in a test run. The effect is that Node always exercises the offline coaching path.

### Coverage

**121 tests, all passing.**

| Suite | Covers |
| --- | --- |
| Preprocessing | Whitespace, null/undefined, truncation, curly apostrophes |
| Lexical scoring | Score bounds, determinism, each signal, repeat capping, report limits |
| Pattern detection | Threshold behaviour, worst-case, comparison, cap of four |
| Pressure estimate | Bounds, slider monotonicity, timeframe effect, calm-entry clamp, breakdown shape |
| Semantic maths | Cosine identity, orthogonality, zero vector, blend weights sum to 1 |
| Input validation | Empty, whitespace, too short, too long, hard limit, non-string types |
| Safety, crisis | 12 crisis phrasings must all block |
| Safety, ordinary | 12 school-hyperbole phrasings must all pass |
| Safety, structure | No numeric score, case insensitivity, step-down, masking behaviour |
| Safety, pipeline | Blocking returns no plan and no pressure; Wingman messages are scanned too |
| Library integrity | Required fields, unique ids, valid categories/stages/signals, three-per-stage minimum |
| Content policy | **No clinical claims, no diagnostic language, no em dashes** in any user-facing copy |
| Plan construction | Three ordered stages, real exercise ids, rationales, determinism, profile adaptation |
| Wingman | A reply for every intent, variation across turns, determinism per turn, context usage, never claims to be a therapist |
| Wingman message reading | Task, person, deadline and quantity extraction; person echoed in the second person; never throws on unusual input |
| Wingman intent coverage | Every intent routes to itself, real student phrasings do not fall through to the generic bucket, patterns survive normalisation |
| Wingman reply quality | No repetition over six turns of one intent, quotes the user's wording, always ends answerable, grounded in the session, works with no session at all |

### Manual verification performed

Every primary flow was walked in a real browser during development: navigation and active states across all seven routes, form validation (empty, whitespace, too short, 3,540-character input), the full analysis → snapshot → plan → exercise → check-in → progress loop, Wingman with suggested prompts and free text, the crisis path including the route guard, demo mode end to end, data deletion, model loading and the offline fallback, mobile (375px), tablet (768px) and desktop (1280px) with no horizontal overflow on any route, keyboard-only dialog operation with the focus trap and focus restoration, and a console that stays clean throughout.

## 14. Evaluation methodology

### Dataset

`data/evaluation-data.js` contains **48 hand-written, hand-labelled cases** in the style of real input. Each carries the text, the structured context a user would have filled in, an expected primary signal, expected secondary signals, an expected pressure band, and an expected safety level.

Coverage: 3 to 6 cases per signal, 6 deliberately ambiguous mixed cases, 3 hyperbole cases that **must not** trigger the safety scan, and 5 cases that must trigger it.

**This file contains no results.** It is input only.

### Metrics computed

`tests/evaluate.js` computes, at run time:

- **Primary signal:** top-1 accuracy, per-class precision / recall / F1, macro and support-weighted averages, and a full confusion matrix.
- **Secondary signals:** recall of expected secondary signals within the reported set.
- **Pressure band:** exact accuracy, within-one-band accuracy, macro F1.
- **Safety:** accuracy, per-class precision / recall / F1, confusion matrix across `none` / `concern` / `crisis`.
- **Latency:** mean and max analysis time.
- **Every misclassification**, listed with its text, so failures are inspectable rather than aggregated away.

Cases the safety scan blocks are excluded from the signal and band metrics rather than counted as errors, because a blocked case produces no analysis by design.

### How to reproduce the numbers

**Rule-engine mode** (no download, works anywhere):

```bash
node tests/run-node.js --eval
```

Write the raw report to a file:

```bash
node tests/run-node.js --eval --json evaluation-report.json
```

**Blended mode** (needs the model, so it needs a browser):

1. Serve the project, e.g. `python3 -m http.server 4173`
2. Open `http://localhost:4173/tests/index.html`
3. Press **Load on-device model**, wait for it to report ready
4. Press **Run evaluation (blended)**

Both paths print the same report format. Nothing is cached; every figure comes from the run you start.

### Honest limitations of this evaluation

- **The dataset was written and labelled by the project author.** Labels produced by the same person who wrote the classifier will flatter the classifier. These figures are a **regression check**, not evidence of real-world accuracy.
- **48 cases is small.** Per-class figures rest on 3 to 6 examples each, so individual class numbers are noisy.
- **Several cases are genuinely ambiguous.** "Everything is due next week. Two essays, a presentation and a maths test" is defensibly deadline pressure *or* workload pressure. The label was chosen and left alone rather than adjusted to match the model.
- **There is no held-out test set** and no second annotator, so no inter-rater agreement is reported.
- **Self-reported change in the app is not an efficacy measure.** It is what a user said, stored locally, and the interface labels it exactly that way.

## 15. Measured performance

The figures below were produced by running the commands in the previous section on 2026-08-31. **Re-run them; they are not hardcoded anywhere in the application.**

### Rule engine only (`node tests/run-node.js --eval`)

| Metric | Result |
| --- | --- |
| Primary signal accuracy | **86.0%** (37/43) |
| Macro precision / recall / F1 | 91.0% / 89.0% / **88.4%** |
| Weighted F1 | 86.0% |
| Secondary signal recall | 41.0% (16/39) |
| Pressure band, exact | 60.5% |
| Pressure band, within one | **100.0%** |
| Safety accuracy | **100.0%** (48/48) |
| Safety macro F1 | 100.0% |
| Mean analysis latency | 0.5 ms |

### Blended, rule engine + on-device model (browser runner)

| Metric | Result |
| --- | --- |
| Primary signal accuracy | **86.0%** (37/43) |
| Macro precision / recall / F1 | 91.5% / 88.3% / **88.5%** |
| Weighted F1 | 86.1% |
| Secondary signal recall | **48.7%** (19/39) |
| Pressure band, exact | **74.4%** |
| Pressure band, within one | 100.0% |
| Safety accuracy | 100.0% (48/48) |
| Mean analysis latency | 30.7 ms (max 45 ms) |
| Model load time | ~3.8 s on a warm connection |

### Reading these results honestly

- **Top-1 accuracy is identical at 86.0% in both modes.** The embedding model does not improve which single signal wins. That is a real result and it is worth stating rather than burying: on clear cases, the lexicon already gets there.
- **The model earns its place on the nuanced parts.** Secondary-signal recall improves from 41.0% to 48.7%, and exact pressure-band accuracy improves from 60.5% to 74.4%. Those are the outputs that shape the plan and the Wingman context.
- **Secondary recall is low in both modes**, and the cause is structural rather than mysterious: the snapshot reports at most three signals while some cases are labelled with four. This is a deliberate interface constraint, and the metric correctly penalises it.
- **Safety scored 100% on all 48 cases.** This says the scan handles the cases in this small, author-written set, including all three hyperbole traps. **It does not mean the scan is reliable in the wild**, and it must not be read that way. See [Limitations](#18-limitations).
- **Latency is not a bottleneck.** Even blended, a full analysis runs in about 30 ms after load.

## 16. Demo mode

Built for a five-minute walkthrough. Press **Try a demo** anywhere.

The demo is not a set of fake screens. It feeds a fixed scenario through the **real pipeline**, with the semantic scorer forced off so the run is identical on every machine and needs no download before the presentation starts.

Scenario: *"I have three college application deadlines coming up and I keep putting everything off because I don't know where to start..."*

A presenter bar pins seven beats with **Back** / **Next**, so the walkthrough needs no notes:

| # | Beat | What it shows |
| --- | --- | --- |
| 1 | Analyse | The real pipeline on the scenario text |
| 2 | Stress snapshot | Pressure 7/10, three drivers, three patterns, and the number's breakdown |
| 3 | Calm / Clarify / Act | Paced breathing → Define good enough → Two-minute start, with per-step reasoning |
| 4 | Complete an exercise | The Calm step run end to end |
| 5 | Wingman | Three scripted messages through the real matcher and composer |
| 6 | Check-in | Self-reported change, 7 → 6 |
| 7 | Progress | Local history, before/after chart, category usage |

**Use live AI** re-runs the identical text through the on-device model, downloading it first if needed, while preserving the plan state and conversation already demonstrated. This is the moment to show the rule engine and the blended result side by side.

Demo history entries are tagged **Sample entry** in the interface and are removed by **Reset demo data** in Settings.

## 17. Accessibility

- Semantic HTML: one `<h1>` per view (verified across all seven routes), landmarks, real `<form>`, `<fieldset>`/`<legend>`, `<table>` with scoped headers.
- Full keyboard operation. Visible focus rings everywhere, never removed. Skip link to main content.
- Accessible dialogs: `role="dialog"`, `aria-modal`, labelled by title, focus trap verified over 12 tab presses, Escape to close, focus returned to the trigger (and redirected to `<main>` if the trigger was removed by a re-render).
- Accessible slider: native `<input type="range">` with a live `aria-valuetext` reading *"4 of 5, Very heavy"*.
- Chips are real radio inputs, so keyboard and screen-reader behaviour is standard rather than reinvented.
- Validation messages are wired with `aria-describedby`, announced via `role="alert"`, and written as sentences.
- Live region announces analysis results, step completion, and Wingman replies.
- **No colour-only information.** The pressure meter carries the number, the band word, and the filled marks. Chart series are labelled and the same figures are available as a table.
- **Contrast verified by measurement**, not by eye: every text node across all seven routes was checked against its computed background and all pass WCAG AA (4.5:1 for body text, 3:1 for large).
- **Touch targets** are at least 24px tall throughout, verified programmatically.
- Reduced motion honoured both from `prefers-reduced-motion` and from an independent in-app setting, which also removes the Wingman reply delay.
- Responsive from 320px up, with no horizontal overflow on any route at any tested width.

## 18. Limitations

Stated plainly, in the app as well as here.

**On the analysis**

- Free Bird reads wording. It can misread sarcasm, negation, slang it does not know, and anything written in a language other than English.
- Negation handling is limited. "I am not worried about the exam" may still match worry vocabulary.
- The pressure number is arithmetic over the user's own rating and their phrasing. It is not a measurement of a person.
- Signals are language observations, not diagnoses. Free Bird never claims to detect a condition.
- When evidence is thin, the snapshot says so rather than presenting a weak match confidently.

**On safety**

- The scan matches specific words and phrases. **It will miss crisis expressed indirectly, in metaphor, in another language, or in slang the list does not contain.**
- It will sometimes fire when there is no crisis. That direction of error is intentional.
- 100% on 48 author-written cases is not evidence of real-world reliability.
- Free Bird cannot contact anyone, cannot escalate, and cannot help in an emergency.

**On the product**

- Not a therapist, a diagnostic tool, a medical device, or an emergency service. It has not been clinically evaluated.
- Wingman does not generate language. It matches intent and composes from templates, which means it will not follow a genuinely novel conversational turn.
- Self-reported change is self-reported. It is not evidence the app works.
- Data lives in one browser. There is no sync, and clearing site data erases it with no recovery.
- The model download needs a network connection and roughly 25 MB the first time.
- Crisis resources are United States focused, with a single international pointer.

## 19. Ethics and responsible AI

**Do not overclaim.** The hardest engineering constraint here was resisting the temptation to make the AI look like more than it is. Concretely:

- The interface distinguishes **three** output types and labels each one: deterministic recommendations, classifier outputs, and rule-based fallbacks. Every Wingman message says which matcher chose it and that the words are composed from a template.
- **No fabricated confidence.** When no model ran, no model confidence is displayed anywhere. There is no invented percentage.
- **No fabricated metrics.** Nothing in this README is a number the code did not produce. Every figure in [Measured performance](#15-measured-performance) is reproducible with one command.
- **Transparent reasoning.** The pressure number shows its arithmetic. The signal scores are all inspectable. The safety screen explains why it appeared.

**Stay in scope.** Free Bird is for everyday student stress. It says what it is not, on the home page, in the footer, on the About page, and on the stress-check form. It routes out rather than engaging when the language suggests something serious.

**Safety before capability.** The crisis scan is deterministic and model-independent, so it behaves identically whether or not a 25 MB download succeeded. It runs before any coaching output. It has no numeric score, because a "suicide risk: 0.72" readout would be both clinically meaningless and actively harmful to show a teenager.

**Privacy as architecture, not policy.** The claim is enforceable because there is nowhere to send data. No backend exists, and the download is opt-in with the cost stated.

**Language that respects the reader.** Non-clinical, non-diagnostic, specific rather than motivational. The copy avoids "you are amazing and everything will be okay" in favour of "starting may feel hard because the whole task is showing up as one problem, so what is one part you could work on for ten minutes?" Tests enforce that no reply claims clinical authority.

**Known ethical gaps.** The evaluation is author-labelled with no independent annotation. The safety list is English-only and US-centric. Free Bird has not been tested with the population it is designed for, and a real deployment would need that before it went anywhere near students.

## 20. Future improvements

**Analysis.** Handle negation properly with a dependency-light scope heuristic. Expand the taxonomy with financial and family-responsibility pressure. Add a lightweight sentiment head for intensity rather than relying on intensifier words. Support multi-paragraph input with per-paragraph signals.

**Evaluation.** Recruit independent annotators and report inter-rater agreement. Build a held-out test set that no development touches. Grow to several hundred cases with genuine student input under ethical review. Add threshold sweeps for the report floor and blend weights instead of hand-set constants.

**Safety.** Have the pattern list reviewed by a clinician. Add a small, purpose-trained classifier as a **second layer that can only escalate**, never de-escalate below the deterministic scan. Localise resources by user-selected country, without geolocation.

**Product.** Let students save a plan as a printable page. Add optional local reminders. Support editing a stressor and re-analysing. Offer a weekly reflection that summarises local history. Add an exportable data file so students can move their own history between devices.

**Engineering.** Cache model weights in the Cache API for instant repeat loads. Add a service worker for full offline use. Explore ONNX quantisation to shrink the download further.

## 21. Credits and attributions

- **Transformers.js** by Hugging Face, loaded from `cdn.jsdelivr.net`, runs the model in the browser via WebAssembly. Apache-2.0.
- **all-MiniLM-L6-v2**, originally from the Sentence-Transformers project (UKPLab), converted for browser use by Xenova and distributed as `Xenova/all-MiniLM-L6-v2`. Apache-2.0.
- **Exercise content** was written for this project and draws on widely taught stress-management practice: paced and extended-exhale breathing, sensory grounding, abbreviated progressive muscle relaxation, brief body scan from mindfulness-based stress reduction, evidence-checking and decatastrophising from cognitive behavioural skills training, control appraisal, self-compassion reframing, behavioural activation, task decomposition, implementation intentions, stimulus control, and sleep hygiene. These are described as practice families, not as validated interventions.
- **Crisis resources**: the 988 Suicide and Crisis Lifeline, Crisis Text Line, and findahelpline.com. Free Bird has no affiliation with any of them.
- **Everything else** (design system, copy, taxonomy, lexicon, safety patterns, recommendation engine, test harness, evaluation framework) was written for this project.

No icon library, no CSS framework, no charting library, no fonts from a CDN.

## 22. Licensing

The project source is released under the **MIT License** (see `LICENSE`).

Third-party components keep their own licences: Transformers.js is Apache-2.0, and `Xenova/all-MiniLM-L6-v2` is Apache-2.0. Neither is vendored into this repository; both are fetched at runtime from a public CDN only after the user opts in.

Exercise text and interface copy are original to this project and covered by the same MIT licence.

---

**Free Bird is a student project. It is not a medical device, it has not been clinically evaluated, and it is not a substitute for a counsellor, a doctor, or a trusted adult. If you are in danger, contact your local emergency number. In the United States, call or text 988.**
