/**
 * Browser implementation of `PythonRunner`: Pyodide in a Web Worker.
 *
 * The timeout lives here rather than in the worker, and that is the whole point
 * of the design. A learner's first `while` loop very often never ends, and code
 * spinning inside the interpreter will not cooperate with any in-worker guard.
 * The main thread can always terminate the worker, so it does — unconditionally,
 * with no help required from the code being stopped (docs/architecture.md §1.2).
 *
 * After a termination the interpreter is gone, so a replacement worker is started
 * immediately rather than at the next click: a learner who has just written an
 * infinite loop is about to fix it and run again, and should not then wait two
 * seconds for a reload they did not cause.
 */

import type { WorkerRequest, WorkerResponse } from "./protocol";
import {
  DEFAULT_TIMEOUT_MS,
  engineFailure,
  type ExecutionRequest,
  type ExecutionResult,
  type PythonRunner,
  type RunnerState,
} from "./types";

export interface PyodideRunnerOptions {
  /** Where the self-hosted Pyodide assets are served from. Must end in "/". */
  indexUrl?: string;
  /** Where the generated copy of harness.py is served from. */
  harnessUrl?: string;
  /** Where the generated copy of worker.js is served from. */
  workerUrl?: string;
  /** How long the interpreter may take to start before the learner is told
   * something is wrong. Generous by default — it is a ~14 MB download on a
   * connection we know nothing about. */
  loadTimeoutMs?: number;
  /** Build the worker. Overridable so tests can supply a stand-in. */
  createWorker?: () => Worker;
}

/** The worker is a served module, not a bundled chunk — the bundler emits a
 * classic worker, and Pyodide will not initialise in one. See
 * src/lib/python/worker.js and docs/architecture.md §1.3. */
const DEFAULT_WORKER_URL = "/python/worker.js";

/**
 * Where the Pyodide distribution is fetched from.
 *
 * Set at build time by next.config.mjs, which pins it to the exact version of
 * the npm package the content tests graded against. Defaults to jsDelivr so the
 * platform fits inside a free hosting tier — the distribution is ~14 MB per cold
 * load, which would otherwise be the whole bandwidth budget. Point
 * PYODIDE_INDEX_URL at "/pyodide/" to serve it from this origin instead.
 *
 * The fallback here is the self-hosted path, so anything rendering outside a
 * Next build (a unit test, a story) uses the copy on disk rather than reaching
 * for the network.
 */
const DEFAULT_INDEX_URL = process.env.NEXT_PUBLIC_PYODIDE_INDEX_URL || "/pyodide/";

/** Long enough for a 14 MB download on a poor connection, short enough that a
 * learner is not left guessing. */
const DEFAULT_LOAD_TIMEOUT_MS = 90_000;

/** Resolve a same-origin path against the page's origin. Left untouched if it
 * is already absolute, and passed through unchanged outside a browser so tests
 * can assert on the value they supplied. */
function absolute(url: string): string {
  if (typeof location === "undefined" || /^[a-z]+:\/\//i.test(url)) return url;
  return new URL(url, location.origin).href;
}

export class PyodideRunner implements PythonRunner {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private state: RunnerState = "idle";
  private listeners = new Set<(state: RunnerState) => void>();
  private nextId = 1;
  private pending: {
    id: number;
    resolve: (result: ExecutionResult) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private disposed = false;

  private readonly indexUrl: string;
  private readonly harnessUrl: string;
  private readonly loadTimeoutMs: number;
  private readonly createWorker: () => Worker;

  constructor(options: PyodideRunnerOptions = {}) {
    // Absolute, not path-relative. Pyodide locates its own assets with
    // `new URL(file, indexURL)`, and a path-only base such as "/pyodide/" is not
    // a valid base for that inside a worker — it throws where it would have
    // worked on the main thread. Resolving here keeps the callers' relative
    // paths convenient without the worker inheriting the ambiguity.
    this.indexUrl = absolute(options.indexUrl ?? DEFAULT_INDEX_URL);
    this.harnessUrl = absolute(options.harnessUrl ?? "/python/harness.py");
    this.loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
    const workerUrl = absolute(options.workerUrl ?? DEFAULT_WORKER_URL);
    this.createWorker = options.createWorker ?? (() => new Worker(workerUrl, { type: "module" }));
  }

  subscribe(listener: (state: RunnerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: RunnerState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  ready(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("This runner has been disposed."));
    if (this.readyPromise) return this.readyPromise;

    this.setState("loading");
    const worker = this.createWorker();
    this.worker = worker;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      // Loading has to be able to give up. A worker whose asset fetch stalls —
      // a blocked CDN, a captive portal, a connection that dies mid-download —
      // may never post back at all, and without this the promise never settles:
      // `run()` awaits it before starting its own timeout, so the learner sits
      // on "Running…" indefinitely with nothing to read and nothing to try.
      const loadTimer = setTimeout(() => {
        this.setState("failed");
        reject(
          new Error(
            `Python did not finish starting after ${Math.round(this.loadTimeoutMs / 1000)} seconds. ` +
              `This is usually a slow or blocked connection rather than anything you did — ` +
              `reloading the page will try again.`,
          ),
        );
      }, this.loadTimeoutMs);

      const settleLoad = (outcome: () => void) => {
        clearTimeout(loadTimer);
        outcome();
      };

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === "ready") {
          settleLoad(() => {
            this.setState("ready");
            resolve();
          });
          return;
        }
        if (message.type === "failure" && message.id === null) {
          settleLoad(() => {
            this.setState("failed");
            reject(new Error(message.message));
          });
          return;
        }
        this.handleRunMessage(message);
      };

      worker.addEventListener("message", onMessage as EventListener);
      worker.addEventListener("error", (event) => {
        // A worker-level error can arrive before or after `ready`; only the
        // pre-ready case should reject the load.
        if (this.state === "loading") {
          settleLoad(() => {
            this.setState("failed");
            reject(new Error(event.message || "The Python runtime failed to start."));
          });
        }
      });

      this.send({ type: "init", indexUrl: this.indexUrl, harnessUrl: this.harnessUrl });
    });

    // A failed load must not be remembered as the answer for every later
    // attempt: discard it so pressing Run again genuinely retries.
    this.readyPromise.catch(() => {
      if (this.readyPromise) this.discardWorker();
    });

    return this.readyPromise;
  }

  /** Throw away the current worker so the next `ready()` starts a new one. */
  private discardWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
  }

  private send(message: WorkerRequest): void {
    this.worker?.postMessage(message);
  }

  private handleRunMessage(message: WorkerResponse): void {
    const pending = this.pending;
    if (!pending || message.type === "ready") return;
    if (message.id !== pending.id) return; // A late reply from a superseded run.

    clearTimeout(pending.timer);
    this.pending = null;
    this.setState("ready");

    if (message.type === "result") {
      pending.resolve(JSON.parse(message.payload) as ExecutionResult);
    } else {
      pending.resolve(engineFailure(message.message));
    }
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    if (this.disposed) return engineFailure("This runner has been disposed.");

    try {
      await this.ready();
    } catch (err) {
      return engineFailure(
        err instanceof Error ? err.message : "The Python runtime failed to start.",
      );
    }

    // Disposal can land while the interpreter is still loading — a component
    // unmounting during the first run is the ordinary case. Without this check
    // the run would be registered against a terminated worker and its promise
    // would never settle.
    if (this.disposed) return engineFailure("The page stopped the running program.");

    if (this.pending) {
      return engineFailure("Another program is still running.");
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const id = this.nextId++;
    this.setState("running");

    return new Promise<ExecutionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.restart();
        resolve({
          ...engineFailure(
            `Your program was still running after ${Math.round(timeoutMs / 1000)} seconds, so it was stopped.`,
            "timeout",
          ),
        });
      }, timeoutMs);

      this.pending = { id, resolve, timer };
      this.send({
        type: "run",
        id,
        payload: JSON.stringify({
          code: request.code,
          stdin: request.stdin ?? [],
          checks: request.checks ?? [],
          files: request.files ?? {},
        }),
      });
    });
  }

  /** Destroy the interpreter and immediately begin loading a replacement. */
  private restart(): void {
    this.discardWorker();
    this.setState("restarting");
    if (!this.disposed) {
      // Pre-warm, so the learner's next run does not pay the reload.
      void this.ready().catch(() => undefined);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(engineFailure("The page stopped the running program."));
      this.pending = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.listeners.clear();
    this.state = "idle";
  }
}
