import { describe, expect, it } from "vitest";

import { explainError, RULE_IDS } from "./errorMapping";
import type { PythonError } from "./types";

function err(partial: Partial<PythonError> & Pick<PythonError, "type" | "message">): PythonError {
  return { line: 1, column: null, text: "", traceback: "", ...partial };
}

describe("explainError", () => {
  it("names the specific undefined variable and warns about case sensitivity", () => {
    const result = explainError(err({ type: "NameError", message: "name 'totl' is not defined" }));

    expect(result.id).toBe("name-error-undefined");
    expect(result.title).toContain("totl");
    expect(result.nextStep).toMatch(/case|spelling/i);
  });

  it("explains == vs = for the beginner's classic condition mistake", () => {
    const result = explainError(
      err({
        type: "SyntaxError",
        message: "invalid syntax. Maybe you meant '==' or ':=' instead of '='?",
      }),
    );

    expect(result.id).toBe("syntax-assign-in-condition");
    expect(result.explanation).toContain("==");
  });

  it("distinguishes an empty block from stray indentation", () => {
    expect(
      explainError(err({ type: "IndentationError", message: "expected an indented block" })).id,
    ).toBe("indent-expected-block");
    expect(explainError(err({ type: "IndentationError", message: "unexpected indent" })).id).toBe(
      "indent-unexpected",
    );
  });

  it("points at input() returning text when a number and a string are added", () => {
    const result = explainError(
      err({ type: "TypeError", message: 'can only concatenate str (not "int") to str' }),
    );

    expect(result.id).toBe("type-concat-str-int");
    expect(result.nextStep).toMatch(/str\(|f"/);
  });

  it("explains an unsupported operand pair in terms of input() being text", () => {
    const result = explainError(
      err({ type: "TypeError", message: "unsupported operand type(s) for +: 'int' and 'str'" }),
    );

    expect(result.id).toBe("type-unsupported-operand");
    expect(result.title).toContain("+");
    expect(result.explanation).toContain("input()");
  });

  it("explains an IndexError as zero-based counting", () => {
    const result = explainError(err({ type: "IndexError", message: "list index out of range" }));

    expect(result.explanation).toContain("0");
    expect(result.nextStep).toContain("len(");
  });

  it("reports the missing key by name and offers .get()", () => {
    const result = explainError(err({ type: "KeyError", message: "'colour'" }));

    expect(result.title).toContain("colour");
    expect(result.nextStep).toContain(".get(");
  });

  it("attributes a None value to a function with no return statement", () => {
    const result = explainError(
      err({ type: "TypeError", message: "'NoneType' object is not iterable" }),
    );

    expect(result.id).toBe("type-none-iteration");
    expect(result.explanation).toContain("return");
  });

  it("treats a timeout as a loop that never ends, not a learner failure", () => {
    const result = explainError(err({ type: "Timeout", message: "stopped after 5 seconds" }));

    expect(result.id).toBe("timeout");
    expect(result.nextStep).toMatch(/while|condition/i);
  });

  it("explains int() rejecting non-numeric text, naming the text", () => {
    const result = explainError(
      err({ type: "ValueError", message: "invalid literal for int() with base 10: 'twelve'" }),
    );

    expect(result.id).toBe("value-int-conversion");
    expect(result.title).toContain("twelve");
  });

  it("falls back to a per-type explanation before the generic one", () => {
    // A TypeError whose message matches no specific rule still gets TypeError advice.
    const result = explainError(err({ type: "TypeError", message: "something unforeseen" }));

    expect(result.id).toBe("type-generic");
    expect(result.explanation).toContain("something unforeseen");
  });

  it("falls back to a generic explanation for an unknown exception type", () => {
    const result = explainError(err({ type: "SomeFutureError", message: "who knows" }));

    expect(result.id).toBe("generic");
    expect(result.nextStep).toContain("traceback");
  });

  it("gives every rule a distinct id", () => {
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length);
  });

  it("never returns an explanation missing a title, explanation, or next step", () => {
    const samples: PythonError[] = [
      err({ type: "NameError", message: "name 'x' is not defined" }),
      err({ type: "SyntaxError", message: "'(' was never closed" }),
      err({ type: "SyntaxError", message: "unterminated string literal (detected at line 1)" }),
      err({ type: "SyntaxError", message: "expected ':'" }),
      err({ type: "SyntaxError", message: "Missing parentheses in call to 'print'" }),
      err({ type: "IndentationError", message: "unindent does not match any outer level" }),
      err({ type: "TypeError", message: "'str' object is not callable" }),
      err({ type: "TypeError", message: "'int' object is not subscriptable" }),
      err({ type: "TypeError", message: "greet() takes 1 positional argument but 2 were given" }),
      err({ type: "TypeError", message: "'<' not supported between instances of 'str' and 'int'" }),
      err({ type: "AttributeError", message: "'str' object has no attribute 'lenght'" }),
      err({ type: "ValueError", message: "not enough values to unpack (expected 2, got 1)" }),
      err({ type: "ZeroDivisionError", message: "division by zero" }),
      err({ type: "RecursionError", message: "maximum recursion depth exceeded" }),
      err({
        type: "UnboundLocalError",
        message: "local variable 'total' referenced before assignment",
      }),
      err({ type: "EOFError", message: "no input left" }),
      err({ type: "ModuleNotFoundError", message: "No module named 'requests'" }),
      err({ type: "OutputLimit", message: "too much output" }),
      err({ type: "KeyboardInterrupt", message: "" }),
    ];

    for (const sample of samples) {
      const result = explainError(sample);
      expect(result.title.length, sample.type).toBeGreaterThan(0);
      expect(result.explanation.length, sample.type).toBeGreaterThan(0);
      expect(result.nextStep.length, sample.type).toBeGreaterThan(0);
      // Blame the code, not the learner.
      expect(result.explanation.toLowerCase(), sample.type).not.toContain("you forgot");
    }
  });
});
