"use client";

/**
 * The Python editor.
 *
 * CodeMirror 6 rather than Monaco, for the reason in the brief: it is materially
 * lighter, which matters when a ~14 MB WebAssembly payload is already being
 * loaded on the same page.
 *
 * Two accessibility choices worth keeping (Section 8, WCAG 2.1 AA):
 *
 *   - **The editor carries a real accessible name.** Getting this right is
 *     fiddlier than it looks, and an earlier version of this file got it wrong
 *     while claiming otherwise. `@uiw/react-codemirror` forwards `id` and
 *     `aria-label` to the outer wrapper `<div class="cm-editor">`, but the
 *     element that actually carries `role="textbox"` is the inner
 *     `.cm-content`. A label on the wrapper therefore names a plain div, and a
 *     screen reader announces the editor itself as an unnamed text box. The
 *     `contentAttributes` facet is CodeMirror's supported way to put attributes
 *     on the right element, so that is what is used. Caught by the axe sweep in
 *     `e2e/accessibility.spec.ts`, which is why that suite exists.
 *
 *   - **Tab indents, and the way out is announced.** Tab inserting indentation
 *     is correct for writing Python and a keyboard trap if it is the only
 *     behaviour. Escape returns Tab to moving focus, which satisfies WCAG 2.1.2
 *     — but only if the user is told, so the escape method is in the editor's
 *     description rather than left as folklore.
 */

import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useId, useMemo } from "react";

/**
 * Syntax colours that meet WCAG AA (4.5:1) on the editor's background.
 *
 * CodeMirror's default palette mostly does, but three of its colours do not,
 * and one of them is everywhere in this curriculum: f-string text is `#e40`, at
 * about 3.6:1 on the active line. Every lesson from Module 2 onward uses
 * f-strings, so every one has shipped code a low-vision learner could not
 * comfortably read — the accessibility audit only found it when it first
 * scanned a page containing one.
 *
 * So this is CodeMirror's default style, tag for tag, with exactly those three
 * darkened just enough to pass: special strings and escapes, type and namespace
 * names, and invalid tokens. Every other colour is unchanged, so the editor
 * looks the same to anyone who could already read it. The ratios, measured on
 * white and on the tinted active line, are in docs/accessibility.md.
 */
const readableHighlighting = HighlightStyle.define([
  { tag: t.meta, color: "#404740" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.heading, textDecoration: "underline", fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.keyword, color: "#708" },
  { tag: [t.atom, t.bool, t.url, t.contentSeparator, t.labelName], color: "#219" },
  { tag: [t.literal, t.inserted], color: "#164" },
  { tag: [t.string, t.deleted], color: "#a11" },
  { tag: [t.regexp, t.escape, t.special(t.string)], color: "#b43c00" }, // was #e40
  { tag: t.definition(t.variableName), color: "#00f" },
  { tag: t.local(t.variableName), color: "#30a" },
  { tag: [t.typeName, t.namespace], color: "#067047" }, // was #085
  { tag: t.className, color: "#167" },
  { tag: [t.special(t.variableName), t.macroName], color: "#256" },
  { tag: t.definition(t.propertyName), color: "#00c" },
  { tag: t.comment, color: "#940" },
  { tag: t.invalid, color: "#c00000" }, // was #f00
]);

const theme = EditorView.theme({
  "&": { fontSize: "14px", backgroundColor: "var(--color-paper)" },
  ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  ".cm-gutters": {
    backgroundColor: "var(--color-paper-sunk)",
    borderRight: "1px solid var(--color-rule)",
    color: "var(--color-ink-soft)",
  },
  "&.cm-focused": { outline: "2px solid var(--color-brand)", outlineOffset: "-2px" },
  ".cm-activeLine": { backgroundColor: "rgba(28, 92, 214, 0.05)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(28, 92, 214, 0.08)" },
});

export function CodeEditor({
  value,
  onChange,
  label,
  readOnly = false,
  minHeight = "12rem",
}: {
  value: string;
  onChange?: (next: string) => void;
  label: string;
  readOnly?: boolean;
  minHeight?: string;
}) {
  const hintId = `${useId()}-hint`;

  const extensions = useMemo(
    () => [
      python(),
      // Not a fallback: registering a full style here means CodeMirror's
      // default palette, with its three sub-AA colours, is never used.
      syntaxHighlighting(readableHighlighting),
      keymap.of([indentWithTab]),
      // Attributes land on `.cm-content`, the element with role="textbox" —
      // see the note at the top of this file.
      EditorView.contentAttributes.of({
        "aria-label": label,
        "aria-describedby": hintId,
      }),
      // Wrap long lines instead of scrolling sideways.
      //
      // Two reasons, and the accessibility one is the lesser. A horizontally
      // scrolling editor is a scrollable region, and axe rightly flags it: the
      // right-hand end of a long line is unreachable without a mouse
      // (WCAG 2.1.1). But it is also just bad for a beginner — code that runs
      // off the edge of the box is code they cannot read, on a phone especially,
      // and Track B's `groupby(...).agg([...])` lines are the first in the
      // curriculum long enough to hit it.
      EditorView.lineWrapping,
    ],
    [label, hintId],
  );

  return (
    <div className="overflow-hidden rounded border border-rule">
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        theme={theme}
        minHeight={minHeight}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          autocompletion: false, // Beginners do not benefit from guessing ahead of them.
          bracketMatching: true,
          closeBrackets: true,
        }}
      />
      {/* Announced when focus enters the editor. WCAG 2.1.2 allows a non-standard
          Tab behaviour only if the way out is communicated; this is that. */}
      <p id={hintId} className="sr-only">
        {readOnly
          ? "Read-only code. Press Escape and then Tab to move on."
          : "Code editor. Tab inserts indentation. Press Escape and then Tab to move to the next control."}
      </p>
    </div>
  );
}
