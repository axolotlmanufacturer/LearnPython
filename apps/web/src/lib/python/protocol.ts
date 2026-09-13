/** Messages exchanged between the main thread and the Pyodide Web Worker. */

export interface InitRequest {
  type: "init";
  /** Directory holding pyodide.mjs and its assets, served from our own origin. */
  indexUrl: string;
  /** URL of the generated copy of harness.py. */
  harnessUrl: string;
}

export interface RunRequest {
  type: "run";
  id: number;
  /** A JSON string, passed straight to `run_submission`. Deliberately a string:
   * nothing here depends on the JS↔Python object bridge. */
  payload: string;
  /**
   * Pyodide packages this exercise needs, loaded before the code runs.
   *
   * Resolved by `pyodide.loadPackage` from the same origin as the interpreter,
   * not by micropip from PyPI — see docs/spike-scientific-stack.md §1. Already
   * loaded packages are a no-op, so repeating them per exercise is free and
   * keeps each exercise's requirements stated where the exercise is.
   */
  packages?: string[];
}

export type WorkerRequest = InitRequest | RunRequest;

export interface ReadyMessage {
  type: "ready";
  /** Milliseconds spent loading the interpreter, for the loading indicator and
   * for performance work later. */
  loadMs: number;
}

export interface ResultMessage {
  type: "result";
  id: number;
  /** JSON string produced by `run_submission`. */
  payload: string;
}

/**
 * A run is waiting on packages rather than on the learner's code.
 *
 * Sent before the work starts, so the interface can say what is happening. A
 * scipy download is tens of megabytes and a silent pause of that length reads
 * as a broken page.
 */
export interface LoadingPackagesMessage {
  type: "loading-packages";
  id: number;
  packages: string[];
}

/**
 * Packages are in; the learner's code is about to run.
 *
 * This exists so the main thread knows when to start counting. The run timeout
 * asks "has this program stopped making progress", and a multi-megabyte
 * download is not an answer to that question — without this message a scipy
 * fetch would trip the five-second budget and be reported to the learner as an
 * infinite loop in code that had not begun executing.
 */
export interface PackagesLoadedMessage {
  type: "packages-loaded";
  id: number;
}

/** The engine itself failed — not the learner's code. */
export interface FailureMessage {
  type: "failure";
  id: number | null;
  message: string;
}

export type WorkerResponse =
  ReadyMessage | ResultMessage | LoadingPackagesMessage | PackagesLoadedMessage | FailureMessage;
