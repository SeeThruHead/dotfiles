import { html } from "../html.js";
import { relativeTime } from "../helpers.js";
import { StatusDot } from "./status-dot.js";

export const SessionCard = ({ session }) => html`
  <a href="#/session/${session.hubHost}/${session.id}"
     class="block bg-surface border border-border rounded-lg px-4 py-3.5 mb-2.5 cursor-pointer transition-colors hover:border-violet-600 active:border-violet-600 no-underline text-inherit">
    <div class="text-blue-400 text-[13px] truncate">📂 ${session.cwd}</div>
    <div class="text-gray-400 text-xs mt-0.5">${session.model}</div>
    <div class="text-gray-200 text-[13px] mt-1">${session.sessionName}</div>
    <div class="flex justify-between items-center mt-1.5">
      <span class="text-gray-500 text-[11px]">${relativeTime(session.startedAt)}</span>
      <${StatusDot} streaming=${session.isStreaming} />
    </div>
  </a>
`;
