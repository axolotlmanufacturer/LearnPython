# Performance

The MVP acceptance criterion in §11 asks for Core Web Vitals to be documented.
This is that document. The numbers are re-measured on every CI run by
`apps/web/e2e/performance.spec.ts`, and the run fails if they leave the band.

## The honest headline

**The app is not the problem, and optimising it further would be theatre.** A
lesson page ships ~367 kB and paints in ~200 ms. The Python interpreter is
~14 MB. It outweighs everything else on the page by a factor of forty, and every
performance decision that matters on this platform is about _when_ that download
happens rather than how large the app bundle is.

So the work here went into one property — that the interpreter is fetched on
approach and not on arrival — and the rest is a set of tripwires to stop the app
quietly getting worse.

## Measured

A representative run. Chromium, production build, local server.

| Page       | LCP    | CLS   | TTFB   | Transferred | of which JS |
| ---------- | ------ | ----- | ------ | ----------- | ----------- |
| Landing    | 92 ms  | 0.000 | 5 ms   | 157 kB      | 139 kB      |
| Curriculum | 148 ms | 0.000 | 73 ms  | 167 kB      | 139 kB      |
| Module     | 76 ms  | 0.000 | 15 ms  | 160 kB      | 139 kB      |
| Lesson     | 200 ms | 0.000 | 104 ms | 367 kB      | 344 kB      |

Warm start to graded result — clicking Run on an interpreter that has had a
moment to warm up, through to a graded pass: **~2.4 s**.

Figures exclude the interpreter itself, which is accounted for separately below.
Folding a 14 MB constant into the page total would hide every change to the
app's own payload behind one number.

### What these numbers are worth

A headless browser against a server on the same machine. No network latency, no
CPU contention, no mobile throttling. **The absolute timings are optimistic by a
wide margin** and should not be quoted as what a learner experiences.

What the measurement is genuinely good for:

- **CLS is real.** Layout shift is caused by markup — an image without
  dimensions, a late-injected banner — and transfers essentially unchanged to
  any environment. Zero across every page is a meaningful result and it is
  asserted at Google's actual "good" threshold rather than a relaxed one.
- **Bytes are real.** Bytes shipped are bytes shipped.
- **Timings are a tripwire, not a claim.** LCP is asserted at 2500 ms, which
  against a local server is enormous. Anything approaching it means something is
  structurally wrong — a render-blocking script, a server fetch on the critical
  path — which is what the assertion is for.

## The interpreter

| Asset               | Size   |
| ------------------- | ------ |
| `pyodide.asm.wasm`  | 9.2 MB |
| `python_stdlib.zip` | 2.5 MB |
| `pyodide.asm.mjs`   | 1.2 MB |
| Everything else     | ~1 MB  |

Fetched once per version and then cached for a year, from a CDN by default
(`architecture.md` §1.1). Three things keep it off the critical path:

1. **Nothing loads it until an exercise is near the viewport.** An
   `IntersectionObserver` with a 300 px margin starts the download as the first
   exercise card approaches, so the transfer overlaps with the learner reading
   the lesson above it. A module page, which has no exercises, never touches it.
2. **One interpreter per page, not one per exercise.** A lesson has several
   exercises and they share a single worker.
3. **It is never on the render path.** It loads into a worker; the page is
   interactive throughout, and the editor works before Python exists.

The suite asserts _both halves_ of point 1 — nothing fetched on load, and the
fetch definitely started once an exercise came into view. Asserting only the
first half would pass equally well if the warm-up were silently broken, which
would cost every learner the full cold start at their first Run.

### Cost to a learner, estimated

Not measured here, since this environment has no representative network. On a
50 Mbit connection the distribution is roughly 2–3 s of download plus ~2 s of
initialisation, once, overlapped with reading. On a 5 Mbit connection it is
closer to 25 s, which is why the UI says _"Starting Python in your browser… this
happens once and takes a few seconds"_ rather than showing an undifferentiated
spinner, and why the load timeout is 90 s rather than something tidier.

## Budgets, and why they sit where they do

| Budget         | Value     | Reasoning                                                                                                                                                         |
| -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLS            | ≤ 0.10    | Google's "good" threshold, asserted at its real value because the measurement is trustworthy                                                                      |
| LCP            | ≤ 2500 ms | Tripwire for structural regressions, not a performance claim                                                                                                      |
| App JavaScript | ≤ 700 kB  | Roughly double the current lesson page. Wide enough not to block ordinary work, tight enough that adding a heavy dependency is a decision rather than an accident |

The JS budget deserves a note: the lesson page's 344 kB is mostly CodeMirror and
its Python grammar, which is why CodeMirror was chosen over Monaco in the first
place (Section 4.2) — Monaco is several times the size, on a page that is already
carrying a WebAssembly runtime.

## Deliberately not done

- **Code-splitting the editor.** It would move ~200 kB off the initial parse of
  a page whose LCP is already 200 ms, and the editor is the point of the page —
  deferring it means a visible empty box where the code should be. Cost without
  benefit.
- **Preloading the interpreter on the curriculum page.** Tempting, and wrong: it
  spends 14 MB of someone's data on a guess that they will open a lesson.
- **A service worker.** The interpreter is already cached for a year by HTTP
  caching. A service worker would add an offline story and a cache-invalidation
  problem; the first is a real want and belongs in its own decision, not
  smuggled in as a performance change.
