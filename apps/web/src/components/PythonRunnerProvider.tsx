"use client";

/**
 * Owns the single Pyodide runner shared by every exercise on a page.
 *
 * One runner, not one per exercise: the interpreter is a ~14 MB download and a
 * ~2 s start, and a lesson has several exercises. Loading it once and reusing it
 * is the difference between a lesson that feels instant and one that stalls at
 * every card.
 *
 * Loading is lazy (Section 8, performance): the runner is created only when
 * something actually asks to run code, so a learner reading a lesson never pays
 * for the runtime, and the landing page never touches it at all.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PyodideRunner } from "@/lib/python/pyodideRunner";
import type { ExecutionRequest, ExecutionResult, RunnerState } from "@/lib/python/types";

interface RunnerContextValue {
  state: RunnerState;
  /** Start loading now — used to warm up as soon as an exercise scrolls into view. */
  prepare: () => void;
  run: (request: ExecutionRequest) => Promise<ExecutionResult>;
}

const RunnerContext = createContext<RunnerContextValue | null>(null);

export function PythonRunnerProvider({ children }: { children: React.ReactNode }) {
  const runnerRef = useRef<PyodideRunner | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<RunnerState>("idle");

  const ensureRunner = useCallback(() => {
    if (!runnerRef.current) {
      const runner = new PyodideRunner();
      runnerRef.current = runner;
      unsubscribeRef.current = runner.subscribe(setState);
    }
    return runnerRef.current;
  }, []);

  const prepare = useCallback(() => {
    void ensureRunner()
      .ready()
      .catch(() => undefined);
  }, [ensureRunner]);

  const run = useCallback(
    (request: ExecutionRequest) => ensureRunner().run(request),
    [ensureRunner],
  );

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      runnerRef.current?.dispose();
      runnerRef.current = null;
    },
    [],
  );

  const value = useMemo(() => ({ state, prepare, run }), [state, prepare, run]);

  return <RunnerContext.Provider value={value}>{children}</RunnerContext.Provider>;
}

export function usePythonRunner(): RunnerContextValue {
  const context = useContext(RunnerContext);
  if (!context) {
    throw new Error("usePythonRunner must be used inside a PythonRunnerProvider.");
  }
  return context;
}
