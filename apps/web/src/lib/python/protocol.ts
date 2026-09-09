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

/** The engine itself failed — not the learner's code. */
export interface FailureMessage {
  type: "failure";
  id: number | null;
  message: string;
}

export type WorkerResponse = ReadyMessage | ResultMessage | FailureMessage;
