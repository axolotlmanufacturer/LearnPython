/**
 * Tests for the browser runner's lifecycle: timeout enforcement by terminating
 * the worker, and recovery afterwards.
 *
 * These use a stand-in worker rather than a real one. The behaviour under test
 * is the main thread's — when it gives up, that it terminates rather than waits,
 * and that it comes back ready. Grading semantics are covered against a real
 * interpreter in executionEngine.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkerRequest } from "./protocol";
import { PyodideRunner } from "./pyodideRunner";

/** A Worker stand-in whose replies are driven by the test. */
class FakeWorker implements Pick<Worker, "postMessage" | "terminate"> {
  static instances: FakeWorker[] = [];

  terminated = false;
  received: WorkerRequest[] = [];
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  /** Set by a test to control how a run is answered. */
  behaviour: "result" | "silence" | "failure" = "result";
  /** Delay before answering, in fake-timer milliseconds. */
  replyDelayMs = 0;
  /** How long the interpreter takes to "load". */
  bootDelayMs = 0;
  /** When true, the worker never reports ready — a stalled asset fetch. */
  neverBoots = false;
  /** How long a declared package set takes to "download" before the code runs. */
  packageDelayMs = 0;
  /** When true, packages start downloading and never finish. */
  packagesNeverArrive = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(): void {}

  private emit(type: string, data: unknown): void {
    for (const listener of this.listeners[type] ?? []) listener({ data });
  }

  postMessage(message: WorkerRequest): void {
    if (this.terminated) return;
    this.received.push(message);

    if (message.type === "init") {
      if (this.neverBoots) return;
      // Reply synchronously at zero delay: several tests install fake timers
      // before calling ready(), and a deferred reply would never be delivered.
      if (this.bootDelayMs === 0) {
        this.emit("message", { type: "ready", loadMs: 0 });
      } else {
        setTimeout(() => {
          if (!this.terminated) this.emit("message", { type: "ready", loadMs: this.bootDelayMs });
        }, this.bootDelayMs);
      }
      return;
    }

    // Mirror the real worker: announce the download, announce it finished, and
    // only then start behaving like a run. The code cannot begin before its
    // packages are in, so the result is scheduled after both.
    const declared = message.type === "run" ? (message.packages ?? []) : [];
    let startsAt = 0;
    if (declared.length > 0) {
      this.emit("message", { type: "loading-packages", id: message.id, packages: declared });
      if (this.packagesNeverArrive) return;
      startsAt = this.packageDelayMs;
      setTimeout(() => {
        if (!this.terminated) this.emit("message", { type: "packages-loaded", id: message.id });
      }, startsAt);
    }

    if (this.behaviour === "silence") return; // stands in for a runaway loop

    setTimeout(() => {
      if (this.terminated) return;
      if (this.behaviour === "failure") {
        this.emit("message", { type: "failure", id: message.id, message: "worker exploded" });
      } else {
        this.emit("message", {
          type: "result",
          id: message.id,
          payload: JSON.stringify({
            status: "ok",
            stdout: "ran\n",
            stderr: "",
            console: [{ stream: "out", text: "ran\n" }],
            error: null,
            checks: [],
            passed: true,
            truncated: false,
            durationMs: 1,
          }),
        });
      }
    }, startsAt + this.replyDelayMs);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function makeRunner(configure?: (worker: FakeWorker) => void) {
  FakeWorker.instances = [];
  const runner = new PyodideRunner({
    createWorker: () => {
      const worker = new FakeWorker();
      configure?.(worker);
      return worker as unknown as Worker;
    },
  });
  return runner;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PyodideRunner", () => {
  it("boots the worker with our own-origin asset locations", async () => {
    const runner = makeRunner();
    await runner.ready();

    expect(FakeWorker.instances[0]!.received[0]).toEqual({
      type: "init",
      indexUrl: "/pyodide/",
      harnessUrl: "/python/harness.py",
    });
    runner.dispose();
  });

  it("returns the worker's result for a normal run", async () => {
    const runner = makeRunner();
    const result = await runner.run({ code: 'print("ran")' });

    expect(result.status).toBe("ok");
    expect(result.stdout).toBe("ran\n");
    runner.dispose();
  });

  it("loads the runtime lazily, on the first run, not on construction", () => {
    const runner = makeRunner();

    expect(FakeWorker.instances).toHaveLength(0);
    runner.dispose();
  });

  it("reports load progress through the state subscription", async () => {
    const runner = makeRunner();
    const states: string[] = [];
    runner.subscribe((state) => states.push(state));

    await runner.run({ code: "pass" });

    expect(states).toEqual(["idle", "loading", "ready", "running", "ready"]);
    runner.dispose();
  });

  it("terminates the worker when a run exceeds its budget", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.behaviour = "silence"; // never answers, like `while True: pass`
    });
    await runner.ready();

    const pending = runner.run({ code: "while True: pass", timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result.status).toBe("timeout");
    expect(result.error?.type).toBe("Timeout");
    expect(result.error?.message).toContain("5 seconds");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    runner.dispose();
  });

  it("pre-warms a replacement worker after a timeout instead of waiting for the next run", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.behaviour = "silence";
    });
    await runner.ready();

    const pending = runner.run({ code: "while True: pass", timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;

    // A learner who has just written an infinite loop is about to fix it and
    // run again; they should not then wait for a reload they did not cause.
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1]!.terminated).toBe(false);
    runner.dispose();
  });

  it("works again after a timeout", async () => {
    vi.useFakeTimers();
    let created = 0;
    const runner = makeRunner((worker) => {
      // Only the first worker hangs; the replacement behaves.
      if (created++ === 0) worker.behaviour = "silence";
    });

    const timedOut = runner.run({ code: "while True: pass", timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await timedOut).status).toBe("timeout");

    const after = runner.run({ code: 'print("ran")' });
    await vi.advanceTimersByTimeAsync(10);
    expect((await after).status).toBe("ok");
    runner.dispose();
  });

  it("does not time out a run that finishes inside its budget", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.replyDelayMs = 4000;
    });
    await runner.ready();

    const pending = runner.run({ code: "slow()", timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(4000);

    expect((await pending).status).toBe("ok");
    expect(FakeWorker.instances[0]!.terminated).toBe(false);
    runner.dispose();
  });

  it("surfaces an engine failure without blaming the learner's code", async () => {
    const runner = makeRunner((worker) => {
      worker.behaviour = "failure";
    });

    const result = await runner.run({ code: "pass" });

    expect(result.status).toBe("crashed");
    expect(result.error?.type).toBe("EngineError");
    runner.dispose();
  });

  it("refuses to start a second run while one is in flight", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.replyDelayMs = 1000;
    });
    await runner.ready();

    const first = runner.run({ code: "one()" });
    const second = await runner.run({ code: "two()" });

    expect(second.status).toBe("crashed");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first).status).toBe("ok");
    runner.dispose();
  });

  it("passes stdin, files and checks through to the worker unchanged", async () => {
    const runner = makeRunner();
    await runner.run({
      code: "x = input()",
      stdin: ["hello"],
      files: { "data.txt": "one\ntwo\n" },
      checks: [{ kind: "stdout", label: "prints", expected: "hi" }],
    });

    const runMessage = FakeWorker.instances[0]!.received.find((m) => m.type === "run");
    expect(JSON.parse((runMessage as { payload: string }).payload)).toEqual({
      code: "x = input()",
      stdin: ["hello"],
      files: { "data.txt": "one\ntwo\n" },
      checks: [{ kind: "stdout", label: "prints", expected: "hi" }],
    });
    runner.dispose();
  });

  it("defaults stdin, files and checks to empty rather than omitting them", async () => {
    const runner = makeRunner();
    await runner.run({ code: "pass" });

    const runMessage = FakeWorker.instances[0]!.received.find((m) => m.type === "run");
    expect(JSON.parse((runMessage as { payload: string }).payload)).toEqual({
      code: "pass",
      stdin: [],
      files: {},
      checks: [],
    });
    runner.dispose();
  });

  it("gives up when the interpreter never finishes loading", async () => {
    // Without a load timeout the promise never settles, `run()` awaits it before
    // starting its own timeout, and the learner sits on "Running…" forever.
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.neverBoots = true;
    });

    const pending = runner.run({ code: 'print("hi")' });
    await vi.advanceTimersByTimeAsync(90_000);
    const result = await pending;

    expect(result.status).toBe("crashed");
    expect(result.error?.message).toContain("did not finish starting");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    runner.dispose();
  });

  it("retries the load on the next run rather than remembering the failure", async () => {
    vi.useFakeTimers();
    let created = 0;
    const runner = makeRunner((worker) => {
      // The first worker stalls; a second attempt should get a fresh one.
      if (created++ === 0) worker.neverBoots = true;
    });

    const first = runner.run({ code: "pass", timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(90_000);
    expect((await first).status).toBe("crashed");

    const second = runner.run({ code: "pass", timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(10);

    expect((await second).status).toBe("ok");
    expect(FakeWorker.instances).toHaveLength(2);
    runner.dispose();
  });

  it("does not give up on a load that is merely slow", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.bootDelayMs = 20_000;
    });

    const pending = runner.run({ code: "pass" });
    await vi.advanceTimersByTimeAsync(20_010);

    expect((await pending).status).toBe("ok");
    runner.dispose();
  });

  it("terminates the worker on dispose and resolves anything still pending", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.behaviour = "silence";
    });
    await runner.ready();

    const pending = runner.run({ code: "while True: pass", timeoutMs: 60_000 });
    runner.dispose();

    expect((await pending).status).toBe("crashed");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
  });

  // ------------------------------------------------- packages (Track B)

  it("passes an exercise's declared packages to the worker", async () => {
    const runner = makeRunner();
    await runner.run({ code: "import pandas", packages: ["pandas"] });

    const run = FakeWorker.instances[0]!.received.find((message) => message.type === "run");
    expect(run).toMatchObject({ packages: ["pandas"] });
    runner.dispose();
  });

  it("does not count a package download against the run budget", async () => {
    // The regression this exists to prevent. The run timeout answers "has this
    // program stopped making progress"; a 30-second scipy download is not an
    // answer to that, and reporting it as an infinite loop would send a learner
    // hunting for a bug in code that had not started executing.
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.packageDelayMs = 30_000;
    });

    const pending = runner.run({ code: "import scipy", packages: ["scipy"], timeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(30_010);

    expect((await pending).status).toBe("ok");
    runner.dispose();
  });

  it("still stops a runaway loop once its packages have arrived", async () => {
    // The other half: handing the clock over during the download must not lose
    // it afterwards, or a Track B exercise would have no timeout at all.
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.packageDelayMs = 10_000;
      worker.behaviour = "silence";
    });

    const pending = runner.run({
      code: "import pandas\nwhile True: pass",
      packages: ["pandas"],
      timeoutMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(10_010); // packages land, clock restarts
    await vi.advanceTimersByTimeAsync(5_010); // budget expires

    const result = await pending;
    expect(result.status).toBe("timeout");
    expect(result.error?.message).toContain("5 seconds");
    runner.dispose();
  });

  it("gives up on a package download that never finishes", async () => {
    vi.useFakeTimers();
    const runner = makeRunner((worker) => {
      worker.packagesNeverArrive = true;
    });

    const pending = runner.run({ code: "import scipy", packages: ["scipy"] });
    await vi.advanceTimersByTimeAsync(90_010);

    const result = await pending;
    // Reported as an engine problem, not as the learner's code timing out.
    expect(result.status).toBe("crashed");
    expect(result.error?.message).toContain("scipy");
    runner.dispose();
  });

  it("reports the download through the state subscription", async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const runner = makeRunner((worker) => {
      worker.packageDelayMs = 1_000;
    });
    runner.subscribe((state) => states.push(state));

    const pending = runner.run({ code: "import pandas", packages: ["pandas"] });
    await vi.advanceTimersByTimeAsync(1_010);
    await pending;

    // So the interface can say what the pause is for rather than showing an
    // undifferentiated spinner.
    expect(states).toContain("loading-packages");
    runner.dispose();
  });
});
