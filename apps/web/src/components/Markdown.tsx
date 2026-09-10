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
            // the page scroll sideways.
            <div className="my-5 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{tableChildren}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
