// Markdown-ish rendering with syntax highlighting.
// Handles code blocks, inline code, bold, and links.

import { hljs } from "./vendor.js";
import { esc } from "./helpers.js";

const highlightCode = (code, lang) =>
  lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value
    : esc(code);

export const renderMarkdown = (text) => {
  if (!text) return "";

  // Split text into code blocks and prose segments
  const segments = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: "text", content: text.slice(last, m.index) });
    segments.push({ type: "code", lang: m[1], content: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", content: text.slice(last) });

  return segments
    .map((seg) => {
      if (seg.type === "code") {
        const cls = seg.lang ? ` class="language-${seg.lang}"` : "";
        return (
          '<pre class="bg-deep border border-border rounded-md p-3 my-2 overflow-auto max-h-[60vh] text-[13px] leading-snug">' +
          "<code" + cls + ">" + highlightCode(seg.content, seg.lang) + "</code></pre>"
        );
      }

      let s = esc(seg.content);
      s = s.replace(/`([^`]+)`/g, '<code class="bg-deep px-1.5 py-0.5 rounded text-[13px]">$1</code>');
      s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      s = s.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" class="text-blue-400 underline">$1</a>'
      );
      s = s
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => '<p class="mb-2 last:mb-0">' + p + "</p>")
        .join("");

      return s;
    })
    .join("");
};
