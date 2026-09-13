/**
 * Renders lesson prose.
 *
 * `react-markdown` is used without `rehype-raw`, so embedded HTML in content is
 * escaped rather than rendered. Content is authored by us and reviewed, but
 * keeping raw HTML off means a curriculum file can never become an injection
 * vector (Section 8, security).
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`lp-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              className="text-brand underline underline-offset-2 hover:text-brand-dark"
              {...(href?.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {linkChildren}
            </a>
          ),
          table: ({ children: tableChildren }) => (
            // Wide tables scroll inside their own container rather than making
            // the page scroll sideways. `tabIndex` for the same reason as the
            // code blocks below.
            <div className="my-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Table">
              <table className="w-full border-collapse text-sm">{tableChildren}</table>
            </div>
          ),
          pre: ({ children: preChildren }) => (
            // A code block wider than the column scrolls sideways, and a region
            // that scrolls must be reachable by keyboard (WCAG 2.1.1) — without
            // `tabIndex` there is no way to read the right-hand end of a long
            // line without a mouse. `role`/`aria-label` stop screen readers
            // announcing a bare focusable div with no purpose.
            //
            // Track A never tripped this because its examples fit; Track B's
            // first long line found it. It was always a latent bug.
            <pre tabIndex={0} role="region" aria-label="Code example">
              {preChildren}
            </pre>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
