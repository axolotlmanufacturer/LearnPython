/**
 * The Web Worker that owns the Python interpreter.
 *
 * Deliberately plain JavaScript, and deliberately *not* bundled: it is copied
 * verbatim to public/python/worker.js by scripts/sync-pyodide.mjs and loaded as
 * a real module worker from our own origin, alongside the Pyodide distribution
 * and harness.py that it drives.
 *
 * Why not `new Worker(new URL("./worker.ts", import.meta.url))`? Because the
 * bundler emits a *classic* worker for that, and Pyodide refuses to initialise
 * in one ("Classic web workers are not supported"). Serving the worker as a
 * static module removes the bundler from a path where its output format is
 * load-bearing — and this file has no dependency on application code, so there
 * is nothing to bundle in the first place. Its message protocol is described in
 * protocol.ts, which stays the single typed definition for the other side.
 *
 * Running Pyodide off the main thread keeps the UI responsive, and — more
 * importantly — is what makes a runaway loop survivable: the main thread can
 * terminate this worker outright. Nothing here tries to enforce the timeout,
 * because code stuck in `while True:` never yields to anything that could.
 *
 * The interpreter is created once and reused. Each run gets a fresh namespace
 * inside harness.py, so learner code cannot leak state between runs.
 */

/** @type {Promise<any> | null} */
let pyodidePromise = null;

/**
 * @param {string} indexUrl Absolute URL of the directory holding the Pyodide assets.
 * @param {string} harnessUrl Absolute URL of the generated copy of harness.py.
 */
async function boot(indexUrl, harnessUrl) {
  const mod = await import(`${indexUrl}pyodide.mjs`);
  const pyodide = await mod.loadPyodide({ indexURL: indexUrl });

  const response = await fetch(harnessUrl);
  if (!response.ok) {
    throw new Error(`Could not load the grading harness (${response.status}).`);
  }
  pyodide.runPython(await response.text());

  return pyodide;
}

/** @param {{id: number, payload: string}} request */
async function handleRun(request) {
  try {
    const pyodide = await pyodidePromise;
    const run = pyodide.globals.get("run_submission");
    if (typeof run !== "function") {
      throw new Error("The grading harness did not load correctly.");
    }
    self.postMessage({ type: "result", id: request.id, payload: run(request.payload) });
  } catch (err) {
    self.postMessage({
      type: "failure",
      id: request.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === "init") {
    const started = performance.now();
    pyodidePromise = boot(message.indexUrl, message.harnessUrl);
    pyodidePromise.then(
      () => self.postMessage({ type: "ready", loadMs: Math.round(performance.now() - started) }),
      (err) =>
        self.postMessage({
          type: "failure",
          id: null,
          message: err instanceof Error ? err.message : String(err),
        }),
    );
    return;
  }

  if (message.type === "run") {
    if (!pyodidePromise) {
      self.postMessage({
        type: "failure",
        id: message.id,
        message: "The Python runtime was never started.",
      });
      return;
    }
    void handleRun(message);
  }
};
