import { html } from "../html.js";

export const StatusDot = ({ streaming }) => html`
  <span class="inline-block w-2 h-2 rounded-full ${streaming ? "bg-emerald-400 animate-pulse-dot" : "bg-gray-500"}"></span>
`;
