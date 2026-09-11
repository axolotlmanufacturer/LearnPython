# Deployment

The platform is built to run on free tiers. This note records what that costs,
where the limits actually bite, and which knobs exist.

## The shape of the thing

| Piece                | What it is                                       | Where it can live free                  |
| -------------------- | ------------------------------------------------ | --------------------------------------- |
| Web app              | Next.js — lesson pages, editor, execution engine | Vercel Hobby, Netlify, Cloudflare Pages |
| Pyodide distribution | ~14 MB of WebAssembly and stdlib                 | jsDelivr (default), or your own origin  |
| API                  | FastAPI — auth, curriculum, progress             | Fly.io, Render, Railway                 |
| Database             | PostgreSQL                                       | Neon, Supabase, Render                  |

Learner code never touches the API. Everything a learner runs executes in their
own browser, so traffic to the backend is auth, curriculum reads, and small
progress writes — which is why the backend can be the smallest thing you have.

## Bandwidth is the only number that matters

The Pyodide distribution dominates everything else on the page by two orders of
magnitude:

| Asset                                                                | Size    | Per learner                   |
| -------------------------------------------------------------------- | ------- | ----------------------------- |
| `pyodide.asm.wasm`                                                   | 9.2 MB  | Once per version, then cached |
| `python_stdlib.zip`                                                  | 2.5 MB  | Once per version, then cached |
| `pyodide.asm.mjs`                                                    | 1.2 MB  | Once per version, then cached |
| Everything else (app JS/CSS, lesson HTML, `worker.js`, `harness.py`) | ~0.3 MB | Per visit, mostly cached      |

A typical free tier allows 100 GB of bandwidth a month. Serving the distribution
yourself, that is **roughly 7,000 first-time learners a month and nothing else** —
and it is consumed by people who may bounce before writing a line of Python.

So **the distribution is fetched from jsDelivr by default**, which serves the
official Pyodide builds free and unmetered. What remains on your own origin is
the app itself, which comfortably fits.

### What that costs, stated honestly

Self-hosting the runtime was the earlier default, for reasons that have not gone
away — they have been outweighed (see `architecture.md` §1.1):

- **Supply chain.** The distribution _is_ the code execution environment. The
  URL is pinned to an exact version rather than a floating tag, and that version
  is read from the installed npm package at build time, so a CDN cannot serve an
  interpreter that CI never graded against. That is mitigation, not elimination:
  you are trusting jsDelivr's integrity.
- **Restricted networks.** Some corporate and school networks block public CDNs.
  Learners behind those will see the runtime fail to start. They get an
  explanation rather than a blank pane, but they cannot run code.

Both are reversible with one environment variable, below.

## Configuration

### Web app

| Variable            | Default                                   | Notes                                                                          |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `API_ORIGIN`        | `http://127.0.0.1:8000`                   | Where `/api/*` is proxied. Must be reachable from the server, not the browser. |
| `PYODIDE_INDEX_URL` | jsDelivr, pinned to the installed version | Set to `/pyodide/` to self-host. Must end in `/`.                              |

Setting `PYODIDE_INDEX_URL=/pyodide/` changes two things at once: the build copies
the distribution into `public/pyodide/`, and the app fetches it from there. Leave
it unset and the build skips the copy entirely, so the deployment bundle stays
small.

Local development, the unit tests, and the end-to-end suite all self-host. Working
offline should be possible, and CI must not depend on a third party being up to
decide whether the build is green. The code path under test — worker, asset
resolution, grading — is identical either way.

### API

| Variable           | Notes                                                     |
| ------------------ | --------------------------------------------------------- |
| `DATABASE_URL`     | Must use the async driver: `postgresql+asyncpg://…`       |
| `ENVIRONMENT`      | Set to `production` to put `Secure` on the session cookie |
| `SESSION_TTL_DAYS` | Defaults to 30                                            |

## Deploying

```bash
# Database
alembic upgrade head
python -m app.content.load      # loads content/ into the database

# API — one small container is enough
uvicorn app.main:app --host 0.0.0.0 --port $PORT

# Web
npm run build --workspace=apps/web
npx next start
```

Re-run `app.content.load` on every deploy. It is idempotent: records whose
authored content is unchanged are left alone, and existing rows are updated in
place rather than replaced, so learner submissions keep pointing at the same
exercises.

## Free-tier characteristics worth knowing

**Server invocations are metered too.** The landing page, sign-in and sign-up
render as static HTML and are served from the edge cache — they read nothing
per-request. Only the learning pages read the session cookie and render per
request. This is why the app is split into `(marketing)` and `(app)` route
groups; putting a session read in the root layout would have made every page in
the product dynamic, including the one most people see and leave from.

**Free databases sleep and cap connections.** Curriculum responses are cached for
five minutes, so lesson pages do not re-read immutable content from the database
on every render. Auth and progress are never cached.

**Free API tiers cold-start.** A sleeping backend adds a few seconds to the first
request. It does not block a learner from running code — the execution engine is
entirely local to their browser — but it does delay the first page and the first
progress save. If that matters, the API is the one component worth paying for.

## If you outgrow it

In rough order of what will hurt first:

1. **Backend cold starts** annoy returning learners. A paid instance, or a
   platform that does not sleep, is the cheapest fix.
2. **Database connections** under concurrency. Add a pooler (Neon and Supabase
   both offer one) before adding instances.
3. **Bandwidth**, only if you self-host the distribution. Putting it back on a
   CDN is one environment variable.

Nothing in that list involves running learner code on a server, and nothing
should. That constraint is what keeps this deployable on a free tier at all —
see `architecture.md` §1.
