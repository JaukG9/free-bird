# Free Bird demo guide

Two things live here:

- **[Part 1: 15 screenshots](#part-1-the-15-screenshots)** — the shots that give someone a complete understanding of the app, with exact steps to reach each one.
- **[Part 2: demo video flow](#part-2-demo-video-flow)** — a 60 second script built on the structure of Base44's "It's App to You" campaign.

Before either, get into a clean state:

```bash
python -m http.server 4188
```

Then open `http://localhost:4188`, open DevTools console, and run `localStorage.clear()` before you start capturing.

---

## Part 1: the 15 screenshots

Capture in this order. Shots 1 to 12 tell the product story end to end; 13 to 15 are the credibility shots that separate this from a wellness app.

The fastest way to reach a populated state is the demo: click **Try a demo** on the home page. It feeds a fixed scenario ("three college application deadlines...") through the real pipeline, so nothing you photograph is mocked.

| # | Shot | How to get there | Why it belongs in the set |
| --- | --- | --- | --- |
| 1 | **Home, first visit** | `#/home` with empty storage | Hero, tagline, and the "No account. No server. Your writing stays in this browser." line. This is the promise the whole project is built on. |
| 2 | **The on-device AI choice** | Same screen, top notice bar | Shows the 23 MB download is opt-in and asked once, not imposed. Capture before dismissing it. |
| 3 | **Stress check form** | `#/stress-test` | The single free-text box, the optional topic and timeframe chips, and the pressure slider. Shows input is one honest paragraph, not a questionnaire. |
| 4 | **Form filled in** | Type a real scenario, set topic and pressure | Proves the input is natural language. Use the demo text or your own. |
| 5 | **Stress snapshot, top** | Submit, lands on `#/snapshot` | The headline, the quoted stressor, the pressure meter, and the detected drivers. The core payoff shot. |
| 6 | **"Where this number came from"** | On the snapshot, expand the disclosure under the pressure meter | A table showing every input and the points it contributed. This is the transparency shot. Judges look for it. |
| 7 | **"Show every signal score"** | Expand the disclosure lower on the snapshot | Every signal with its score bar, plus the line saying which engine produced them. Shows the app never hides its reasoning. |
| 8 | **The plan** | `#/plan` | Calm → Clarify → Act, each with the *reason* that step was chosen for this profile, plus durations and the progress bar. |
| 9 | **An exercise running** | On the plan, click **Start** on any step | The exercise dialog: what it is, why it helps, numbered steps, and the practice family it comes from. |
| 10 | **Swapping a step** | On an incomplete step, click **Swap this step** | Alternatives ranked for the same profile. Shows the plan is a recommendation, not a prescription. |
| 11 | **Wingman conversation** | `#/wingman` after a stress check | The context strip (Situation, Pressure, Main driver, Next step) above a real exchange. Send two or three messages first. |
| 12 | **Wingman's honesty label** | Zoom into the line under any Wingman reply | "Intent matched by rules · reply composed from a written template." The single most important detail in the app. |
| 13 | **Check-in** | Complete all three steps on `#/plan` | The five-point self-reported change scale and the optional note. Shows outcomes come from the student, not the app. |
| 14 | **Progress** | `#/progress` after a check-in | The before/after chart, "what you reach for most", the timeline, and the **Clear my data** control. Capture with the demo history seeded so the chart has shape. |
| 15 | **Safety redirect** | On `#/stress-test`, submit text containing crisis language | The scan pauses the whole flow, shows no score and no plan, and lists real resources. **The most important shot in the set.** |

### Three optional extras, if you have room

| # | Shot | How | Why |
| --- | --- | --- | --- |
| 16 | **Progress mid-session** | Run a stress check, complete one step, go to `#/progress` | The "Happening now / Not recorded yet" panel. Shows the app tells the truth about state it has not saved. |
| 17 | **Demo mode bar** | Click **Try a demo** | The seven-step walkthrough bar with **Use live AI**, which re-runs the same text through the on-device model. |
| 18 | **Test runner** | `http://localhost:4188/tests/index.html`, click **Run tests** | 121 passing tests with no dependencies, including the safety hyperbole cases. |

### Capture notes

- Use a **1440px wide** window for desktop shots. Take 3, 8 and 11 again at **390px** if you want mobile coverage.
- For shot 15, use wording that clearly triggers the scan. Do **not** use a real personal crisis statement.
- The header chip always shows the current mode. Decide whether you want "Offline coaching mode" or the on-device model loaded, and keep it consistent across the set.
- Shots 6, 7, 10 and 12 are the ones that distinguish this from a generic wellness app. If you can only submit five images, use 5, 6, 8, 12 and 15.

---

## Part 2: demo video flow

### What the Base44 ad actually does

Base44's Super Bowl spot, "It's App to You," deliberately avoids being a feature tour. It dramatises the moment a person realises **"I just built this"** — the builder's high — and then shows that feeling spreading from person to person. The pitch is not *here is what the product does*. It is *here is who you become when you use it*.

Three structural moves worth stealing:

1. **Open on the human, not the interface.** The problem is a feeling, and it is shown, not narrated.
2. **The product appears as a turning point, not a subject.** Screen time is short and consequential.
3. **Close on the feeling, not the feature list.** The last beat is the emotional payoff, and it invites the viewer to imagine themselves in it.

### The Free Bird translation

The Base44 moment is *"I just built this."* The Free Bird moment is:

> **"I know what to do next."**

That is the beat everything else serves. Not "look at the pressure meter." The instant a student stops spiralling and has one specific, doable thing in front of them.

### 60 second script

Run the demo (**Try a demo** on the home page) so every screen is real. Nothing below is mocked.

| Time | Visual | Audio / on-screen text |
| --- | --- | --- |
| **0:00–0:06** | Close on a student at a desk, late. Laptop open. They open a document, look at it, close it. Open it again. Close it. No app on screen yet. | *No voiceover.* Just room tone and a keyboard. |
| **0:06–0:12** | Hold on their face. Cut to the essay document title: "Common App Essay - FINAL - v7". | **VO:** "You already know what you should be doing." |
| **0:12–0:18** | They type into Free Bird. Real typing, real sentence: *"I have three college application deadlines and I keep putting everything off because I don't know where to start."* | **VO:** "That was never the problem." |
| **0:18–0:22** | Click **Analyse this**. Snapshot resolves on *"A plan for three college application deadlines"*. Pressure meter lands on **7/10**. Drivers appear: *A date that is close · Difficulty getting started · Running low on rest.* | **VO:** "Free Bird reads what you actually wrote." |
| **0:22–0:28** | Expand **"Where this number came from."** Scroll the breakdown table slowly. | **VO:** "And it shows you exactly how it got there." |
| **0:28–0:36** | Cut to the plan. Three cards land in sequence: **Calm — Paced breathing, 2 min**, **Clarify — Define good enough, 5 min**, **Act — Two-minute start, 2 min**, each with its reason line. | **VO:** "Not a breathing exercise for everyone. Three steps, for this." |
| **0:36–0:42** | They click **Start** on the Calm step. Exercise dialog opens. Cut to their shoulders dropping. Genuinely small moment. | *No voiceover.* Let it breathe. |
| **0:42–0:48** | Wingman. They type *"I still can't make myself start."* Reply appears, referencing their own words and their next step. Camera pushes in on the label underneath. | **VO:** "It talks to you about your situation. And it tells you what it is." |
| **0:48–0:52** | Freeze on the label under the reply. Hold long enough to read it. | **VO:** "No language model wrote that. It says so." |
| **0:52–0:56** | Fast cut: DevTools Network tab open, filtered to Fetch/XHR. Empty. Zero requests. | **VO:** "And nothing you wrote left this device. You can check." |
| **0:56–1:00** | Back to the student. They close the laptop, pick up a pen, and start. Cut to black. Logo: **Free Bird — Fly free, fly high.** | **VO:** "You don't need to fix everything tonight. You need to know what's next." |

### Alternative 30 second cut

If you need a shorter version, keep only these beats:

1. **0:00–0:05** — Opening and closing the document. No voiceover.
2. **0:05–0:11** — Typing the real sentence. *"You already know what you should be doing. That was never the problem."*
3. **0:11–0:17** — Snapshot resolving, drivers appearing. *"Free Bird reads what you actually wrote."*
4. **0:17–0:24** — The three plan cards landing. *"Three steps. For this."*
5. **0:24–0:28** — Network tab, empty. *"And none of it left your device."*
6. **0:28–0:30** — Laptop closes, pen picks up. Logo.

### Production notes

- **Record the app at 1440px** and crop in, rather than recording small and scaling up. Text legibility is the whole point of shots 5 and 8.
- **Do not speed-ramp the analysis.** It genuinely takes about 30ms. Showing it at real speed is more impressive than a fake loading spinner, and it is honest.
- **The Network tab shot is your strongest single claim.** Give it a full four seconds and make sure the filter is visibly set to Fetch/XHR so it does not look staged.
- **Cast someone who reads as a student.** The Base44 ad works because the person on screen is plausibly the viewer.
- **The label at 0:48 has two forms, and both are correct.** With no model loaded you get *"Intent matched by rules · reply composed from a written template."* After **Turn on local AI**, you get *"Intent matched on device · similarity 0.4x · reply composed from a written template."* The on-device version is the stronger shot because it names the model's actual job, so load the model before recording that beat. Whichever you use, the second half of the sentence is the point.
- **Do not show the safety screen in the ad cut.** It is essential in the README, the screenshots, and any technical walkthrough, but a 60 second promo is the wrong frame for it. If you need a version for judges rather than an audience, add a 10 second beat after 0:52 showing the scan pausing the flow, with the line: *"And when it is more than a study plan can hold, it stops and says so."*
- **Never fake a result.** Every number on screen should come from the real pipeline. If a take produces a different pressure estimate, use that take.

---

**Sources for the Base44 campaign structure:**

- [Base44 Super Bowl 2026 Ad Review — "It's App to You"](https://dailycommercials.com/base44-super-bowl-2026-ad-review-its-app-to-you-and-the-future-of-ai-powered-building/)
- [Introducing Base44's Super Bowl Teaser: "It's App to You"](https://finviz.com/news/291601/introducing-base44s-super-bowl-teaser-its-app-to-you)
