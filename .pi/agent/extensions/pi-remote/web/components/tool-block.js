import { useState, useEffect, useRef } from "../vendor.js";
import { hljs } from "../vendor.js";
import { html } from "../html.js";
import { toolArgsSummary } from "../helpers.js";

// For write/edit tools, the interesting content is in the args, not the result.
// The result is just "Successfully wrote X bytes" which is useless.
const getDisplayContent = (toolName, args, result, partialText) => {
  if (toolName === "write" && args?.content) {
    return { text: args.content, lang: langFromPath(args.path) };
  }
  if (toolName === "edit" && args?.newText) {
    const header = args.oldText
      ? `--- old\n${args.oldText}\n+++ new\n${args.newText}`
      : args.newText;
    return { text: header, lang: "diff" };
  }
  return { text: result || partialText || "", lang: null };
};

const langFromPath = (path) => {
  if (!path) return null;
  const ext = path.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", rb: "ruby", rs: "rust", go: "go", sh: "bash",
    bash: "bash", zsh: "bash", css: "css", html: "html", xml: "xml",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
    sql: "sql", toml: "toml", diff: "diff",
  };
  return map[ext] || null;
};

// Get the streaming content + language from tool args
const getStreamingContent = (toolName, args) => {
  if (toolName === "write" && args?.content) {
    return { text: args.content, lang: langFromPath(args.path) };
  }
  if (toolName === "edit" && args?.newText) {
    const text = args.oldText
      ? `--- old\n${args.oldText}\n+++ new\n${args.newText}`
      : args.newText;
    return { text, lang: langFromPath(args.path) || "diff" };
  }
  return null;
};

// Highlight code to HTML string. Returns raw text on failure.
const highlightToHtml = (code, lang) => {
  if (!code) return "";
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
  } catch {}
  // Escape for safe innerHTML
  return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

export const ToolBlock = ({ toolCallId, toolName, args, result, isError, isRunning, partialText, isStreamingArgs }) => {
  const [expanded, setExpanded] = useState(true);
  const outputRef = useRef(null);

  const isActivelyStreaming = isStreamingArgs && !isRunning && !result;

  const icon = isActivelyStreaming ? "⟳" : isRunning ? "▶" : isError ? "✗" : "✓";
  const iconColor = isActivelyStreaming
    ? "text-violet-400"
    : isRunning
      ? "text-yellow-400"
      : isError
        ? "text-red-400"
        : "text-emerald-400";

  const streamData = isActivelyStreaming ? getStreamingContent(toolName, args) : null;
  const { text: finalText, lang } = getDisplayContent(toolName, args, result, partialText);

  // Syntax-highlight the finished code block
  useEffect(() => {
    if (expanded && outputRef.current && !isRunning && !isActivelyStreaming) {
      outputRef.current.querySelectorAll("pre code").forEach((el) => {
        if (!el.dataset.highlighted) {
          if (lang && hljs.getLanguage(lang)) {
            el.className = "language-" + lang;
          }
          hljs.highlightElement(el);
          el.dataset.highlighted = "true";
        }
      });
    }
  }, [expanded, isRunning, isActivelyStreaming, finalText]);

  // ── Streaming mode: syntax-highlighted text that flows with the page scroll ──
  if (isActivelyStreaming) {
    const streamHtml = streamData ? highlightToHtml(streamData.text, streamData.lang) : "";
    const cursorHtml = '<span class="inline-block w-[7px] h-[15px] bg-violet-600 animate-blink align-text-bottom ml-px"></span>';

    return html`
      <div class="my-2">
        <div class="flex items-center gap-2 mb-1">
          <span class="${iconColor} text-[13px] animate-pulse-dot">${icon}</span>
          <span class="text-gray-400 text-[13px] font-semibold">${toolName}</span>
          <span class="text-gray-500 text-xs truncate">${toolArgsSummary(toolName, args)}</span>
        </div>
        ${streamHtml && html`
          <pre class="text-xs leading-snug whitespace-pre-wrap break-words text-gray-400 pl-5"
               dangerouslySetInnerHTML=${{ __html: streamHtml + cursorHtml }}></pre>
        `}
      </div>
    `;
  }

  // ── Finished mode: collapsible code block ──
  return html`
    <div class="bg-deep border border-border rounded-md my-2">
      <div class="flex items-center px-3 py-2 cursor-pointer gap-2 select-none min-h-[36px] hover:bg-white/[0.03] rounded-t-md"
           onClick=${() => setExpanded(!expanded)}>
        <span class="${iconColor} text-[13px]">${icon}</span>
        <span class="text-gray-400 text-[13px] font-semibold">${toolName}</span>
        <span class="text-gray-500 text-xs flex-1 truncate">${toolArgsSummary(toolName, args)}</span>
        <span class="text-gray-500 text-[11px] transition-transform ${expanded ? "rotate-90" : ""}">▸</span>
      </div>
      ${expanded && finalText && html`
        <div class="px-3 pb-2.5 max-h-[60vh] overflow-y-auto" ref=${outputRef}>
          <pre class="text-xs leading-snug whitespace-pre-wrap break-words ${isError ? "text-red-400" : "text-gray-400"}"><code>${finalText}</code></pre>
        </div>
      `}
    </div>
  `;
};
