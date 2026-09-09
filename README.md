# LearnPython

An interactive, browser-based platform that teaches Python to people with **no prior
programming experience** and carries them to intermediate proficiency.

Every line of learner code runs **in the learner's own browser**, compiled to WebAssembly.
Nothing to install, nothing to break, and no server-side execution of untrusted code
anywhere in this system — that is a hard architectural constraint, not an implementation
detail. See [`docs/architecture.md`](docs/architecture.md).

## Curriculum

**Track A — Python Fundamentals** (Modules 0–10): orientation, values and types, strings
and I/O, conditionals, loops, collections, functions, errors and exceptions, file I/O,
introductory OOP, and capstone projects.

**Track B — Applied Statistics for Biological Data** (Modules 11–16): tabular biological
data, pandas, descriptive statistics, hypothesis testing and multiple-testing correction,
visualisation, and a differential-analysis capstone. Assumes no biology background;
domain vocabulary is introduced only where an exercise needs it.

Curriculum is **data, not code**: modules, lessons, and exercises live as Markdown and
YAML under [`content/`](content/) and are loaded into the database. They are reviewed
through normal pull requests, and every exercise's reference solution is run against its
own test cases in CI, so an unsolvable exercise cannot ship.

## Repository layout

```
apps/web/        Next.js app: lesson viewer, code editor, Pyodide execution engine
apps/api/        FastAPI service: auth, curriculum delivery, progress. Runs no learner code.
content/         The curriculum itself, as reviewable Markdown + YAML
docs/            Architecture note and decision records
```

## Getting started

Requirements: Node 20+, Python 3.11+, PostgreSQL 16.

```bash
make install                                   # web + API dependencies, Pyodide assets
createdb learnpython                           # or point DATABASE_URL at your own
cp apps/api/.env.example apps/api/.env
make db-upgrade                                # apply migrations
make content-load                              # load content/ into the database
make dev                                       # web on :3000, API on :8000
```

## Common tasks

| Command             | Does                                                     |
| ------------------- | -------------------------------------------------------- |
| `make dev`          | Run web and API together                                 |
| `make test`         | Backend tests, execution-engine tests, and content tests |
| `make test-e2e`     | Playwright end-to-end suite                              |
| `make lint`         | Lint, format check, and typecheck both apps              |
| `make format`       | Auto-format everything                                   |
| `make content-load` | Reload `content/` into the database                      |

## A note on the Pyodide assets

The Python-in-WebAssembly runtime (~14 MB) is copied out of the `pyodide` npm package
into `apps/web/public/pyodide/` by `make install`, and served from our own origin rather
than a public CDN. It is generated, not committed. The reasoning — supply-chain surface,
keeping CI and learners on byte-identical interpreters, and networks that block CDNs — is
in [`docs/architecture.md`](docs/architecture.md) §1.1.
