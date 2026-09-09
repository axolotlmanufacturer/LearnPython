/**
 * A Node worker thread that trips Pyodide's interrupt flag when a run overruns.
 *
 * Needed because `run_submission` is a synchronous call into WebAssembly: while
 * a learner's `while True:` spins, the calling thread's event loop is blocked,
 * so a `setTimeout` on that thread can never fire. The deadline has to be
 * enforced from a genuinely separate thread.
 *
 * This is the Node/test-side counterpart to the browser's approach, where the
 * main thread terminates the Web Worker outright. Only the mechanism for
 * stopping execution differs between the two; how code is run and graded does not.
 *
 * Protocol, over one shared Int32Array:
 *   control[0]  0 = idle, 1 = a run is in progress
 *   control[1]  deadline for the current run, in milliseconds
 *
 * The watchdog waits on control[0]. When a run starts it sleeps for the
 * deadline; if `Atomics.wait` times out rather than being woken, the run is
 * still going, so it writes SIGINT (2) into the interrupt buffer. CPython's
 * evaluation loop notices and raises `KeyboardInterrupt`, which unwinds even a
 * bare `while True: pass`.
 */

export const CONTROL_STATE = 0;
export const CONTROL_DEADLINE = 1;
export const CONTROL_LENGTH = 2;

export const STATE_IDLE = 0;
export const STATE_RUNNING = 1;

/** Runs inside the worker thread. Kept as a string so it needs no build step. */
export const WATCHDOG_SOURCE = `
const { workerData } = require("node:worker_threads");
const control = new Int32Array(workerData.control);
const interrupt = new Uint8Array(workerData.interrupt);

const STATE = ${CONTROL_STATE};
const DEADLINE = ${CONTROL_DEADLINE};
const IDLE = ${STATE_IDLE};
const RUNNING = ${STATE_RUNNING};

while (true) {
  // Sleep until a run begins.
  if (Atomics.load(control, STATE) === IDLE) {
    Atomics.wait(control, STATE, IDLE);
    continue;
  }

  const deadline = Atomics.load(control, DEADLINE);
  // Woken early means the run finished in time; timing out means it did not.
  const outcome = Atomics.wait(control, STATE, RUNNING, deadline);
  if (outcome === "timed-out" && Atomics.load(control, STATE) === RUNNING) {
    interrupt[0] = 2; // SIGINT
  }
}
`;
