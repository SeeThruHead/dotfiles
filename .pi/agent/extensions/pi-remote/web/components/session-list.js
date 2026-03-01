import { useState, useEffect } from "../vendor.js";
import { html } from "../html.js";
import { SessionCard } from "./session-card.js";

export const SessionList = () => {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const poll = async () => {
      const resp = await fetch("/api/sessions");
      if (!resp.ok) return;
      const data = await resp.json();
      setSessions(data.sessions.map((s) => ({ ...s, hubHost: data.hubHost })));
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return html`
    <div class="h-full flex flex-col overflow-y-auto p-4">
      <h1 class="text-lg text-violet-500 font-semibold mb-4">❯ pi-remote</h1>
      ${sessions.length === 0
        ? html`<div class="text-gray-500 text-center mt-10 text-[13px]">No active pi sessions</div>`
        : sessions.map((s) => html`<${SessionCard} key=${s.id} session=${s} />`)}
    </div>
  `;
};
