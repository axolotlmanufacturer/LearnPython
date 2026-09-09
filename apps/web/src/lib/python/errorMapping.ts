/**
 * Translates Python exceptions into plain-language explanations for beginners.
 *
 * Section 2 (principle 3) and Section 4.3 of the brief: feedback must explain
 * *why* something failed, not merely that it did. Cryptic tracebacks are the
 * single most common place a novice gets stuck and stays stuck.
 *
 * Two rules govern everything here:
 *
 *  1. **Explain, then point at the next action.** A learner who reads only the
 *     `nextStep` should still know what to do.
 *  2. **Never replace the traceback — sit above it.** The UI renders the real
 *     traceback underneath. The goal is a learner who eventually reads
 *     tracebacks unaided, not one insulated from them.
 *
 * Tone: describe the code, not the person. "Python reached the end of the line
 * still looking for a closing quote", not "you forgot a quote".
 *
 * This module is deliberately free of any Pyodide dependency so it can be
 * unit-tested exhaustively without booting an interpreter.
 */

import type { PythonError } from "./types";

export interface ErrorExplanation {
  /** Stable id, so tests and future analytics can refer to a specific rule. */
  id: string;
  /** One short line naming what happened, in the learner's vocabulary. */
  title: string;
  /** One to three sentences on why Python stopped. */
  explanation: string;
  /** A concrete thing to try next. */
  nextStep: string;
  /** Curriculum concept this failure relates to, for future hint targeting. */
  concept?: string;
}

interface Rule {
  id: string;
  type: string | string[];
  /** Optional narrowing on the exception message. */
  match?: RegExp;
  build: (error: PythonError, groups: string[]) => Omit<ErrorExplanation, "id">;
}

const quoted = (s: string | undefined, fallback: string) => (s ? `\`${s}\`` : fallback);

const RULES: Rule[] = [
  // ---------------------------------------------------------------- NameError
  {
    id: "name-error-undefined",
    type: "NameError",
    match: /name '([^']+)' is not defined/,
    build: (_e, [name]) => ({
      title: `Python does not know what ${quoted(name, "that name")} is`,
      explanation:
        `Python reads your program from top to bottom, and by this line it has not seen ` +
        `anything called ${quoted(name, "that name")}. That usually means one of three things: ` +
        `it is spelled differently from where it was created, it is created further down the ` +
        `file than where it is used, or it was meant to be text and is missing its quotes.`,
      nextStep:
        `Check the spelling against where ${quoted(name, "it")} was first given a value — Python ` +
        `treats \`score\` and \`Score\` as two different names. If you meant it as text, wrap it ` +
        `in quotes: \`"${name ?? "text"}"\`.`,
      concept: "variables",
    }),
  },
  {
    id: "name-error-generic",
    type: "NameError",
    build: () => ({
      title: "Python does not recognise one of the names in your code",
      explanation:
        "Something in this line has not been given a value yet, at least not before this point " +
        "in the program.",
      nextStep: "Check the spelling, and check that it is created above the line that uses it.",
      concept: "variables",
    }),
  },

  // ------------------------------------------------------- UnboundLocalError
  {
    id: "unbound-local",
    type: "UnboundLocalError",
    match: /local variable '([^']+)'/,
    build: (_e, [name]) => ({
      title: `${quoted(name, "That variable")} is used before it has a value inside this function`,
      explanation:
        `Because this function assigns to ${quoted(name, "it")} somewhere, Python treats it as ` +
        `belonging to the function — so the version outside the function is not visible here.`,
      nextStep:
        `Give ${quoted(name, "it")} a starting value at the top of the function, or pass it in ` +
        `as a parameter instead of relying on a variable from outside.`,
      concept: "scope",
    }),
  },

  // ------------------------------------------------------------- SyntaxError
  {
    id: "syntax-unclosed",
    type: ["SyntaxError"],
    match: /'(.)' was never closed/,
    build: (_e, [bracket]) => ({
      title: `An opening ${quoted(bracket, "bracket")} is never closed`,
      explanation:
        `Every \`(\`, \`[\` and \`{\` needs a partner. Python read to the end of your program ` +
        `still looking for the one that closes this ${quoted(bracket, "bracket")}.`,
      nextStep:
        "Start at the line the error points to and count opening and closing brackets across " +
        "it and the lines below.",
      concept: "syntax",
    }),
  },
  {
    id: "syntax-unterminated-string",
    type: "SyntaxError",
    match: /unterminated (?:triple-quoted )?string literal/,
    build: () => ({
      title: "A piece of text is missing its closing quote",
      explanation:
        "Text in Python has to open and close with the same kind of quote. Python reached the " +
        "end of the line still looking for the closing one.",
      nextStep: 'Check that this line has a matching quote at both ends: `"like this"`.',
      concept: "strings",
    }),
  },
  {
    id: "syntax-expected-colon",
    type: "SyntaxError",
    match: /expected ':'/,
    build: () => ({
      title: "This line needs a colon at the end",
      explanation:
        "Lines that start a block — `if`, `else`, `for`, `while`, `def` — end with a colon. " +
        "The colon is what tells Python that the indented lines beneath belong to this one.",
      nextStep: "Add `:` to the end of this line.",
      concept: "syntax",
    }),
  },
  {
    id: "syntax-assign-in-condition",
    type: "SyntaxError",
    match: /invalid syntax\. Maybe you meant '==' or ':=' instead of '='\?/,
    build: () => ({
      title: "This looks like a comparison written with one `=`",
      explanation:
        "`=` and `==` do different jobs. A single `=` stores a value in a variable; a double " +
        "`==` asks whether two values are the same, which is what a condition needs.",
      nextStep: "Use `==` in the condition, for example `if answer == 10:`.",
      concept: "conditionals",
    }),
  },
  {
    id: "syntax-missing-comma",
    type: "SyntaxError",
    match: /Perhaps you forgot a comma/,
    build: () => ({
      title: "Two values are sitting next to each other without a comma",
      explanation:
        "Inside a list, a set of function arguments, or a similar group, each item is separated " +
        "by a comma. Python found two items with nothing between them.",
      nextStep: "Add a `,` between the items on this line.",
      concept: "syntax",
    }),
  },
  {
    id: "syntax-print-statement",
    type: "SyntaxError",
    match: /Missing parentheses in call to '(\w+)'/,
    build: (_e, [name]) => ({
      title: `${quoted(name, "This")} needs brackets around what it is given`,
      explanation: `In Python, ${quoted(name, "this")} is a function, so the value goes inside brackets.`,
      nextStep: `Write it as \`${name ?? "print"}("your text here")\`.`,
      concept: "syntax",
    }),
  },
  {
    id: "syntax-generic",
    type: "SyntaxError",
    build: (e) => ({
      title: "Python could not make sense of this line",
      explanation:
        "A syntax error means Python stopped before running anything at all — it could not " +
        "read the program's structure. The problem is on the line shown, or occasionally at " +
        "the end of the line just above it, if something there was left unfinished.",
      nextStep: e.text
        ? `Look closely at \`${e.text.trim()}\` and the line above it: check for a missing colon, quote, or bracket.`
        : "Check that line and the one above it for a missing colon, quote, or bracket.",
      concept: "syntax",
    }),
  },

  // --------------------------------------------------------- IndentationError
  {
    id: "indent-expected-block",
    type: ["IndentationError", "TabError"],
    match: /expected an indented block/,
    build: () => ({
      title: "This block is empty",
      explanation:
        "After a line ending in a colon, Python expects at least one indented line underneath — " +
        "that indentation is how Python knows which lines belong to the `if`, `for`, or `def`.",
      nextStep: "Add a line below it, indented by four spaces.",
      concept: "indentation",
    }),
  },
  {
    id: "indent-unexpected",
    type: ["IndentationError", "TabError"],
    match: /unexpected indent/,
    build: () => ({
      title: "This line is indented further than Python expected",
      explanation:
        "Indentation is not decoration in Python — it is how the language groups lines together. " +
        "This line is pushed in without a line ending in a colon above it to open a block.",
      nextStep: "Remove the extra spaces at the start of this line.",
      concept: "indentation",
    }),
  },
  {
    id: "indent-mismatch",
    type: ["IndentationError", "TabError"],
    build: () => ({
      title: "The indentation on this line does not line up",
      explanation:
        "Lines in the same block must be indented by exactly the same amount. Mixing tabs and " +
        "spaces causes this too, because they can look identical while being different characters.",
      nextStep:
        "Line this up with the other lines in the same block, using four spaces per level " +
        "throughout.",
      concept: "indentation",
    }),
  },

  // ---------------------------------------------------------------- TypeError
  {
    id: "type-concat-str-int",
    type: "TypeError",
    match: /can only concatenate str \(not "(\w+)"\) to str/,
    build: (_e, [other]) => ({
      title: `Python will not join text and a ${quoted(other, "number")} with \`+\``,
      explanation:
        `\`+\` means "add" for numbers and "join" for text, and Python will not guess which you ` +
        `meant when you mix the two.`,
      nextStep:
        'Convert the number to text with `str(...)`, or use an f-string: `f"Total: {count}"`.',
      concept: "types",
    }),
  },
  {
    id: "type-unsupported-operand",
    type: "TypeError",
    match: /unsupported operand type\(s\) for (\S+): '(\w+)' and '(\w+)'/,
    build: (_e, [op, left, right]) => ({
      title: `\`${op}\` does not work between a ${left} and a ${right}`,
      explanation:
        `A value read with \`input()\` is always text, even when it looks like a number — that ` +
        `is the usual reason two things that "should" add up will not.`,
      nextStep:
        `If one of these is meant to be a number, convert it with \`int(...)\` or \`float(...)\` ` +
        `first.`,
      concept: "types",
    }),
  },
  {
    id: "type-comparison",
    type: "TypeError",
    match: /'(\S+)' not supported between instances of '(\w+)' and '(\w+)'/,
    build: (_e, [op, left, right]) => ({
      title: `Python cannot compare a ${left} with a ${right} using \`${op}\``,
      explanation:
        "Python can compare two numbers, or two pieces of text, but it will not rank a number " +
        "against text. Remember that `input()` always hands back text.",
      nextStep: "Convert the text to a number with `int(...)` or `float(...)` before comparing.",
      concept: "types",
    }),
  },
  {
    id: "type-not-callable",
    type: "TypeError",
    match: /'(\w+)' object is not callable/,
    build: (_e, [kind]) => ({
      title: `This is being used as a function, but it is a ${quoted(kind, "value")}`,
      explanation:
        "Round brackets after a name mean 'call this function'. Putting them after a variable " +
        "that holds a value asks Python to run the value, which it cannot do. A missing operator " +
        "does this too: `2(3 + 1)` looks like a function call to Python.",
      nextStep:
        "Check whether a name has been reused for both a variable and a function, and whether " +
        "an operator such as `*` is missing before the bracket.",
      concept: "functions",
    }),
  },
  {
    id: "type-not-subscriptable",
    type: "TypeError",
    match: /'(\w+)' object is not subscriptable/,
    build: (_e, [kind]) => ({
      title: `A ${quoted(kind, "value")} cannot be indexed with square brackets`,
      explanation:
        `Square brackets pick an item out of something that holds several items — a list, a ` +
        `string, a dictionary. A ${quoted(kind, "value")} is a single value, so there is nothing ` +
        `to pick from.`,
      nextStep:
        "Check that this variable holds what you expect — try printing it on the line above.",
      concept: "collections",
    }),
  },
  {
    id: "type-argument-count",
    type: "TypeError",
    match: /(\w+)\(\) (?:takes|missing)/,
    build: (e, [name]) => ({
      title: `${quoted(name, "This function")} was called with the wrong number of values`,
      explanation:
        `Python reported: ${e.message}. The values in the brackets at the call have to match the ` +
        `parameters listed in the \`def\` line, in number and in order.`,
      nextStep: `Compare this call with the \`def ${name ?? "..."}(...)\` line that defines it.`,
      concept: "functions",
    }),
  },
  {
    id: "type-none-iteration",
    type: "TypeError",
    match: /'NoneType' object is not (?:iterable|subscriptable)/,
    build: () => ({
      title: "This value is `None`, which usually means a function returned nothing",
      explanation:
        "A function without a `return` statement hands back `None`. Some methods also change a " +
        "list in place and return `None` rather than a new list — `sort()` is the common one.",
      nextStep:
        "Check that the function you called has a `return` statement, and that you are not " +
        "assigning the result of something like `my_list.sort()`.",
      concept: "functions",
    }),
  },
  {
    id: "type-generic",
    type: "TypeError",
    build: (e) => ({
      title: "A value is not the type this operation needs",
      explanation: `Python reported: ${e.message}. This usually means text is being used where a number is needed, or the reverse.`,
      nextStep:
        "Print the values involved on the line above to see what they actually hold, then convert " +
        "with `int(...)`, `float(...)` or `str(...)` as needed.",
      concept: "types",
    }),
  },

  // --------------------------------------------------------------- ValueError
  {
    id: "value-int-conversion",
    type: "ValueError",
    match: /invalid literal for int\(\) with base 10: '(.*)'/,
    build: (_e, [text]) => ({
      title: `\`int()\` cannot turn ${quoted(text, "that text")} into a whole number`,
      explanation:
        "`int()` only accepts text that is entirely digits — no letters, no spaces in the middle, " +
        'and no decimal point. `int("3.5")` fails for this reason.',
      nextStep:
        "Use `float(...)` if the value can have a decimal point, and check what the text actually " +
        "contains before converting it.",
      concept: "types",
    }),
  },
  {
    id: "value-unpack",
    type: "ValueError",
    match: /(?:not enough values to unpack|too many values to unpack)/,
    build: (e) => ({
      title: "The number of values does not match the number of names",
      explanation: `Python reported: ${e.message}. Unpacking assigns values to names one for one, so both sides have to have the same count.`,
      nextStep: "Print the value being unpacked to see how many items it actually contains.",
      concept: "collections",
    }),
  },
  {
    id: "value-generic",
    type: "ValueError",
    build: (e) => ({
      title: "A value was the right type, but not a usable one",
      explanation: `Python reported: ${e.message}. The kind of value was correct; its content was not something this operation could work with.`,
      nextStep: "Print the value just before this line to see what is actually being passed in.",
    }),
  },

  // ------------------------------------------------------ Index / Key errors
  {
    id: "index-out-of-range",
    type: "IndexError",
    build: () => ({
      title: "There is no item at that position",
      explanation:
        "Positions in Python start at 0, so a list of 3 items has positions 0, 1 and 2 — asking " +
        "for position 3 goes past the end. This is a very common off-by-one when looping.",
      nextStep:
        "Print `len(...)` of the list just above this line, and remember the last valid position " +
        "is `len(...) - 1`.",
      concept: "collections",
    }),
  },
  {
    id: "key-error",
    type: "KeyError",
    build: (e) => ({
      title: `This dictionary has no key ${quoted(e.message.replace(/^'|'$/g, ""), "of that name")}`,
      explanation:
        "Looking up a key that is not in the dictionary stops the program. Keys are case- and " +
        'type-sensitive: `"1"` and `1` are different keys.',
      nextStep:
        "Print the dictionary just above this line to see its actual keys, or use " +
        "`my_dict.get(key)`, which returns `None` instead of stopping.",
      concept: "collections",
    }),
  },

  // ------------------------------------------------------------- Attribute
  {
    id: "attribute-error",
    type: "AttributeError",
    match: /'(\w+)' object has no attribute '(\w+)'/,
    build: (e, [kind, attr]) => ({
      title: `A ${quoted(kind, "value")} has no ${quoted(attr, "such")} method`,
      explanation:
        `Different types can do different things: text has \`.upper()\`, lists have \`.append()\`, ` +
        `and they are not interchangeable. This is either a spelling slip or a value that is not ` +
        `the type you expected.` +
        (e.message.includes("Did you mean")
          ? " Python's own suggestion is in the traceback below."
          : ""),
      nextStep: `Print the value on the line above to confirm it is really a ${kind ?? "value"} of the type you expect.`,
      concept: "types",
    }),
  },

  // ------------------------------------------------------------ Runtime misc
  {
    id: "zero-division",
    type: "ZeroDivisionError",
    build: () => ({
      title: "Something was divided by zero",
      explanation:
        "Division by zero has no answer in mathematics, so Python stops rather than inventing " +
        "one. When this happens inside a loop or an average, the divider is often a count that " +
        "happened to be empty.",
      nextStep:
        "Check the value on the right of the `/` or `%` just before this line, and guard it with " +
        "`if count != 0:` if it can legitimately be zero.",
      concept: "arithmetic",
    }),
  },
  {
    id: "recursion",
    type: "RecursionError",
    build: () => ({
      title: "A function kept calling itself and never stopped",
      explanation:
        "A function that calls itself needs a case where it stops calling and simply returns. " +
        "Without that base case it goes round forever, and Python cuts it off.",
      nextStep:
        "Add an `if` at the top of the function that returns a value directly for the simplest " +
        "case, without calling itself.",
      concept: "functions",
    }),
  },
  {
    id: "eof-input",
    type: "EOFError",
    build: () => ({
      title: "The program asked for more input than this exercise provides",
      explanation:
        "Each exercise supplies a fixed set of answers to `input()`. Your program called " +
        "`input()` more times than there were answers — often because a loop calls it repeatedly.",
      nextStep: "Count the `input()` calls your program makes against what the exercise describes.",
      concept: "input",
    }),
  },
  {
    id: "module-not-found",
    type: ["ModuleNotFoundError", "ImportError"],
    match: /No module named '([\w.]+)'/,
    build: (_e, [name]) => ({
      title: `The module ${quoted(name, "requested")} is not available here`,
      explanation:
        "Python runs inside your browser on this platform, which includes the standard library " +
        "but not every package that exists. Check the spelling first — this is also what a typo " +
        "in an import looks like.",
      nextStep:
        "If this module is genuinely needed for the exercise, that is a gap in the platform " +
        "rather than a mistake in your code — please report it.",
      concept: "imports",
    }),
  },
  {
    id: "output-limit",
    type: "OutputLimit",
    build: () => ({
      title: "This program printed far more than expected",
      explanation:
        "Output was stopped to keep the page responsive. Producing this much output almost " +
        "always means a `print` is inside a loop whose stopping condition is never reached.",
      nextStep:
        "Look at the loop containing the `print`: check that the value in its condition actually " +
        "changes each time round.",
      concept: "loops",
    }),
  },
  {
    id: "timeout",
    type: "Timeout",
    build: () => ({
      title: "The program was still running, so it was stopped",
      explanation:
        "Code that has not finished after several seconds is nearly always stuck in a loop that " +
        "never ends — the condition it checks stays true forever, either because nothing changes " +
        "it, or because it changes in the wrong direction.",
      nextStep:
        "Find the `while` loop and check that the variable in its condition is updated inside " +
        "the loop, in the direction that eventually makes the condition false.",
      concept: "loops",
    }),
  },
  {
    id: "keyboard-interrupt",
    type: "KeyboardInterrupt",
    build: () => ({
      title: "The program was stopped while it was still running",
      explanation:
        "This almost always means a loop that never ends. It was interrupted rather than left " +
        "to run forever.",
      nextStep: "Check that the variable in your loop's condition changes inside the loop body.",
      concept: "loops",
    }),
  },
];

const GENERIC: Omit<ErrorExplanation, "id"> = {
  title: "The program stopped with an error",
  explanation:
    "Python ran into something it could not continue past. The traceback below names the error " +
    "type and points at the line where it happened.",
  nextStep:
    "Read the last line of the traceback first — it names the problem — then look at the line " +
    "number it reports.",
};

/**
 * Map a structured Python error to a beginner-facing explanation.
 * Rules are ordered; the first matching rule wins.
 */
export function explainError(error: PythonError): ErrorExplanation {
  for (const rule of RULES) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!types.includes(error.type)) continue;

    if (!rule.match) {
      return { id: rule.id, ...rule.build(error, []) };
    }
    const found = rule.match.exec(error.message);
    if (found) {
      return { id: rule.id, ...rule.build(error, found.slice(1) as string[]) };
    }
  }
  return { id: "generic", ...GENERIC };
}

/** Every rule id, for tests that assert coverage of the rule table. */
export const RULE_IDS = RULES.map((r) => r.id);
