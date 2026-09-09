/**
 * Public surface of the execution engine.
 *
 * Application code imports from here and depends on `PythonRunner`, never on
 * Pyodide directly — see docs/architecture.md §1. `nodeRunner` is deliberately
 * absent: it is test-only, and importing it would pull Node built-ins into the
 * browser bundle.
 */
export { explainError, type ErrorExplanation } from "./errorMapping";
export { PyodideRunner, type PyodideRunnerOptions } from "./pyodideRunner";
export {
  DEFAULT_TIMEOUT_MS,
  type Check,
  type CheckResult,
  type CheckStatus,
  type ConsoleSegment,
  type ExecutionRequest,
  type ExecutionResult,
  type ExecutionStatus,
  type PythonError,
  type PythonRunner,
  type RunnerState,
} from "./types";
