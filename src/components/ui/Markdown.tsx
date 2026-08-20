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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

