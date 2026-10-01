"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const allowedUrl = (url: string, mentionIds: readonly string[]) => {
  try {
    const parsed = new URL(url);
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return url;
  } catch {
    // Relative links and malformed URLs stay inert.
  }
  if (url.startsWith("user:") && mentionIds.includes(url.slice(5))) return url;
  return "";
};

export function MarkdownText({ text, mentionIds = [] }: { text: string; mentionIds?: string[] }) {
  return (
    <div className="space-y-2 break-words text-sm [&_li]:ml-5 [&_li]:list-disc [&_p]:whitespace-pre-wrap">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => allowedUrl(url, mentionIds)}
        components={{
          a: ({ href, children }) => href?.startsWith("user:")
            ? <span className="rounded bg-primary/10 px-1 font-medium text-primary">{children}</span>
            : href
              ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{children}</a>
              : <span>{children}</span>,
          img: ({ src, alt }) => typeof src === "string" && src
            ? <a href={src} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">Bild: {alt || src}</a>
            : <span>{alt}</span>,
          h1: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          code: ({ children }) => <code className="rounded bg-muted px-1 font-mono text-xs">{children}</code>,
          blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
