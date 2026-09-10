"use client";

/**
 * The Python editor.
 *
 * CodeMirror 6 rather than Monaco, for the reason in the brief: it is materially
 * lighter, which matters when a ~14 MB WebAssembly payload is already being
 * loaded on the same page.
 *
 * Two accessibility choices worth keeping (Section 8, WCAG 2.1 AA):
 *   - Tab inserts indentation *only* while the editor has focus and the learner
 *     has chosen to indent; Escape first returns Tab to its normal
 *     move-to-next-control behaviour, so a keyboard user is never trapped.
 *   - The editor carries a real label, so a screen reader announces what it is.
 */

import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useId } from "react";

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
  const id = useId();

  return (
    <div className="overflow-hidden rounded border border-rule">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <CodeMirror
        id={id}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        theme={theme}
        minHeight={minHeight}
        extensions={[python(), keymap.of([indentWithTab])]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          autocompletion: false, // Beginners do not benefit from guessing ahead of them.
          bracketMatching: true,
          closeBrackets: true,
        }}
        aria-label={label}
      />
    </div>
  );
}
