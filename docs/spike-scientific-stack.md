# Spike: the scientific stack in the browser

The brief asks for a `micropip` availability spike at the start of Phase 7,
before any Track B content is written. This is that spike.

**Headline: the premise was wrong in a useful way.** `micropip` is not the
mechanism, the packages are already available, and the real problem is not
availability but _bytes_ — which is a design question, not a technical one, and
it has a pedagogically natural answer.

## 1. Availability: confirmed, and not via micropip

Every package Track B could plausibly want is already in the Pyodide
distribution's own registry, built for this exact interpreter
(CPython 3.14.2, wasm32, ABI `2026_0`):

| Package        | Version in Pyodide 314.0.6 |
| -------------- | -------------------------- |
| `numpy`        | 2.4.6                      |
| `pandas`       | 3.0.2                      |
| `scipy`        | 1.18.0                     |
| `matplotlib`   | 3.10.8                     |
| `statsmodels`  | 0.14.6                     |
| `scikit-learn` | 1.8.0                      |

Read from `pyodide-lock.json` in the installed npm package, which is the same
registry the runtime resolves against — so this is the actual answer for the
version we ship, not a claim about Pyodide in general.

**This means `loadPackage`, not `micropip`.** The distinction matters more than
it sounds:

|                    | `micropip.install(...)`                    | `pyodide.loadPackage(...)`                |
| ------------------ | ------------------------------------------ | ----------------------------------------- |
| Fetches from       | PyPI, at runtime                           | the same `indexURL` as the interpreter    |
| Suitable for       | pure-Python wheels                         | the compiled wasm wheels we actually need |
| Version pinning    | resolved live; can drift                   | pinned to the interpreter's own lockfile  |
| New network origin | yes — `pypi.org`, `files.pythonhosted.org` | no                                        |

Three consequences follow, and all three are wins:

- **No CSP change.** The wheels come from the origin already allowed in
  `connect-src` (`deployment.md`). Adding PyPI would have meant permitting a
  second third-party origin from a page that runs untrusted code — precisely
  the thing the policy exists to prevent.
- **No new supply-chain surface.** Same origin, same pinned version, already
  reasoned about in `architecture.md` §1.1.
- **Self-hosting keeps working.** `PYODIDE_INDEX_URL=/pyodide/` continues to
  serve everything, provided the wheels are copied alongside — see §5.

## 2. What each stack actually costs to assemble

Dependency closures, computed from the lockfile:

| Stack                             | Wheels | Closure                                                                              |
| --------------------------------- | -----: | ------------------------------------------------------------------------------------ |
| `pandas`                          |      5 | numpy, pandas, python-dateutil, pytz, six                                            |
| `pandas` + `scipy`                |      6 | + scipy                                                                              |
| `pandas` + `scipy` + `matplotlib` |     14 | + contourpy, cycler, fonttools, kiwisolver, matplotlib, packaging, pillow, pyparsing |
| + `statsmodels`                   |     16 | + patsy, statsmodels                                                                 |

The jump from 6 to 14 is entirely matplotlib's font, image and geometry
dependencies. That is the shape of the cost, and it is worth knowing before
deciding a plot belongs in Module 12 rather than Module 15.

### Byte cost — **not measured, and that is a real gap**

This environment's egress policy blocks `cdn.jsdelivr.net`, so the wheels could
not be fetched and their sizes are unverified. Rather than paste plausible
numbers, what is known for certain:

- `scipy` is the largest single package in the Pyodide distribution by a wide
  margin, and it alone exceeds the ~14 MB interpreter.
- The full four-package stack is several times the interpreter — the dominant
  cost of Track B, by an order of magnitude over anything else on the page.

**This must be measured before Track B ships.** The order of magnitude is not in
doubt and is enough to decide the design below; the exact figure is needed for
`performance.md` and for the bandwidth arithmetic in `deployment.md`. Measuring
it needs one run in an environment that can reach the CDN.

## 3. Decision: packages are staged per module, not loaded up front

Loading the whole stack when a learner opens the first Track B lesson would mean
tens of megabytes before they have read a sentence — worse than the Track A cold
start by an order of magnitude, and spent largely on tools that module does not
use.

So **each exercise declares the packages it needs**, and the runtime loads only
those, only when that exercise is reached. The cost is then spread across weeks
of study and each learner pays only for what they actually get to.

The pleasing part is that this is not a compromise imposed by the bytes. It is
what the pedagogy wanted anyway. The brief's own Track B sequence is _"computing
statistics by hand and then with the standard tools"_, so:

| Module | Needs             | Why                                                                  |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 11     | `pandas`          | Loading and cleaning tabular data                                    |
| 12     | `pandas`          | Describing data — the summary statistics are written by hand first   |
| 13     | `pandas`, `scipy` | Comparing two groups; `scipy.stats` arrives with the first real test |

A learner meets scipy at the moment a t-test stops being something they compute
by hand — which is exactly when the download is justified to them, and when they
can tell what it bought.

matplotlib is deliberately deferred past the seed modules. It is the single
biggest marginal cost (8 extra wheels) and the plotting modules are 14–16.

## 4. Verifying Track B content without a browser

Track A's guarantee is that every authored reference solution is executed
against its own checks in a real interpreter, in CI. Track B cannot have exactly
that here: the wasm wheels are unreachable, so neither the local Pyodide runner
nor the self-hosting end-to-end suite can run a pandas exercise.

The substitute is CPython. `harness.py` is pure Python and already runs in two
places by design (browser and Node); running it in a third — CPython with real
`pandas` and `scipy` installed — verifies the thing most likely to be wrong,
which is the _content_: does the reference solution actually satisfy the checks
the author wrote?

The version skew is small enough to be worth stating:

| Package | Pyodide | CPython used for verification |
| ------- | ------- | ----------------------------- |
| numpy   | 2.4.6   | 2.4.6                         |
| pandas  | 3.0.2   | 3.0.5                         |
| scipy   | 1.18.0  | 1.17.1                        |

**What this does not prove:** that the wheels load in a browser, that
`loadPackage` resolves them, that they fit in the worker's memory, or that a
scipy call behaves identically under wasm. Those need one run against a
reachable CDN, and they are the same gap as the unmeasured bytes in §2.

## 5. Follow-ups this spike creates

- **Measure the wheels** against a reachable CDN and fill in §2. Blocks the
  bandwidth arithmetic in `deployment.md`.
- **Run one Track B exercise in a real browser.** Blocks nothing in authoring,
  but must happen before Track B is announced to anyone.
- **Teach `sync-pyodide.mjs` to copy the wheels** when self-hosting. Today it
  copies the interpreter only, so `PYODIDE_INDEX_URL=/pyodide/` would serve a
  distribution whose registry lists packages it cannot deliver. Needs network to
  fetch them in the first place, so it is written but unexercised here.
- **Decide matplotlib's module** when Phase 8 reaches plotting, with §2's real
  numbers in hand rather than this document's order-of-magnitude claim.

## 6. What was built on the strength of this

For the record, since a spike that changes the plan should say what the plan
became:

- `packages` on an exercise (`content/schema.py`), validated against an
  `ALLOWED_PACKAGES` allow-list. Each entry there is a bandwidth decision
  someone made on purpose; the web content tests separately cross-check that
  list against `pyodide-lock.json`, which is the only place that knows what the
  shipped interpreter actually has.
- `loadPackage` in the worker, with a `loading-packages` / `packages-loaded`
  message pair. The pair exists because the run timeout asks "has this program
  stopped making progress", and a multi-megabyte download is not an answer to
  that question — without it a scipy fetch would trip the five-second budget and
  be reported to the learner as an infinite loop in code that had not begun
  executing. The learner also gets a message naming the pause.
- Modules 11–13, whose exercises declare `pandas` (11, 12) and `scipy` (13),
  matching the staging in §3. Every exercise that computes a statistic by hand
  declares nothing at all and runs in plain Python.
