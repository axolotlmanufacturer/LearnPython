/**
 * Node implementation of `PythonRunner`, for tests only.
 *
 * It exists so that CI exercises the *same* harness.py, on the *same* Pyodide
 * build, as a learner's browser (docs/architecture.md §3). That is what lets the
 * content tests make a real guarantee: every authored exercise's reference
 * solution is run against that exercise's own checks in a genuine interpreter,
 * so an unsolvable exercise cannot be merged.
 *
 * Timeouts here use Pyodide's interrupt buffer, tripped by a watchdog thread
 * (see watchdog.ts), rather than the worker termination the browser uses. Node
 * has SharedArrayBuffer unconditionally, so the interpreter can be interrupted
 * in place and reused, which keeps the test suite fast; the browser cannot rely
 * on that without cross-origin isolation. The two paths differ only in how
 * execution is stopped — never in how code is run or graded.
 *
 * Not imported by any browser code path.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import {
  CONTROL_DEADLINE,
  CONTROL_LENGTH,
  CONTROL_STATE,
  STATE_IDLE,
  STATE_RUNNING,
  WATCHDOG_SOURCE,
} from "./watchdog";
import {
  DEFAULT_TIMEOUT_MS,
  engineFailure,
  type ExecutionRequest,
  type ExecutionResult,
  type PythonRunner,
  type RunnerState,
} from "./types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HARNESS_PATH = path.join(HERE, "harness.py");

interface NodePyodide {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => ((arg: string) => string) | undefined };
  setInterruptBuffer: (buffer: Uint8Array) => void;
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
}

export class NodePyodideRunner implements PythonRunner {
  private pyodide: NodePyodide | null = null;
  private loading: Promise<void> | null = null;
  private interruptBuffer: Uint8Array | null = null;
  private control: Int32Array | null = null;
  private watchdog: Worker | null = null;
  private state: RunnerState = "idle";
  private listeners = new Set<(state: RunnerState) => void>();

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
    if (this.loading) return this.loading;
    this.setState("loading");
    this.loading = (async () => {
      const { loadPyodide } = await import("pyodide");
      const pyodide = (await loadPyodide()) as unknown as NodePyodide;

      // Anything the harness fails to capture would otherwise land in the test
      // runner's own output; keep it quiet.
      pyodide.setStdout({ batched: () => undefined });
      pyodide.setStderr({ batched: () => undefined });

      const interruptSab = new SharedArrayBuffer(1);
      const controlSab = new SharedArrayBuffer(CONTROL_LENGTH * Int32Array.BYTES_PER_ELEMENT);
      this.interruptBuffer = new Uint8Array(interruptSab);
      this.control = new Int32Array(controlSab);
      pyodide.setInterruptBuffer(this.interruptBuffer);

      this.watchdog = new Worker(WATCHDOG_SOURCE, {
        eval: true,
        workerData: { control: controlSab, interrupt: interruptSab },
      });
      // The watchdog must never hold the test process open on its own.
      this.watchdog.unref();

      pyodide.runPython(readFileSync(HARNESS_PATH, "utf8"));
      this.pyodide = pyodide;
      this.setState("ready");
    })();
    return this.loading;
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    await this.ready();
    const pyodide = this.pyodide;
    const buffer = this.interruptBuffer;
    const control = this.control;
    if (!pyodide || !buffer || !control) {
      return engineFailure("The Python runtime failed to start.");
    }

    const run = pyodide.globals.get("run_submission");
    if (typeof run !== "function") return engineFailure("The grading harness did not load.");

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const payload = JSON.stringify({
      code: request.code,
      stdin: request.stdin ?? [],
      checks: request.checks ?? [],
      files: request.files ?? {},
    });

    // Arm the watchdog thread. It, not this thread, enforces the deadline: the
    // call below blocks this thread entirely, so nothing scheduled here could run.
    buffer[0] = 0;
    Atomics.store(control, CONTROL_DEADLINE, timeoutMs);
    Atomics.store(control, CONTROL_STATE, STATE_RUNNING);
    Atomics.notify(control, CONTROL_STATE);

    this.setState("running");
    try {
      const result = JSON.parse(run(payload)) as ExecutionResult;
      // An interrupt surfaces as a KeyboardInterrupt from the learner's code;
      // report it as the timeout it actually was.
      if (result.error?.type === "KeyboardInterrupt") {
        return {
          ...result,
          status: "timeout",
          passed: false,
          error: {
            ...result.error,
            type: "Timeout",
            message: `Your program was still running after ${Math.round(
              timeoutMs / 1000,
            )} seconds, so it was stopped.`,
          },
        };
      }
      return result;
    } catch (err) {
      return engineFailure(err instanceof Error ? err.message : String(err));
    } finally {
      // Stand the watchdog down before it can trip on the next run.
      Atomics.store(control, CONTROL_STATE, STATE_IDLE);
      Atomics.notify(control, CONTROL_STATE);
      buffer[0] = 0;
      this.setState("ready");
    }
  }

  dispose(): void {
    void this.watchdog?.terminate();
    this.watchdog = null;
    this.pyodide = null;
    this.loading = null;
    this.control = null;
    this.interruptBuffer = null;
    this.listeners.clear();
    this.setState("idle");
  }
}
