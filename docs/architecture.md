# Architecture Note

Status: accepted for Phases 0–3 (MVP vertical slice)
Last updated: Phase 0

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

### 1.1 Deviation: self-host the Pyodide distribution; do not load it from a CDN

The brief does not specify where the Pyodide runtime is fetched from, and the common
default is jsDelivr. We serve it from our own origin instead, copied out of the `pyodide`
npm package into `apps/web/public/pyodide/` by a `prebuild`/`predev` script.

Reasoning:

- **Supply-chain surface.** The Pyodide payload _is_ the code execution environment. A
  compromised or substituted CDN asset would be executing in every learner's browser with
  their session in scope. Serving it from our origin means it is covered by the same
  integrity and review path as the rest of the bundle, and pinned by `package-lock.json`
  rather than by a URL.
- **Version coherence with tests.** The same npm package supplies both the browser
  runtime and the Node-based test runner (§3). Browser and CI therefore execute the
  learner's code on byte-identical Pyodide and CPython builds. With a CDN URL, browser
  and CI versions drift independently and grading could pass in CI and fail for a learner.
- **Restricted networks.** Some corporate and educational networks — including the
  environment this repository was developed in — block public CDNs outright. A CDN
  dependency makes the core feature of the product silently unavailable to those learners.
- **Future cross-origin isolation.** If we later enable COOP/COEP to use a
  `SharedArrayBuffer` interrupt buffer (§1.2), same-origin assets need no CORP negotiation.

Cost, stated plainly: ~14 MB of static assets to serve (9.2 MB WASM, 2.5 MB stdlib zip),
versus offloading that bandwidth to a CDN's edge. These are immutable, hash-stable,
aggressively cacheable files and are lazy-loaded (Section 8), so the cost is one cold
download per learner per version. The assets are generated, not committed — `public/pyodide/`
is gitignored.

**Open item for the product owner (Track B, Phase 7):** third-party wheels
(`numpy`, `pandas`, `scipy`, `matplotlib`) are _not_ in the npm package and are normally
fetched by `micropip` from the Pyodide CDN at runtime. Track B therefore either
re-introduces a CDN dependency or requires vendoring those wheels into our own origin.
Vendoring is the consistent choice, and it is a real download-size decision
(tens of MB), not a silent one. This is flagged now rather than discovered in Phase 7.

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
- Spaced repetition, hints, gamification, capstone rubrics — Section 6 Phase 2 features;
  the schema accommodates them (`QuizItem`/`QuizAttempt`, `Exercise.hints`).
- Track B content and its wheel-vendoring decision (§1.1).
- `SharedArrayBuffer` interrupt buffer (§1.2).
- Multi-file exercises and real filesystem exercises — the Section 4.1 revisit triggers.
