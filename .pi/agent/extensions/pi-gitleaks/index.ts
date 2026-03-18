import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { detectSecrets, redactSecrets } from "./redact.js";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("pi-gitleaks", ctx.ui.theme.fg("muted", "🔍 active"));
  });

  pi.on("tool_result", async (event) => {
    let modified = false;

    const newContent = await Promise.all(
      event.content.map(async (c) => {
        if (c.type !== "text") return c;

        const secrets = await detectSecrets(c.text);
        if (!secrets) return c;

        modified = true;
        return { ...c, text: redactSecrets(c.text, secrets) };
      })
    );

    return modified ? { content: newContent } : undefined;
  });
}
