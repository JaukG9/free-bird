# Project Story

## About the project

**Free Bird** turns a real stressful situation into a personalised Calm → Clarify → Act plan, using AI that runs entirely inside the browser. A student writes what is weighing on them in their own words. Free Bird reads the language for non-clinical stress signals, explains where the pressure appears to be coming from, builds a three-step plan from a structured exercise library, and offers a contextual companion called Wingman.

Nothing the student writes is ever sent anywhere. There is no backend, no API key, no account, and no build step.

---

## Inspiration

The idea started with a specific, unglamorous observation: the moment a student most needs help is the moment they are least able to ask for it.

The scale turned out to be larger than I assumed. In the CDC's 2023 Youth Risk Behavior Survey, 40% of US high school students reported persistent feelings of sadness or hopelessness, up from 30% a decade earlier. That is not a clinical population. That is most of a hallway.

Exams stack up. Applications have hard dates. A friendship goes quiet and you cannot work out why. And the work that would actually fix any of it is precisely the work that feels impossible to begin. What you need at 11pm on a Tuesday is not a diagnosis and not a lecture. It is one small, specific thing you could plausibly do next.

I looked at what already exists and found that everything fell into two groups, and both missed:

- **Generic wellness apps** hand you the same breathing exercise whether you are avoiding an essay or worried about a friend. They never engage with the actual situation. The advice is not wrong, it is just not *about* you, and a student can tell within about ten seconds.
- **General-purpose chatbots** will absolutely engage with the situation, but they send some of the most personal text a teenager will ever write to a server they know nothing about. They have no structure, they drift into territory they are not competent in, and nobody tells you what happened to what you typed.

That second point is the one that stuck with me, and it is measurable rather than a hunch. A 2022 review of 578 mental health apps found 44% shared user data with third parties, and Mozilla's *Privacy Not Included* assessment flagged 28 of the 32 mental health apps it reviewed. For the single most sensitive category of text a teenager writes, that is the industry baseline.

Mental-health-adjacent writing is genuinely sensitive, and most products treat sending it to a third-party API as free. It is not free. It is the whole cost.

So the constraint came before the feature list: **whatever this is, the student's writing never leaves their device.** Every other decision in the project fell out of that one.

The name comes from the idea of getting unstuck. *Fly free, fly high.*

---

## What it does

One loop, and everything in the app serves it:

```
STRESSOR
  → LOCAL AI UNDERSTANDING
    → STRESS SNAPSHOT
      → PERSONALISED CALM / CLARIFY / ACT PLAN
        → WINGMAN SUPPORT
          → CHECK-IN
            → LOCAL PROGRESS
```

- **Calm** is a short physiological or grounding step, because the body settles faster than the thinking does.
- **Clarify** is a reflection step that makes the situation smaller and more specific than the version living in your head.
- **Act** is one concrete move, sized so it can genuinely happen today rather than in theory.

The **Stress Snapshot** is the part I am most attached to. It shows the pressure estimate *with a visible breakdown of where every point came from*, the signals it detected *with their scores*, and a line stating which engine produced them. You can open a panel and see every number. If the app is going to tell a stressed person something about their own situation, it owes them the receipts.

---

## How I built it

### The stack, and why it is so plain

Zero runtime dependencies. No framework, no bundler, no `package.json`. `index.html` opens and runs, from a web server or straight off the filesystem.

| Layer | Choice | Why |
| --- | --- | --- |
| Scripting | ES5-compatible classic scripts, one `FB` namespace | Classic scripts load from `file://`; ES modules do not |
| Routing | Hash router | GitHub Pages has no rewrite rules, so `/plan` would 404 |
| ML runtime | Transformers.js (WebAssembly), lazy dynamic `import()` | The only ES-module usage in the project, and it is optional |
| Model | `Xenova/all-MiniLM-L6-v2`, quantised | ~23 MB, CPU-friendly, 384 dimensions |
| Storage | `localStorage` with an in-memory fallback | No server, no account |
| Charts and icons | Hand-built inline SVG | No charting dependency, no icon font, no external request |
| Tests | Custom harness, runs in the browser and in Node's `vm` | No dependencies at all |

This was not minimalism for its own sake. Every dependency is a request, and every request is a place a promise about privacy can quietly break. The easiest way to guarantee the text never leaves is to build something with nowhere to send it.

### The AI architecture

The pipeline order is fixed and enforced in `ai/pipeline.js`:

```
user text
  → validate
    → preprocess
      → SAFETY SCAN          ← blocking, deterministic, runs before anything else
        → lexical scoring     ← always runs
          → semantic scoring  ← only if the on-device model is loaded
            → blended profile
              → pressure estimate
                → plan
```

Two decisions here mattered more than the rest.

**Safety is not a model.** The crisis scan is a deterministic pattern scan with no model dependency at all. It runs *before* any coaching output is chosen, and a blocking result short-circuits the entire pipeline. This means its behaviour is auditable, testable, and identical on every machine. A crisis check must never depend on whether a 23 MB download succeeded on school wifi.

**Wingman does not generate text.** This is the decision I expect to be questioned most, so it is worth being direct: Free Bird ships no generative language model. Wingman's replies are composed from a structured template system, filled with the student's own session context and the wording of the message they just sent. What the on-device model contributes is *intent matching*: your message is embedded and compared against anchor phrases.

The interface says so under every single reply. "Intent matched on device · reply composed from a written template." I would rather ship something that is honest about being a compositional system than something that implies a language model wrote it.

### Making Wingman not feel like a lookup table

The first version of Wingman kept two or three finished paragraphs per intent and cycled between them. It failed in two ways that were obvious the moment I used it for real:

1. It repeated itself within about four messages.
2. It ignored everything in the message except which bucket it landed in. "My mum keeps asking about my SAT score" and "my friend group has gone weird" produced the same paragraph.

So I rebuilt it. A reply is now assembled from four slots, each drawn from its own pool:

- **reflect** — say back what they actually wrote, using their nouns
- **insight** — the observation this intent is worth making
- **move** — one concrete action, sized to their pressure and their deadline
- **ask** — a question that hands the turn back

Slots are selected deterministically from the intent, the turn, and a hash of the message, so the same input always produces the same reply (which the tests and the scripted demo depend on) while real conversations vary widely. There is a message reader that pulls the task, the person, the deadline and the quantity out of the student's own sentence, so a reply can say "write the one sentence you would say to your mum" rather than "speak to the person involved."

Before any reply goes out it is checked for at least one reference to the student's own session, and grounded if it has none. A reply that could have been written for anybody is the exact failure mode the whole file exists to avoid, so it is checked rather than assumed.

### Testing something with no dependencies

There is a custom test harness that runs both in the browser and under Node's `vm`, loading the application source exactly as the browser loads it. There is also an evaluation runner over an author-written labelled dataset.

There are two labelled sets, kept deliberately apart. The **development set** was written alongside the classifier, so it can only tell me whether a change broke something. The **held-out set** was written after the classifier was finished and never used to tune it, so it is the one that estimates real behaviour.

| Metric | Development set | Held-out set |
| --- | --- | --- |
| Primary signal accuracy | 88.4% (38/43) | 82.5% (33/40) |
| Macro F1 | 90.3% | 82.5% |
| Secondary signal recall | 41.0% | 19.2% |
| Pressure band, exact | 65.1% | 42.5% |
| Pressure band, within one | 100.0% | 97.5% |
| Safety accuracy | 100.0% (48/48) | 100.0% (48/48) |

Building that second set was the most useful thing I did on this project, and it is covered properly in the challenges section below, because the first run of it failed badly.

I also want to be honest about the on-device model: **it does not improve top-1 accuracy at all.** On clear cases the hand-built lexicon already gets there. The model earns its place on secondary signals and pressure calibration, which are the outputs that actually shape the plan. That is a less flattering result than "AI made it better" and it is the true one.

---

## Challenges I ran into

**Making a privacy promise that is actually checkable.** Saying "your data never leaves your device" is easy. Making it verifiable is not. It meant no CDN fonts, no analytics, no icon fonts, no external stylesheets, and inline SVG for everything. The one remote request in the entire application is the optional model download, it is gated behind an explicit choice, and the student's text is never part of it. You can open DevTools, filter to Fetch/XHR, use the entire app, and see nothing.

**The 23 MB question.** An on-device model is a real download on a school connection. Making it automatic would have been a quiet cost imposed on someone who did not agree to it. So the app works completely without it, says so, and asks once. The header chip always states which mode you are in, and the snapshot never claims a model confidence when no model ran.

**Hyperbole nearly broke the safety scan.** Students write "this chemistry course is killing me" and "I was dying of boredom" and "I absolutely killed that presentation." An early version of the crisis scan flagged all of them. A tool that panics at ordinary teenage speech is worse than useless, because it teaches you not to write honestly in it. The fix was a masking pass that neutralises hyperbole spans before the crisis patterns run, plus a set of test cases specifically for ordinary language that must *not* flag. All 48 safety cases pass, including every hyperbole trap.

**Two tabs quietly disagreeing.** Free Bird persists to `localStorage`, and I found that two open tabs would drift apart: finishing a plan in one left the other showing stale state until it was reloaded, and then they wrote over each other. Fixing it properly meant a `storage` event listener that adopts another tab's writes, plus coalescing state notifications so one user action results in exactly one paint of the finished state rather than three paints of half-applied state.

**Progress lying about progress.** The Progress page only filled in after a check-in was recorded. So you could run a stress check, complete all three exercises, open Progress, and be told nothing had happened. Technically correct, since nothing had been *recorded*. Completely wrong as an experience. It now shows the session in flight, clearly labelled as not yet recorded, and moves it into the timeline when you check in.

**The held-out set failed, and it was the best thing that happened to the project.** I had been quoting 86% accuracy for weeks. Then I wrote 48 fresh cases after the classifier was finished, deliberately messier and more lowercase than the development set, and ran them.

It scored **27.5%**.

Not a scoring bug. Coverage. Scores are `total / (total + 4)`, so clearing the reporting floor needs at least one solid keyword match, and my fresh phrasings frequently matched nothing at all and fell through to "low stress". The system had learned my writing habits, not the problem. Worse, **two crisis phrasings were missed entirely**, and both were the same bug: the normaliser contracts "was not" to "wasn't" before the safety scan runs, so any pattern written in the long form was dead code that could never match. That had caused a missed crisis detection, which is the most serious failure this project can have.

Fixing it properly meant resisting the obvious shortcut. I could have pasted the failing sentences into the lexicon and watched the number go green; my first attempt at the patch did exactly that, and I threw it away, because memorising the test set fixes the score without fixing the product. What went in instead were *constructions*: sentence shapes students reach for generally. Held-out accuracy went from 27.5% to 82.5%, and the development set improved too, from 86.0% to 88.4%, which is the signature of a genuine recall fix rather than memorisation.

The uncomfortable part is that the held-out set is now burned. I looked at it while fixing the thing it exposed, so 82.5% is optimistic by an unknown amount. I report it that way, because a burned held-out number is still far more informative than a development-set number, and pretending otherwise would repeat the exact mistake the set was built to catch.

**Knowing where to stop.** The hardest calls were about what *not* to build. Not a mood tracker. Not streaks. Not a diagnosis. Not a chatbot that will discuss anything. Free Bird says it is not a therapist, not a diagnosis, and not an emergency service, in the footer, on the form, and in Wingman's own replies. Every exercise names the practice family it comes from and none of them claim to be clinically proven. There is a test that fails the build if any user-facing string makes a clinical claim.

---

## What I learned

**Transparency is a feature, not a disclaimer.** I expected the "where this number came from" panel to be a compliance box. It turned out to be the thing that makes the pressure estimate trustworthy. Showing a stressed person your working is not a hedge, it is respect.

**The honest test for an AI feature is whether a lookup table would do the same job.** Applying that test rigorously meant *removing* AI in two places, safety and reply generation, and keeping it in two places, signal recall and intent matching, where the recall genuinely could not be hand-written. Being able to say exactly where the model earns its keep is more valuable than being able to say "powered by AI."

**Measuring your own system will embarrass you, and you should publish it anyway.** The evaluation told me the model does not improve top-1 accuracy, and the held-out set told me my headline figure had been inflated by 58 points. Both were unpleasant and both were worth more than any feature I shipped. A number you cannot interrogate is decoration.

**A test set you wrote while building is not a test set.** It is a regression check, and it is valuable as one, but it cannot tell you how the system behaves on wording it has never seen. I now think the single highest-leverage hour on a project like this is the one spent writing evaluation cases *after* you stop coding, in a different mood, deliberately messier than feels fair.

**Accessibility rewrites your components, not your CSS.** Real radio inputs under the chip styling. `aria-describedby` wired to the field so a screen reader hears the error at the right moment. Focus traps verified over twelve tab presses. Two "Clear" buttons on one page needing distinct accessible names. None of that is a stylesheet change, and all of it was cheaper to do while building than to retrofit.

**Constraints are generative.** "No backend" forced local-first. "No dependencies" forced hand-built SVG charts that are smaller and more accessible than a library would have given me. "No generative model" forced a compositional reply engine that I can actually test, and being forced to test it is what surfaced a whole class of bug where regular expressions were written against text the normaliser had already rewritten.

---

## What's next

- **A second held-out set, written by someone who has not seen the current lexicon.** The existing one is burned and its 82.5% should be treated as an upper bound.
- **Independent labels.** `tests/label.html` presents either dataset with no labels visible and reports Cohen's kappa against the stored answers. Running it with two or three other people would convert the biggest remaining caveat into a number.
- More languages. The lexicon and safety patterns are English-only today, which is a real limitation rather than a nice-to-have.
- An export path so a student can take a summary to a counsellor if they choose to, without that ever being automatic.
- Optional on-device summarisation, still local, still gated behind an explicit choice, still labelled honestly.

---

> **Free Bird is a student project. It is not a medical device, it has not been clinically evaluated, and it is not a substitute for a counsellor, a doctor, or a trusted adult. If you are in danger, contact your local emergency number. In the United States, call or text 988.**
