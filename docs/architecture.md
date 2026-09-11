# Architecture Note

Status: accepted for Phases 0–5 (Track A complete; review and recognition built)
Last updated: Phase 5

This note confirms — or, where it deviates, justifies a deviation from — the stack
proposed in Section 4 of the product brief and the schema sketched in Section 7. It is
written to be read before the code, and it records the reasoning behind decisions that
would be expensive to reverse later.

---

## 1. Confirmed: in-browser execution via Pyodide (Section 4.1)

**Decision: confirmed, unchanged.** Learner code runs in the browser, compiled to
WebAssembly, inside a dedicated Web Worker. No server-side execution of untrusted code
exists anywhere in this repository, and none may be added without an explicit,
documented decision (this is an MVP acceptance criterion, Section 11).

The brief's reasoning holds and is not restated here. Three implementation consequences
follow from it:

1. **The worker is the security boundary and the interruption mechanism.** A beginner
   writing `while True:` is not an edge case, it is a certainty. The only mechanism that
   reliably stops a runaway loop in Pyodide without cooperation from the running code is
   terminating the worker from the main thread — so wall-clock timeout enforcement lives
   on the main thread (`PyodideRunner`), not inside the worker.
2. **Execution sits behind an interface.** All callers depend on the `PythonRunner`
   interface (`apps/web/src/lib/python/types.ts`), never on Pyodide directly. If the
   platform later needs real filesystem interaction, multi-file projects, or networked
   code — the triggers named in Section 4.1 — a server-sandbox implementation can be
   substituted without touching the lesson or exercise UI.
3. **The grading harness is Python, not TypeScript.** See §3.

### 1.1 Where the Pyodide distribution is fetched from

**Decided by the product owner: the platform must run on free hosting tiers, so
the distribution is fetched from a CDN by default.** Self-hosting remains
supported behind one environment variable. This reverses an earlier decision in
this document, and both sides of it are kept here because the reasoning on the
losing side is still true — it was outweighed, not refuted.

The deciding number is bandwidth. The distribution is ~14 MB per cold load
(9.2 MB WASM, 2.5 MB stdlib zip, 1.2 MB glue), against a typical free-tier
allowance of 100 GB/month. Self-hosted, that allowance is **about 7,000
first-time learners a month and nothing else** — spent on people who may bounce
before writing a line of Python. jsDelivr serves the official Pyodide builds free
and unmetered, so putting the distribution there is the difference between "runs
on a free tier" and "does not".

What was given up, and how far it is mitigated:

- **Supply-chain surface.** The distribution _is_ the code execution environment;
  a substituted asset would run in every learner's browser with their session in
  scope. Mitigated, not eliminated: the URL is pinned to an exact version, and
  that version is read from the installed npm package by `next.config.mjs` at
  build time rather than written by hand — so the CDN cannot serve an
  interpreter that CI never graded against, and the pin cannot drift from
  `package-lock.json`. Residual risk: jsDelivr's own integrity.
- **Version coherence with tests.** Preserved by the same build-time pin. The
  npm package still supplies the Node test runner (§3), and the browser is now
  pinned to that package's version rather than to a floating tag.
- **Restricted networks.** Not mitigated. Some corporate and school networks —
  including the environment this repository was developed in — block public CDNs
  outright, and learners behind them will see the runtime fail to start. They get
  an explanation rather than a blank pane, but they cannot run code. Such a
  deployment sets `PYODIDE_INDEX_URL=/pyodide/` and accepts the bandwidth.
- **Future cross-origin isolation.** If COOP/COEP is ever enabled for a
  `SharedArrayBuffer` interrupt buffer (§1.2), CDN assets need correct CORP
  headers where same-origin assets would not. A reason to self-host on the day
  that happens, not before.

`PYODIDE_INDEX_URL` controls both halves at once: unset, the build skips copying
14 MB it will never serve; set to `/pyodide/`, the build copies the distribution
and the app fetches it from our origin. Local development, unit tests and the
end-to-end suite all self-host — working offline should be possible, and CI must
not depend on a third party being up to decide whether the build is green. The
code path exercised is identical either way. See `deployment.md`.

**Still open for Track B (Phase 7):** third-party wheels (`numpy`, `pandas`,
`scipy`, `matplotlib`) are not in the npm package and are fetched by `micropip`
at runtime. With the CDN as the default this is no longer a conflict — the wheels
come from the same place as the interpreter — but it is still tens of megabytes
per learner who reaches Track B, and still needs the availability spike the brief
asks for at the start of Phase 7.

### 1.2 Timeout mechanism: worker termination, not an interrupt buffer

Two ways to stop runaway learner code:

| Mechanism                                          | Works everywhere                            | Cost after a timeout                                             |
| -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `worker.terminate()` from main thread              | Yes                                         | Worker is destroyed; next run pays a full Pyodide re-init (~2 s) |
| `pyodide.setInterruptBuffer()` (SharedArrayBuffer) | Only under COOP/COEP cross-origin isolation | Near-zero; interpreter survives as a `KeyboardInterrupt`         |

We implement termination for the MVP. It is unconditional — it cannot be defeated by the
learner's code, it needs no special response headers, and cross-origin isolation would
constrain every third-party embed the marketing site might later want. The ~2 s penalty
is paid only on an actual timeout, which is a _teaching moment_ the UI treats as such
("your program was still running after 5 seconds — this usually means a loop never
ends"), not a hot path. We mitigate the visible cost by pre-warming a replacement worker
immediately after a termination. The interrupt-buffer path is the documented upgrade if
timeouts ever become frequent enough to matter.

### 1.3 The worker is a served module, not a bundled chunk

Found while getting the end-to-end suite green, and recorded because it is not
guessable from the outside: `new Worker(new URL("./worker.ts", import.meta.url),
{ type: "module" })` produces a **classic** worker under the bundler, and Pyodide
refuses to initialise in one — `Classic web workers are not supported`.

So `src/lib/python/worker.js` is plain JavaScript, copied verbatim to
`public/python/worker.js` by the same script that publishes the Pyodide assets
and `harness.py`, and loaded as a real module worker from our own origin. This
also removes the bundler from a path where its output _format_ is load-bearing.
The file has no dependency on application code, so there is nothing to bundle;
its message protocol stays typed on the main-thread side in `protocol.ts`.

A related trap in the same area: Pyodide locates its own assets with
`new URL(file, indexURL)`, and a path-only base such as `/pyodide/` is not a
valid base for that **inside a worker**, though it works on the main thread.
`PyodideRunner` therefore resolves its URLs to absolute ones before handing them
over. Both faults are invisible to unit tests and to a Node-side runner, which is
exactly why the Playwright suite drives a real browser (Section 10).

---

## 2. Confirmed stack (Section 4.2), with versions and two notes

| Layer     | Choice                                                   | Note                                                                                                                                                                                                |
| --------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend  | Next.js (App Router) + React + TypeScript                | As proposed. Static lesson content server-rendered; interactive shells are client components.                                                                                                       |
| Editor    | CodeMirror 6 (`@uiw/react-codemirror`)                   | As proposed, and for the stated reason — Monaco's weight is hard to justify on top of a 14 MB WASM payload. Its accessibility defaults are also closer to the WCAG 2.1 AA requirement in Section 8. |
| Execution | Pyodide in a Web Worker                                  | See §1.                                                                                                                                                                                             |
| Backend   | FastAPI (async)                                          | As proposed. Serves auth, progress, and curriculum. Never learner code.                                                                                                                             |
| Database  | PostgreSQL + SQLAlchemy 2.x (async, `asyncpg`) + Alembic | As proposed. See §4 on the ORM choice.                                                                                                                                                              |
| Auth      | Email/password, argon2, session cookie                   | See §5 — this is the one place we deviate from the brief's specific suggestion.                                                                                                                     |
| Content   | Markdown + YAML files in `content/`, loaded into the DB  | As proposed, and load-bearing — see §3.                                                                                                                                                             |

**Styling:** Tailwind CSS. Not specified in the brief; low cost to change; chosen for
speed of iteration on a design-light MVP.

**Monorepo tooling:** npm workspaces, not Turborepo/Nx. There are two apps and one shared
content directory; a build-graph tool would be ceremony without payoff at this size.

---

## 3. The grading harness is a single Python module, run in two places

This is the most consequential design decision in the repository that the brief does not
prescribe, so it is recorded here in full.

Section 4.3 requires automated grading of learner code against hidden test cases.
Section 10 separately requires _content tests_: every authored exercise's own reference
solution must pass its own test cases in CI, so an unsolvable exercise can never ship.

The naive implementation writes grading twice — once in the browser worker, once in a
CI-side checker — and the two drift. Instead:

- `apps/web/src/lib/python/harness.py` is the **only** implementation of grading
  semantics. It is plain Python: it executes learner code in a fresh namespace with
  stdout/stderr captured and stdin stubbed, evaluates each declared check, and returns a
  JSON-serialisable result.
- In the browser, the Web Worker loads that file into Pyodide and calls it.
- In CI, a Node test runner loads Pyodide from the _same npm package_ and calls the
  _same file_ — for both the engine's unit tests and the per-exercise content tests.

A learner therefore cannot encounter grading behaviour that CI has not exercised, and an
exercise cannot be published whose reference solution fails. The Node-side runner
(`apps/web/src/lib/python/nodeRunner.ts`) is a second implementation of the `PythonRunner`
interface from §1 — the same abstraction that keeps a future server sandbox swappable.

### 3.1 Check kinds

Test cases are declared as data in the exercise YAML. The vocabulary is deliberately
small, and each kind exists because a specific pedagogical need required it:

| Kind     | Checks                                                                            | Needed for                                                                                  |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `stdout` | Printed output matches (exact, normalised, or `contains`)                         | Modules 0–3, before functions exist — the only observable behaviour a beginner's script has |
| `call`   | Calling a named function with given args returns an expected value                | Module 6 onward                                                                             |
| `expr`   | A Python expression evaluated after the learner's code is truthy / equals a value | Checking variables and data structures without dictating how they were built                |
| `source` | The learner's _source_ satisfies a constraint (e.g. "uses a `for` loop")          | Exercises whose point is the technique, not the output                                      |

`call` and `expr` accept a `tolerance` for float comparison, which Track B's statistical
exercises will require. Every check carries a `label` written for a learner, because the
label is what the feedback pane shows.

### 3.2 Errors are translated, never merely surfaced

Section 2 (principle 3) and Section 4.3 require plain-language explanation of _why_
something failed. `apps/web/src/lib/python/errorMapping.ts` maps an exception type and
message to a beginner-oriented explanation and a suggested next action, keyed on the
patterns beginners actually hit (`NameError` from a typo or a missing quote,
`IndentationError`, `TypeError` from `int` + `str`, `SyntaxError` from `=` used as `==`).
The raw traceback is always rendered too, underneath the explanation — the goal is
learners who eventually read tracebacks unaided, not learners insulated from them.

This mapping is pure TypeScript with no Pyodide dependency, so it is cheap to unit-test
exhaustively and is the natural place to accumulate patterns as we observe real learner
failures.

---

## 4. Data model (Section 7): confirmed, with three additions

The entities in Section 7 are implemented as specified. Three deliberate additions:

1. **`Track`** — Section 5A introduces a second curriculum (Track B) with a stated
   prerequisite on the first. Modelling tracks as a first-class table now, while there is
   no data to migrate, is materially cheaper than retrofitting one in Phase 7.
2. **`slug` on every content entity, unique within its parent** — content lives in files
   and is loaded into the DB (Section 4.2). Database integer IDs are assigned at load
   time and are not stable across a rebuild, so content files must reference each other,
   and URLs must address lessons, by a human-authored stable key.
3. **`content_hash` on `Module`/`Lesson`/`Exercise`** — makes the file→DB load idempotent
   and lets a re-load skip unchanged records, which keeps the loader usable as a
   deploy-time step rather than a manual migration.

Two clarifications of the sketch:

- `Progress` is stored per-lesson, with module-level status derived. Storing both invites
  the two disagreeing.
- `Exercise.test_cases` is a JSON column holding the check list from §3.1. It is
  validated against a Pydantic schema at _load_ time, so a malformed exercise fails the
  content load in CI rather than at a learner's keystroke.

Hidden test cases are never sent to the browser as part of the public curriculum payload;
they are delivered with the exercise only when a learner opens it, and the reference
solution is never sent at all.

---

## 5. Deviation: auth uses argon2 + signed session cookies, not FastAPI-Users

The brief says "avoid hand-rolling auth" and suggests FastAPI-Users or Auth.js. We take
the intent — _do not invent cryptography or session protocols_ — and implement it with
vetted primitives rather than an auth framework:

- Password hashing: `argon2-cffi` (Argon2id, library defaults), never a bare hash.
- Sessions: opaque random session tokens, stored hashed in Postgres, delivered in an
  `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie.

Reasoning for the deviation:

- FastAPI-Users would own the `User` model and much of the request lifecycle to provide
  register/login/reset/verify. For an MVP whose auth requirement is exactly
  "register, log in, stay logged in", that is a large and opinionated dependency for a
  small requirement — and it is a dependency that is awkward to remove later precisely
  because it owns the user model.
- Server-side opaque sessions are _simpler_ than the JWT flows these libraries default to,
  and strictly better here: revocation is a row delete, and there is no token-expiry or
  refresh-rotation logic to get subtly wrong.
- Nothing cryptographic is invented. The hashing is Argon2id via a maintained library;
  the tokens are `secrets.token_urlsafe`; the cookie flags are the standard set.

**When to revisit:** the moment OAuth (Section 6) is actually scheduled. Adding a
provider by hand _would_ be hand-rolling a protocol, and at that point the right move is
to adopt Auth.js on the Next.js side and have it delegate to this session store — which
the opaque-session design accommodates and a JWT design would not, as cleanly.

This deviation is flagged rather than absorbed silently, per Section 12.

---

## 5.1 Quiz items are graded on the server; exercises are not

Exercises are graded in the browser because that is where the Python interpreter is
(§1, §3). It would be easy to read that as a general principle and grade quiz items the
same way. It is not one, and they are not.

An exercise check needs a Python runtime and the learner's program. A quiz answer needs a
string comparison. Only the first is forced into the browser, so only the first pays the
price of having its expected results visible there.

So `GET /api/quiz/due` omits `answer` and `explanation_markdown` entirely, and
`POST /api/quiz/attempts` returns them alongside the verdict. §8 records that the platform
issues no assessment, which is why visible exercise checks are acceptable — but "nobody is
being certified" is an argument about cheating, and this is not about cheating. An answer
sitting in a network response spoils the first attempt for a learner who was not looking
for it, and retrieval practice with the answer already read is not retrieval practice.
It costs nothing to withhold, so it is withheld.

Server-side grading also means the _recorded_ attempt is the server's verdict rather than
the client's claim, which keeps the review schedule honest without any additional
machinery. Submissions, by contrast, record a `passed` the browser reports — unavoidably,
and noted where it happens.

## 5.2 Review scheduling: Leitner doubling, not SM-2

`app/spaced_repetition.py` doubles the interval on a correct answer, resets to one day on
a wrong one, and caps at 64 days.

SM-2 and its descendants were considered. Both halves of what makes them better fit
poorly here:

- Their ease factor is driven by a self-reported recall grade ("again / hard / good /
  easy"). Our items are objectively scored, so there is no confidence signal to feed it;
  derived from correctness alone, SM-2 collapses into a doubling schedule with extra
  arithmetic and two more columns.
- They are tuned for decks of thousands reviewed daily for years. A module quiz is a
  handful of items over a few weeks, and at that scale the difference between an optimal
  and a roughly-right interval is not something a learner can perceive.

The cap is the part that matters more than the growth rate: without it, eight correct
answers in a row would push an item beyond any horizon the learner is studying over, and
the system would have silently stopped reviewing it.

**Eligibility is a pedagogical rule, not a scheduling one.** A never-attempted item
becomes available when its _module_ is complete, not while the module is in progress. A
module quiz asks about the whole module; surfacing an item early would test lessons the
learner has not reached, and a beginner cannot tell "I was never taught this" from "I
failed to learn this" (Section 2.2).

Nothing new is stored for any of this. Streaks, module badges and the schedule are all
derived from `progress`, `submissions` and `quiz_attempts` rows, for the same reason
module status is derived rather than stored (§4): a counter is a second source of truth
that drifts the first time an update is missed. Phase 5 added no migration.

---

## 6. Request topology

The browser talks only to the Next.js origin. Next.js rewrites `/api/*` to FastAPI.

Reasoning: it keeps the session cookie same-origin, which removes the entire class of
cross-site cookie problems (`SameSite=None`, CORS preflight, third-party-cookie blocking
in Safari and Firefox) that a split-origin deployment would force us to solve — for no
benefit at MVP scale.

---

## 7. Deliberately deferred

Recorded so they are visible decisions rather than omissions:

- OAuth providers (§5).
- Track B content, and the `micropip` availability spike the brief asks for at the start
  of Phase 7 (§1.1).
- A learner's own view of their review history — which items they keep missing. The data
  is all in `quiz_attempts`; nothing reads it back yet.
- `SharedArrayBuffer` interrupt buffer (§1.2).
- Multi-file exercises and real filesystem exercises — the Section 4.1 revisit triggers.
- Persisting a learner's in-progress code between visits. A real want, but it needs a
  considered answer about where drafts live and for how long; half-doing it would create
  an expectation the storage does not meet.

## 8. Settled by the product owner

Questions this document previously left open, and how they were answered:

- **No official assessment.** The platform teaches; it certifies nothing. This is what
  makes client-side grading acceptable, since the checks necessarily reach the browser —
  see the note at the top of `app/routers/curriculum.py`.
- **Must run on free hosting tiers.** This decided §1.1 in favour of CDN delivery for the
  Pyodide distribution, and shaped the route-group split that keeps the marketing pages
  static. See `deployment.md`.
