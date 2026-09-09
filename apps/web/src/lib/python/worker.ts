/// <reference lib="webworker" />
/**
 * The Web Worker that owns the Python interpreter.
 *
 * Running Pyodide off the main thread is what keeps the UI responsive while
 * learner code runs, and — more importantly — it is what makes a runaway loop
 * survivable: the main thread can terminate this worker outright. Nothing in
 * here tries to enforce the timeout, because code stuck in `while True:` never
 * yields to anything that could.
 *
 * The interpreter is created once and reused across runs. Each run gets a fresh
 * namespace inside harness.py, so learner code cannot leak state between runs
 * through module globals.
 */

import type { RunRequest, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

type PyodideApi = {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => ((arg: string) => string) | undefined };
};

let pyodidePromise: Promise<PyodideApi> | null = null;

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

async function boot(indexUrl: string, harnessUrl: string): Promise<PyodideApi> {
  // Pyodide is a runtime asset served from our own origin, not a bundled module;
  // the ignore comments stop the bundlers from trying to trace into it.
  const mod = await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ `${indexUrl}pyodide.mjs`
  );

  const pyodide: PyodideApi = await mod.loadPyodide({ indexURL: indexUrl });

  const harnessSource = await fetch(harnessUrl).then((res) => {
    if (!res.ok) throw new Error(`Could not load the grading harness (${res.status}).`);
    return res.text();
  });
  pyodide.runPython(harnessSource);

  return pyodide;
}

async function handleRun(request: RunRequest): Promise<void> {
  try {
    const pyodide = await pyodidePromise!;
    const run = pyodide.globals.get("run_submission");
    if (typeof run !== "function") {
      throw new Error("The grading harness did not load correctly.");
    }
    post({ type: "result", id: request.id, payload: run(request.payload) });
  } catch (err) {
    post({
      type: "failure",
      id: request.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "init") {
    const started = performance.now();
    pyodidePromise = boot(message.indexUrl, message.harnessUrl);
    pyodidePromise.then(
      () => post({ type: "ready", loadMs: Math.round(performance.now() - started) }),
      (err: unknown) =>
        post({
          type: "failure",
          id: null,
          message: err instanceof Error ? err.message : String(err),
        }),
    );
    return;
  }

  if (message.type === "run") {
    if (!pyodidePromise) {
      post({ type: "failure", id: message.id, message: "The Python runtime was never started." });
      return;
    }
    void handleRun(message);
  }
};

export {};
