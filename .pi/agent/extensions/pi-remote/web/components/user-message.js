import { html } from "../html.js";
import { renderMarkdown } from "../markdown.js";

export const UserMessage = ({ text }) => html`
  <div class="mb-3.5">
    <div class="text-[11px] font-semibold mb-1 uppercase tracking-wide text-violet-500">You</div>
    <div class="whitespace-pre-wrap break-words leading-relaxed"
         dangerouslySetInnerHTML=${{ __html: renderMarkdown(text) }}></div>
  </div>
`;
