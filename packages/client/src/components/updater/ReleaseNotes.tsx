import React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger("release-notes");

export interface ReleaseNotesProps {
  notes?: string | null;
  className?: string;
}

interface TextToken {
  type: "text";
  text: string;
}

interface CodeToken {
  type: "code";
  text: string;
}

interface BoldToken {
  type: "bold";
  text: string;
}

interface ItalicToken {
  type: "italic";
  text: string;
}

interface ScopeToken {
  type: "scope";
  text: string;
}

interface BadgeToken {
  type: "badge";
  label: string;
  variant: "destructive" | "default";
}

interface LinkToken {
  type: "link";
  label: string;
  url: string;
  safe: boolean;
  isCommit: boolean;
  isPR: boolean;
}

type InlineToken =
  | TextToken
  | CodeToken
  | BoldToken
  | ItalicToken
  | ScopeToken
  | BadgeToken
  | LinkToken;

interface HeadingBlock {
  type: "heading";
  level: number;
  content: string;
  tokens: InlineToken[];
}

interface ListItem {
  raw: string;
  tokens: InlineToken[];
}

interface ListBlock {
  type: "list";
  ordered: boolean;
  items: ListItem[];
}

interface ParagraphBlock {
  type: "paragraph";
  content: string;
  tokens: InlineToken[];
}

type MarkdownBlock = HeadingBlock | ListBlock | ParagraphBlock;

function isSafeUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parses inline formatting:
 * 1. [**breaking**] -> breaking badge
 * 2. `code` -> inline code
 * 3. [label](url) -> markdown link
 * 4. **bold** -> strong text
 * 5. *(scope)* -> scope badge
 * 6. *italic* or _italic_ -> em text
 * 7. bare URL (https?://...) -> link
 *
 * Remote text is never passed to innerHTML; all output is safe React elements.
 */
export function tokenizeInline(text: string): InlineToken[] {
  const regex =
    /(\[\*\*([^*]+)\*\*\])|(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*\(([a-zA-Z0-9_\-\s.]+)\)\*)|(\*([^*]+)\*|_([^_]+)_)|(https?:\/\/[^\s<)\]]+)/g;

  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    const [
      ,
      breakingFull,
      breakingText,
      codeFull,
      linkFull,
      linkLabel,
      linkUrl,
      boldFull,
      boldText,
      scopeFull,
      scopeText,
      italicFull,
      italicAsterisk,
      italicUnderscore,
      bareUrl,
    ] = match;

    if (breakingFull) {
      tokens.push({ type: "badge", label: breakingText, variant: "destructive" });
    } else if (codeFull) {
      tokens.push({ type: "code", text: codeFull.slice(1, -1) });
    } else if (linkFull) {
      const isCommit = /^[0-9a-f]{7,12}$/i.test(linkLabel);
      const isPR = /^#\d+$/.test(linkLabel);
      tokens.push({
        type: "link",
        label: linkLabel,
        url: linkUrl,
        safe: isSafeUrl(linkUrl),
        isCommit,
        isPR,
      });
    } else if (boldFull) {
      tokens.push({ type: "bold", text: boldText });
    } else if (scopeFull) {
      tokens.push({ type: "scope", text: scopeText });
    } else if (italicFull) {
      tokens.push({ type: "italic", text: italicAsterisk || italicUnderscore });
    } else if (bareUrl) {
      tokens.push({
        type: "link",
        label: bareUrl,
        url: bareUrl,
        safe: isSafeUrl(bareUrl),
        isCommit: false,
        isPR: false,
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Parses markdown release notes into blocks: headings, lists, and paragraphs.
 * If text is empty or purely whitespace, returns null.
 */
export function parseMarkdown(text: string): MarkdownBlock[] | null {
  if (!text || !text.trim()) return null;

  const lines = text.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let currentList: ListBlock | null = null;
  let currentParagraph: { content: string } | null = null;

  function flushList() {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  }

  function flushParagraph() {
    if (currentParagraph) {
      blocks.push({
        type: "paragraph",
        content: currentParagraph.content,
        tokens: tokenizeInline(currentParagraph.content),
      });
      currentParagraph = null;
    }
  }

  function flushAll() {
    flushList();
    flushParagraph();
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    // Heading (# to ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      blocks.push({
        type: "heading",
        level,
        content: headingMatch[2],
        tokens: tokenizeInline(headingMatch[2]),
      });
      continue;
    }

    // List items (- , * , + , or 1. )
    const listMatch = trimmed.match(/^([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const isOrdered = /^\d+\./.test(listMatch[1]);
      if (!currentList || currentList.ordered !== isOrdered) {
        flushList();
        currentList = { type: "list", ordered: isOrdered, items: [] };
      }
      currentList.items.push({
        raw: listMatch[2],
        tokens: tokenizeInline(listMatch[2]),
      });
      continue;
    }

    // Paragraph text (appends consecutive non-empty lines)
    flushList();
    if (currentParagraph) {
      currentParagraph.content += " " + trimmed;
    } else {
      currentParagraph = { content: trimmed };
    }
  }

  flushAll();

  return blocks.length > 0 ? blocks : null;
}

function handleLinkClick(e: React.MouseEvent, url: string) {
  e.preventDefault();
  openUrl(url).catch((err) => {
    logger.warn("Failed to open external link:", err);
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

function renderInline(token: InlineToken, index: number): React.ReactNode {
  switch (token.type) {
    case "text":
      return <React.Fragment key={index}>{token.text}</React.Fragment>;

    case "badge":
      return (
        <span
          key={index}
          className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 mr-1 select-none font-sans uppercase align-baseline"
        >
          {token.label}
        </span>
      );

    case "scope":
      return (
        <span
          key={index}
          className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground border border-border/50 mr-1.5 select-none shrink-0 font-sans align-baseline"
        >
          {token.text}
        </span>
      );

    case "code":
      return (
        <code
          key={index}
          className="font-mono text-[11px] bg-muted/80 px-1 py-0.5 rounded text-foreground border border-border/40 [overflow-wrap:anywhere] break-words"
        >
          {token.text}
        </code>
      );

    case "bold":
      return (
        <strong key={index} className="font-semibold text-foreground font-sans">
          {token.text}
        </strong>
      );

    case "italic":
      return (
        <em key={index} className="italic text-foreground/85 font-sans">
          {token.text}
        </em>
      );

    case "link":
      if (!token.safe) {
        return <span key={index}>{token.label}</span>;
      }

      if (token.isCommit) {
        return (
          <a
            key={index}
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleLinkClick(e, token.url)}
            title={`View commit on GitHub: ${token.url}`}
            className="inline-flex items-center font-mono text-[11px] text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 px-1 py-0.2 rounded border border-primary/20 transition-colors [overflow-wrap:anywhere] break-all align-baseline"
          >
            {token.label}
          </a>
        );
      }

      if (token.isPR) {
        return (
          <a
            key={index}
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleLinkClick(e, token.url)}
            title={`View pull request: ${token.url}`}
            className="font-mono text-[11px] text-primary hover:underline font-medium [overflow-wrap:anywhere] break-all"
          >
            {token.label}
          </a>
        );
      }

      return (
        <a
          key={index}
          href={token.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleLinkClick(e, token.url)}
          className="text-primary hover:underline underline-offset-2 font-medium [overflow-wrap:anywhere] break-all"
        >
          {token.label}
        </a>
      );
  }
}

function renderBlock(block: MarkdownBlock, index: number): React.ReactNode {
  switch (block.type) {
    case "heading": {
      if (block.level === 1) {
        return (
          <h3
            key={index}
            className="text-sm font-semibold text-foreground mt-2.5 first:mt-0 mb-1"
          >
            {block.tokens.map(renderInline)}
          </h3>
        );
      }

      if (block.level === 2) {
        return (
          <div
            key={index}
            className="text-xs font-semibold text-foreground flex items-center justify-between border-b border-border/50 pb-1.5 mt-3 first:mt-0 mb-2"
          >
            <span>{block.tokens.map(renderInline)}</span>
          </div>
        );
      }

      if (block.level === 3) {
        return (
          <h4
            key={index}
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 first:mt-0 mb-1.5 flex items-center gap-1.5 select-none"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
            <span>{block.tokens.map(renderInline)}</span>
          </h4>
        );
      }

      return (
        <h5
          key={index}
          className="text-xs font-medium text-muted-foreground mt-2 first:mt-0 mb-1"
        >
          {block.tokens.map(renderInline)}
        </h5>
      );
    }

    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={index}
          className={cn("space-y-1.5 font-sans", block.ordered && "list-decimal list-inside pl-1")}
        >
          {block.items.map((item, itemIdx) => (
            <li
              key={itemIdx}
              className="flex items-start gap-2 text-xs leading-relaxed text-foreground/90 font-sans"
            >
              {!block.ordered && (
                <span className="text-muted-foreground/60 select-none text-[10px] mt-0.5 shrink-0">
                  •
                </span>
              )}
              <div className="flex-1 min-w-0 [overflow-wrap:anywhere] break-words">
                {item.tokens.map(renderInline)}
              </div>
            </li>
          ))}
        </ListTag>
      );
    }

    case "paragraph": {
      return (
        <p
          key={index}
          className="text-xs text-foreground/90 leading-relaxed font-sans [overflow-wrap:anywhere] break-words my-1.5 first:mt-0 last:mb-0"
        >
          {block.tokens.map(renderInline)}
        </p>
      );
    }
  }
}

/**
 * Renders release notes from the updater manifest safely and responsively.
 *
 * Zero dangerouslySetInnerHTML: all text is rendered as React text nodes,
 * links are strictly checked against http/https protocols, and long links wrap
 * gracefully without causing horizontal overflow.
 */
export function ReleaseNotes({ notes, className }: ReleaseNotesProps) {
  if (!notes) return null;

  const blocks = parseMarkdown(notes);
  if (!blocks) return null;

  return (
    <div
      data-testid="release-notes"
      className={cn(
        "font-sans text-xs text-foreground/90 leading-relaxed [overflow-wrap:anywhere] break-words",
        className
      )}
    >
      {blocks.map(renderBlock)}
    </div>
  );
}
