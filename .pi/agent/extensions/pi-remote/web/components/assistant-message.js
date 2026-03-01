import { useEffect, useRef } from "../vendor.js";
import { hljs } from "../vendor.js";
import { html } from "../html.js";
import { renderMarkdown } from "../markdown.js";

export const AssistantMessage = ({ text, thinking, isStreaming: streaming }) => {
  const bodyRef = useRef(null);

  // Syntax-highlight code blocks once streaming stops
  useEffect(() => {
    if (!streaming && bodyRef.current) {
      bodyRef.current.querySelectorAll("pre code[class]").forEach((el) => hljs.highlightElement(el));
    }
  }, [streaming, text]);

  return html`
    <div class="mb-3.5">
      <div class="text-[11px] font-semibold mb-1 uppercase tracking-wide text-emerald-400">Assistant</div>
      ${thinking && html`
        <div class="text-gray-500 italic text-[13px] border-l-2 border-gray-500 pl-2.5 my-1.5 whitespace-pre-wrap break-words">${thinking}</div>
      `}
      <div class="whitespace-pre-wrap break-words leading-relaxed" ref=${bodyRef}
           dangerouslySetInnerHTML=${{ __html: renderMarkdown(text) }}></div>
      ${streaming && html`
        <span class="inline-block w-[7px] h-[15px] bg-violet-600 animate-blink align-text-bottom ml-px"></span>
      `}
    </div>
  `;
};
