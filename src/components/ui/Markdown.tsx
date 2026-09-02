import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";

interface MarkdownProps {
  children: string;
  className?: string;
}

function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderCountRef = useRef(0);
  const [theme, setTheme] = useState<"dark" | "default">(
    document.documentElement.dataset.theme === "dark" ? "dark" : "default",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "dark" : "default",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    setError(null);

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
        });
        const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${renderCountRef.current++}`;
        const { svg, bindFunctions } = await mermaid.render(renderId, source);
        if (!active) return;
        container.innerHTML = svg;
        bindFunctions?.(container);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      active = false;
    };
  }, [reactId, source, theme]);

  return (
    <>
      {error ? (
        <div className="my-3 rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-3">
          <p className="mb-2 text-xs text-[var(--color-danger)]">
            Mermaid could not render this diagram: {error}
          </p>
          <pre className="overflow-auto text-xs">
            <code>{source}</code>
          </pre>
        </div>
      ) : null}
      <div
        ref={containerRef}
        role="img"
        aria-label="Mermaid diagram"
        className={`mermaid-diagram my-3 min-h-16 overflow-auto rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-3 ${error ? "hidden" : ""}`}
      />
    </>
  );
}

function MarkdownPre({ children, ...props }: { children?: ReactNode }) {
  const child =
    Children.count(children) === 1
      ? (Children.only(children) as ReactElement<{
          className?: string;
          children?: ReactNode;
        }>)
      : null;
  if (
    child &&
    isValidElement(child) &&
    child.props.className?.split(" ").includes("language-mermaid")
  ) {
    return (
      <MermaidDiagram source={String(child.props.children ?? "").trimEnd()} />
    );
  }
  return <pre {...props}>{children}</pre>;
}

/**
 * GitHub-flavored markdown renderer used across review/PR surfaces.
 *
 * Renders raw HTML embedded in comments (GitHub allows it) after sanitizing it
 * against GitHub's allowlist, highlights fenced code blocks, and keeps links
 * opening externally. Mirrors GitHub's comment typography via `.markdown-body`.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {linkChildren}
            </a>
          ),
          pre: MarkdownPre,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
