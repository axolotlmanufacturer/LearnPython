/**
 * The execution-engine contract.
 *
 * Everything in the application depends on `PythonRunner`, never on Pyodide
 * directly. Section 4.1 of the brief names the conditions under which the MVP's
 * in-browser execution model would need to be replaced by a server-side sandbox
 * (real filesystem interaction, multi-file projects, networked code); this
 * interface is what makes that a substitution rather than a rewrite.
 *
 * Two implementations exist today, both driving the same `harness.py`:
 *   - PyodideRunner  — Pyodide in a Web Worker, used by the app.
 *   - NodePyodideRunner — Pyodide in-process, used by tests and content tests.
 */

/** How a `stdout` check compares the program's output with the expected text. */
export type StdoutMatch = "exact" | "normalized" | "contains";

/** Compare what the program printed. The only observable behaviour a beginner's
 * script has, before functions have been introduced. */
export interface StdoutCheck {
  kind: "stdout";
  label: string;
  expected: string;
  /** Defaults to "normalized", which forgives trailing whitespace and blank
   * lines at the edges — differences a learner cannot see and has not been
   * taught to care about yet. */
  match?: StdoutMatch;
}

/** Call a function the learner defined and compare what it returns. */
export interface CallCheck {
  kind: "call";
  label: string;
  function: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
  /** Omit to assert only that the returned value is truthy. */
  expected?: unknown;
  /** Absolute tolerance for float comparison. Required by Track B's statistics. */
  tolerance?: number;
}

/** Evaluate an expression against the learner's namespace after their code has
 * run. Lets an exercise check a variable or data structure without dictating
 * how the learner built it. */
export interface ExprCheck {
  kind: "expr";
  label: string;
  expression: string;
  expected?: unknown;
  tolerance?: number;
}

/** Constrain the learner's source, for exercises whose point is the technique
 * rather than the answer ("solve this with a loop"). Uses AST node names, not
 * substrings — searching program text for "for" also matches "before". */
export interface SourceCheck {
  kind: "source";
  label: string;
  require_ast?: string[];
  forbid_ast?: string[];
  require_text?: string[];
  forbid_text?: string[];
}

export type Check = StdoutCheck | CallCheck | ExprCheck | SourceCheck;

export interface ExecutionRequest {
  code: string;
  /** Lines fed to `input()` in order. */
  stdin?: string[];
  /** Omit or leave empty to just run the code without grading it. */
  checks?: Check[];
  /** Wall-clock budget. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export type ExecutionStatus =
  /** Ran to completion. Says nothing about whether the checks passed. */
  | "ok"
  /** The learner's code raised, or failed to compile. */
  | "error"
  /** Exceeded the wall-clock budget and was terminated — almost always a loop
   * that never ends. */
  | "timeout"
  /** The engine itself failed (worker died, runtime could not load). Not the
   * learner's fault and the UI must not present it as such. */
  | "crashed";

export type CheckStatus = "passed" | "failed" | "not_run";

export interface CheckResult {
  label: string;
  status: CheckStatus;
  passed: boolean;
  /** Learner-facing explanation of the failure. Never a bare "incorrect". */
  detail: string | null;
  expected: string | null;
  actual: string | null;
}

export interface PythonError {
  /** Exception class name, e.g. "NameError". */
  type: string;
  message: string;
  /** Line in the learner's own code, 1-based. Harness frames are stripped. */
  line: number | null;
  column: number | null;
  /** The offending source line, when known. */
  text: string;
  /** The real traceback, shown beneath the plain-language explanation so that
   * learners are gradually trained to read tracebacks rather than insulated
   * from them (brief §4.3). */
  traceback: string;
}

/** One ordered chunk of the output pane. `in` is text echoed at an `input()`
 * prompt: it is what the learner would see in a terminal, but it is not part of
 * the program's output, so it is excluded from `stdout` and from stdout checks. */
export interface ConsoleSegment {
  stream: "out" | "err" | "in";
  text: string;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  /** The program's output, as checks see it. */
  stdout: string;
  stderr: string;
  /** What the output pane renders. */
  console: ConsoleSegment[];
  error: PythonError | null;
  checks: CheckResult[];
  /** True only when the code ran cleanly *and* every check passed. */
  passed: boolean;
  /** Output was cut off for exceeding the size limit. */
  truncated: boolean;
  durationMs: number;
}

export type RunnerState = "idle" | "loading" | "ready" | "running" | "restarting" | "failed";

export interface PythonRunner {
  /** Load the runtime. Safe to call repeatedly; callers may also skip it and
   * let the first `run()` trigger loading. */
  ready(): Promise<void>;
  run(request: ExecutionRequest): Promise<ExecutionResult>;
  /** Observe load/run state, for progress indication. Returns an unsubscribe. */
  subscribe(listener: (state: RunnerState) => void): () => void;
  dispose(): void;
}

export const DEFAULT_TIMEOUT_MS = 5_000;

/** Result used when the engine, rather than the learner's code, has failed. */
export function engineFailure(
  message: string,
  status: ExecutionStatus = "crashed",
): ExecutionResult {
  return {
    status,
    stdout: "",
    stderr: "",
    console: [],
    error: {
      type: status === "timeout" ? "Timeout" : "EngineError",
      message,
      line: null,
      column: null,
      text: "",
      traceback: "",
    },
    checks: [],
    passed: false,
    truncated: false,
    durationMs: 0,
  };
}
