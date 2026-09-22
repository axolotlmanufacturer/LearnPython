# Accessibility

Target: **WCAG 2.1 Level AA** (Section 8 of the brief).

Status: **conforming against automated WCAG 2.1 AA rules on every page type, with
the manual checks below performed.** The MVP acceptance criterion in §11 asks for
this to be documented, so this is the document — but the numbers in it are
produced by `apps/web/e2e/accessibility.spec.ts`, which runs in CI. A report
someone ran once is out of date by the next commit; a failing build is not.

## How it is measured

`axe-core` via Playwright, restricted to the `wcag2a`, `wcag2aa`, `wcag21a` and
`wcag21aa` rule tags. Any violation fails the build.

`best-practice` rules are deliberately excluded. They mix genuine advice with
opinion that is not a conformance requirement, and a suite that fails on opinion
teaches people to ignore it.

### What that does and does not prove

Automated rules catch somewhere between a third and a half of real WCAG
failures. They are reliable on the mechanical ones — contrast ratios, missing
accessible names, invalid ARIA, heading structure, form labelling — and
completely blind to whether the reading order makes sense, whether an error
message is comprehensible, or whether a learner can actually complete a task.

So the automated sweep is paired with explicit tests for the two interactions
nobody using this platform can avoid: **running code** and **answering a review
question**. Those are where a keyboard trap or an unannounced result would stop
someone outright.

### Scanned states

Static page scans miss the states that actually fail. A failure callout that
renders low-contrast text on a tinted wash passes an audit of the empty page and
fails the learner who got something wrong. So the suite scans:

| State                            | Why this one                                           |
| -------------------------------- | ------------------------------------------------------ |
| Landing, sign in, sign up        | First contact; the auth forms are the only real forms  |
| Curriculum, module               | Navigation and heading structure                       |
| Lesson with exercises            | The editor, the worked example, the run controls       |
| Lesson **after feedback**        | Pass and fail callouts, only reachable by running code |
| Review queue                     | Radio groups, live regions                             |
| Review question **after answer** | The verdict, which is injected into a live region      |
| Track B lesson                   | Tables in lesson prose; long lines in the editor       |
| Lesson with supplied input       | f-strings in the editor; the supplied-answers note     |

## Findings

### Fixed — the code editor had no accessible name (serious)

`aria-input-field-name`, on every exercise and every worked example.

`CodeEditor.tsx` carried both a `<label htmlFor>` and an `aria-label`, and its
own comment asserted that "the editor carries a real label, so a screen reader
announces what it is". It did not. `@uiw/react-codemirror` forwards `id` and
`aria-label` to the outer wrapper `<div class="cm-editor">`, while the element
that actually carries `role="textbox"` is the inner `.cm-content`. Both labels
therefore named a plain `div`, and the editor itself was announced as an unnamed
multi-line text box — on a page with up to four of them.

Fixed by using CodeMirror's `EditorView.contentAttributes` facet, which is the
supported way to put attributes on the content element.

This is worth recording at length because it is the exact failure mode an audit
exists to catch: the markup looked right, the intent was right, the comment
claimed success, and the result was silence. No amount of reading the component
would have found it.

### Fixed — the way out of the editor was not announced (WCAG 2.1.2)

Tab inserts indentation while the editor has focus, which is correct for writing
Python and a keyboard trap if it is the only behaviour. CodeMirror's escape
hatch — press Escape, then Tab — was implemented and worked, but nothing told
the learner it existed. WCAG 2.1.2 permits non-standard Tab behaviour _only_ if
the user is advised of the method.

Fixed with a visually-hidden description referenced by `aria-describedby`, so it
is announced on entering the editor: "Code editor. Tab inserts indentation. Press
Escape and then Tab to move to the next control."

### Fixed — syntax colours below AA contrast (serious), since Phase 3

CodeMirror's default highlight style colours f-string text `#e40`: about 3.6:1 on
the editor's active line, against the 4.5:1 AA requires. f-strings appear in every
lesson from Module 2 onward, so this shipped in most of the curriculum. The audit
did not see it for two phases because the one Track A lesson it scanned contains
no f-string; it surfaced the first time a scanned page did.

Two other default colours also fail on the tinted active line: type/namespace
green `#085` (4.2:1) and invalid-token red `#f00` (3.7:1). `CodeEditor.tsx` now
registers a full highlight style — CodeMirror's own, tag for tag, with exactly
those three darkened:

| Token                    | Default | Now       | On white | On active line |
| ------------------------ | ------- | --------- | -------- | -------------- |
| f-string text, escapes   | `#e40`  | `#b43c00` | 5.9:1    | 5.5:1          |
| Type and namespace names | `#085`  | `#067047` | 6.2:1    | 5.7:1          |
| Invalid tokens           | `#f00`  | `#c00000` | 6.5:1    | 6.0:1          |

Every other colour is unchanged, so nobody who could read the editor before sees
a different one. The lesson scanned for this is a page _with_ f-strings, so a
regression fails the build.

### Fixed — code blocks and tables that scroll sideways (WCAG 2.1.1), since Phase 1

A code block or table wider than the column scrolls horizontally, and a region
that scrolls must be reachable by keyboard; without focus there was no way to read
the right-hand end of a long line. Markdown code blocks and tables are now
focusable regions with a name. In the editor itself, long lines now **wrap**
instead — better for a beginner regardless, since code that runs off the edge of
the box is code they cannot read, on a phone especially.

### Fixed — Run pressed before the page was ready did nothing

Not a WCAG criterion, but an operability failure that falls hardest on learners
with slow connections and older devices. Lesson pages are server-rendered, so the
Run button is visible — and looks active — before the JavaScript that handles it
has arrived. A press in that window was silently discarded: no output, no error.
The end-to-end suite found it by clicking faster than the page hydrated. The
button now renders disabled until it can act (`lib/useHydrated.ts`).

### Added — plots have text equivalents (WCAG 1.1.1)

Track B draws plots. Each captured figure's alt text is generated from what was
actually drawn — title, axis labels, how many points or bars — rather than a
generic "chart". A plot with no labels is described as having none, which is
accurate and is also the nudge a reviewer would give.

### Verified, no change needed

- **Colour is never the only carrier of meaning.** Every pass/fail state has a
  word and a symbol as well as a colour (`FeedbackPanel.tsx`, `ReviewSession.tsx`).
- **Contrast.** No violations at AA on any scanned state, including the tinted
  pass/fail washes, which were the likeliest place to fail.
- **One `h1` per page**, and a working skip link that moves focus rather than
  only changing the fragment. Asserted for every page type.
- **Results are announced.** Run feedback and review verdicts are
  `role="status" aria-live="polite"`, so a screen-reader user hears the outcome
  without hunting for it.

## Known limits

Stated rather than left implied:

- **One browser engine.** The suite runs Chromium. Rendering differences in
  Firefox and WebKit are not covered.
- **No screen-reader testing.** Nothing here has been driven with NVDA, JAWS or
  VoiceOver. ARIA that validates is not the same as ARIA that reads well, and
  the code editor in particular is the kind of complex widget where the two
  diverge. This is the largest remaining gap and it needs a human.
- **No cognitive-accessibility review.** Reading level, instruction clarity and
  the pace of new vocabulary are pedagogical questions the brief takes seriously
  (Section 2.1), and no automated tool speaks to them.
- **CodeMirror is a third-party widget.** Its internal accessibility is
  inherited, not owned. It is the best-behaved of the browser code editors in
  this respect, which is part of why it was chosen over Monaco, but a defect
  inside it is not one this project can fix directly.
