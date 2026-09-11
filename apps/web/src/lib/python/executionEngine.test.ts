/**
 * Execution-engine tests (brief §10): output capture, timeout enforcement, and
 * exception mapping, exercised against a real Pyodide interpreter running the
 * same harness.py the browser uses.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { explainError } from "./errorMapping";
import { NodePyodideRunner } from "./nodeRunner";
import type { Check, ExecutionResult } from "./types";

let runner: NodePyodideRunner;

beforeAll(async () => {
  runner = new NodePyodideRunner();
  await runner.ready();
}, 180_000);

afterAll(() => runner?.dispose());

const run = (
  code: string,
  options: {
    stdin?: string[];
    checks?: Check[];
    files?: Record<string, string>;
    timeoutMs?: number;
  } = {},
) => runner.run({ code, ...options });

describe("output capture", () => {
  it("captures printed output", async () => {
    const result = await run('print("hello")\nprint(1 + 1)');

    expect(result.status).toBe("ok");
    expect(result.stdout).toBe("hello\n2\n");
    expect(result.error).toBeNull();
  });

  it("captures stderr separately from stdout", async () => {
    const result = await run('import sys\nprint("out")\nsys.stderr.write("bad\\n")');

    expect(result.stdout).toBe("out\n");
    expect(result.stderr).toBe("bad\n");
  });

  it("preserves the interleaving of streams for the output pane", async () => {
    const result = await run('import sys\nprint("a")\nsys.stderr.write("b")\nprint("c")');

    expect(result.console.map((s) => s.stream)).toEqual(["out", "err", "out"]);
    expect(result.console.map((s) => s.text)).toEqual(["a\n", "b", "c\n"]);
  });

  it("starts each run with a clean namespace", async () => {
    await run("leaked = 41");
    const result = await run("print(leaked)");

    expect(result.status).toBe("error");
    expect(result.error?.type).toBe("NameError");
  });

  it("stops runaway output instead of freezing the page", async () => {
    const result = await run('for i in range(1000000):\n    print("x" * 100)');

    expect(result.truncated).toBe(true);
    expect(result.error?.type).toBe("OutputLimit");
    expect(result.stdout.length).toBeLessThan(400_000);
  });
});

describe("input()", () => {
  it("feeds supplied lines to input() in order", async () => {
    const result = await run("a = input()\nb = input()\nprint(a + b)", {
      stdin: ["one", "two"],
    });

    expect(result.stdout).toBe("onetwo\n");
  });

  it("writes the prompt to stdout, as CPython does", async () => {
    const result = await run('name = input("Name? ")\nprint("Hi", name)', { stdin: ["Ada"] });

    expect(result.stdout).toBe("Name? Hi Ada\n");
  });

  it("shows the typed value in the console but keeps it out of stdout", async () => {
    // A terminal echoes what the learner types, but those characters are not
    // part of the program's output and must not affect a stdout check.
    const result = await run('name = input("Name? ")', { stdin: ["Ada"] });

    expect(result.console).toEqual([
      { stream: "out", text: "Name? " },
      { stream: "in", text: "Ada\n" },
    ]);
    expect(result.stdout).toBe("Name? ");
  });

  it("reports running out of input as an EOFError with a beginner explanation", async () => {
    const result = await run("input()\ninput()", { stdin: ["only one"] });

    expect(result.error?.type).toBe("EOFError");
    expect(explainError(result.error!).id).toBe("eof-input");
  });
});

describe("error reporting", () => {
  it("reports the line number in the learner's own code, not a harness frame", async () => {
    const result = await run("x = 1\ny = 2\nprint(undefined_name)\n");

    expect(result.status).toBe("error");
    expect(result.error?.type).toBe("NameError");
    expect(result.error?.line).toBe(3);
    expect(result.error?.text).toBe("print(undefined_name)");
  });

  it("keeps harness frames out of the traceback shown to the learner", async () => {
    const result = await run("raise ValueError('boom')");

    expect(result.error?.traceback).toContain("ValueError: boom");
    expect(result.error?.traceback).not.toContain("run_submission");
    expect(result.error?.traceback).not.toContain("harness");
  });

  it("shows the offending source line in the traceback", async () => {
    // Code compiled from a string has no file for `traceback` to read, so
    // without help every frame would show a bare line number — losing the part
    // a beginner most needs to see.
    const result = await run(["def half(n):", "    return n / 0", "", "half(4)"].join("\n"));

    expect(result.error?.traceback).toContain("return n / 0");
    expect(result.error?.traceback).toContain("half(4)");
    expect(result.error?.traceback).toContain("<your code>");
  });

  it("reports a syntax error with its line, before running anything", async () => {
    const result = await run('print("never runs")\nif True\n    pass\n');

    expect(result.status).toBe("error");
    expect(result.error?.type).toBe("SyntaxError");
    expect(result.error?.line).toBe(2);
    expect(result.stdout).toBe(""); // nothing executed at all
  });

  it("reports the line inside a function where the failure happened", async () => {
    const result = await run(
      ["def average(values):", "    return sum(values) / len(values)", "", "average([])"].join(
        "\n",
      ),
    );

    expect(result.error?.type).toBe("ZeroDivisionError");
    expect(result.error?.line).toBe(2);
  });

  it("keeps output produced before the error", async () => {
    const result = await run('print("before")\n1 / 0');

    expect(result.stdout).toBe("before\n");
    expect(result.error?.type).toBe("ZeroDivisionError");
  });

  it("produces errors that the mapping layer explains in plain language", async () => {
    const cases: Array<[string, string]> = [
      ['print("a" + 1)', "type-concat-str-int"],
      ["print([1, 2][5])", "index-out-of-range"],
      ['print({"a": 1}["b"])', "key-error"],
      ["print(1 / 0)", "zero-division"],
      ['print(int("twelve"))', "value-int-conversion"],
      ['print("hi".lenght())', "attribute-error"],
      ["if True\n    pass", "syntax-expected-colon"],
      ["if True:\npass", "indent-expected-block"],
    ];

    for (const [code, expectedRule] of cases) {
      const result = await run(code);
      expect(result.error, code).not.toBeNull();
      expect(explainError(result.error!).id, code).toBe(expectedRule);
    }
  });

  it("treats sys.exit() as a normal finish, not a crash", async () => {
    const result = await run('import sys\nprint("done")\nsys.exit(0)');

    expect(result.status).toBe("ok");
    expect(result.stdout).toBe("done\n");
  });
});

describe("timeout enforcement", () => {
  it("stops a loop that never ends and reports it as a timeout", async () => {
    const result = await run("while True:\n    pass", { timeoutMs: 1500 });

    expect(result.status).toBe("timeout");
    expect(result.passed).toBe(false);
    expect(explainError(result.error!).id).toBe("timeout");
  }, 30_000);

  it("stays usable after a timeout", async () => {
    await run("while True:\n    pass", { timeoutMs: 1000 });
    const result = await run('print("still alive")');

    expect(result.status).toBe("ok");
    expect(result.stdout).toBe("still alive\n");
  }, 30_000);

  it("does not interrupt code that finishes in time", async () => {
    const result = await run("total = 0\nfor i in range(200000):\n    total += i\nprint(total)", {
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("ok");
    expect(result.stdout.trim()).toBe("19999900000");
  }, 30_000);
});

describe("stdout checks", () => {
  const checkFor = (expected: string, match?: "exact" | "normalized" | "contains"): Check[] => [
    { kind: "stdout", label: "Prints the greeting", expected, ...(match ? { match } : {}) },
  ];

  it("passes when the output matches", async () => {
    const result = await run('print("Hello, world!")', { checks: checkFor("Hello, world!") });

    expect(result.passed).toBe(true);
    expect(result.checks[0]!.status).toBe("passed");
  });

  it("forgives trailing whitespace and surrounding blank lines by default", async () => {
    const result = await run('print("")\nprint("Hello, world!   ")\nprint("")', {
      checks: checkFor("Hello, world!"),
    });

    expect(result.passed).toBe(true);
  });

  it("does not forgive whitespace under exact matching", async () => {
    const result = await run('print("Hello, world!   ")', {
      checks: checkFor("Hello, world!\n", "exact"),
    });

    expect(result.passed).toBe(false);
  });

  it("supports contains matching for open-ended output", async () => {
    const result = await run('print("The answer is 42, obviously")', {
      checks: checkFor("answer is 42", "contains"),
    });

    expect(result.passed).toBe(true);
  });

  it("explains a mismatch rather than just failing", async () => {
    const result = await run('print("Goodbye")', { checks: checkFor("Hello") });

    expect(result.passed).toBe(false);
    expect(result.checks[0]!.detail).toBeTruthy();
    expect(result.checks[0]!.expected).toBe("Hello");
    expect(result.checks[0]!.actual).toBe("Goodbye");
  });

  it("ignores echoed input when matching output", async () => {
    const result = await run('name = input("Name? ")\nprint(f"Hello, {name}!")', {
      stdin: ["Ada"],
      checks: [{ kind: "stdout", label: "Greets by name", expected: "Name? Hello, Ada!" }],
    });

    expect(result.passed).toBe(true);
  });
});

describe("call checks", () => {
  it("calls the learner's function and compares the return value", async () => {
    const result = await run("def double(n):\n    return n * 2", {
      checks: [
        { kind: "call", label: "double(4) is 8", function: "double", args: [4], expected: 8 },
        { kind: "call", label: "double(0) is 0", function: "double", args: [0], expected: 0 },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(2);
  });

  it("says the function is missing rather than reporting a bare failure", async () => {
    const result = await run("def dubble(n):\n    return n * 2", {
      checks: [{ kind: "call", label: "double(4)", function: "double", args: [4], expected: 8 }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0]!.detail).toContain("double");
    expect(result.checks[0]!.detail).toMatch(/does not define|spelling/i);
  });

  it("explains a None return as a missing return statement", async () => {
    const result = await run("def double(n):\n    n * 2", {
      checks: [{ kind: "call", label: "double(4)", function: "double", args: [4], expected: 8 }],
    });

    expect(result.checks[0]!.detail).toContain("return");
  });

  it("reports an exception raised inside the learner's function", async () => {
    const result = await run("def double(n):\n    return n * undefined", {
      checks: [{ kind: "call", label: "double(4)", function: "double", args: [4], expected: 8 }],
    });

    expect(result.checks[0]!.passed).toBe(false);
    expect(result.checks[0]!.detail).toContain("NameError");
  });

  it("matches a returned tuple against a JSON-authored list", async () => {
    const result = await run("def pair():\n    return (1, 2)", {
      checks: [{ kind: "call", label: "pair()", function: "pair", args: [], expected: [1, 2] }],
    });

    expect(result.passed).toBe(true);
  });

  it("compares floats within a tolerance", async () => {
    const result = await run("def third():\n    return 1 / 3", {
      checks: [
        { kind: "call", label: "third()", function: "third", expected: 0.3333, tolerance: 1e-3 },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("does not accept 1 where True was expected", async () => {
    const result = await run("def flag():\n    return 1", {
      checks: [{ kind: "call", label: "flag()", function: "flag", expected: true }],
    });

    expect(result.passed).toBe(false);
  });

  it("passes keyword arguments through", async () => {
    const result = await run(
      "def greet(name, greeting='Hello'):\n    return f'{greeting}, {name}!'",
      {
        checks: [
          {
            kind: "call",
            label: "greet with a custom greeting",
            function: "greet",
            args: ["Ada"],
            kwargs: { greeting: "Hi" },
            expected: "Hi, Ada!",
          },
        ],
      },
    );

    expect(result.passed).toBe(true);
  });
});

describe("expr checks", () => {
  it("inspects a variable the learner created", async () => {
    const result = await run("total = 10 + 5", {
      checks: [{ kind: "expr", label: "total is 15", expression: "total", expected: 15 }],
    });

    expect(result.passed).toBe(true);
  });

  it("names the missing variable instead of reporting a NameError", async () => {
    const result = await run("totl = 15", {
      checks: [{ kind: "expr", label: "total is 15", expression: "total", expected: 15 }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0]!.detail).toContain("total");
    expect(result.checks[0]!.detail).toMatch(/never creates it/);
  });

  it("treats a missing expected value as a truthiness assertion", async () => {
    const result = await run("names = ['a', 'b']", {
      checks: [{ kind: "expr", label: "names has two entries", expression: "len(names) == 2" }],
    });

    expect(result.passed).toBe(true);
  });
});

describe("source checks", () => {
  it("requires the technique the exercise is practising", async () => {
    const withLoop = await run("total = 0\nfor n in [1, 2, 3]:\n    total += n", {
      checks: [{ kind: "source", label: "Uses a for loop", require_ast: ["For"] }],
    });
    const withoutLoop = await run("total = sum([1, 2, 3])", {
      checks: [{ kind: "source", label: "Uses a for loop", require_ast: ["For"] }],
    });

    expect(withLoop.passed).toBe(true);
    expect(withoutLoop.passed).toBe(false);
    expect(withoutLoop.checks[0]!.detail).toContain("`for` loop");
  });

  it("does not mistake a word containing 'for' for a for loop", async () => {
    const result = await run('before = "information"\nprint(before)', {
      checks: [{ kind: "source", label: "Uses a for loop", require_ast: ["For"] }],
    });

    expect(result.passed).toBe(false);
  });

  it("can forbid a shortcut the exercise is asking the learner to avoid", async () => {
    const result = await run("total = sum([1, 2, 3])", {
      checks: [{ kind: "source", label: "Without sum()", forbid_text: ["sum("] }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0]!.detail).toContain("sum(");
  });
});

describe("the filesystem", () => {
  it("hands the program the files an exercise supplies", async () => {
    const result = await run('print(open("notes.txt").read())', {
      files: { "notes.txt": "first line\nsecond line\n" },
    });

    expect(result.status).toBe("ok");
    expect(result.stdout).toBe("first line\nsecond line\n\n");
  });

  it("gives each run a clean directory", async () => {
    // Without this, an exercise that forgot to create the file it reads would
    // pass because an earlier exercise left one behind — which is exactly the
    // fault the content tests exist to catch, so the harness must not hide it.
    await run('open("leftover.txt", "w").write("from an earlier run")');
    const result = await run('print(open("leftover.txt").read())');

    expect(result.status).toBe("error");
    expect(result.error?.type).toBe("FileNotFoundError");
  });

  it("does not leak a supplied file into the next run", async () => {
    await run("pass", { files: { "seeded.txt": "hello" } });
    const result = await run('print(open("seeded.txt").read())');

    expect(result.error?.type).toBe("FileNotFoundError");
  });

  it("checks what the program wrote to a file", async () => {
    const result = await run('with open("out.txt", "w") as f:\n    f.write("saved\\n")', {
      checks: [
        { kind: "file", label: "Writes the line to out.txt", path: "out.txt", expected: "saved" },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("says the file is missing rather than reporting a bare failure", async () => {
    const result = await run('print("did nothing")', {
      checks: [{ kind: "file", label: "Writes out.txt", path: "out.txt", expected: "saved" }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0]!.detail).toContain("no such file");
    expect(result.checks[0]!.detail).toContain("open(");
  });

  it("compares file contents forgivingly by default", async () => {
    const result = await run('open("out.txt", "w").write("saved   \\n\\n")', {
      checks: [{ kind: "file", label: "Writes the line", path: "out.txt", expected: "saved" }],
    });

    expect(result.passed).toBe(true);
  });

  it("lets a program read a seeded file and write a derived one", async () => {
    const result = await run(
      [
        'lines = open("in.txt").read().splitlines()',
        'with open("out.txt", "w") as f:',
        "    for line in lines:",
        '        f.write(line.upper() + "\\n")',
      ].join("\n"),
      {
        files: { "in.txt": "one\ntwo\n" },
        checks: [
          {
            kind: "file",
            label: "Writes the lines in capitals",
            path: "out.txt",
            expected: "ONE\nTWO",
          },
        ],
      },
    );

    expect(result.passed).toBe(true);
  });
});

describe("check orchestration", () => {
  it("does not run checks when the code failed, and says why", async () => {
    const result: ExecutionResult = await run("1 / 0", {
      checks: [{ kind: "stdout", label: "Prints something", expected: "anything" }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0]!.status).toBe("not_run");
    expect(result.checks[0]!.detail).toContain("error");
  });

  it("reports every check, not just the first failure", async () => {
    const result = await run("def double(n):\n    return n + 2", {
      checks: [
        { kind: "call", label: "double(1)", function: "double", args: [1], expected: 2 },
        { kind: "call", label: "double(5)", function: "double", args: [5], expected: 10 },
      ],
    });

    expect(result.checks).toHaveLength(2);
    expect(result.checks.map((c) => c.passed)).toEqual([false, false]);
  });

  it("runs code with no checks at all, for a plain Run button", async () => {
    const result = await run('print("just running")');

    expect(result.status).toBe("ok");
    expect(result.checks).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
