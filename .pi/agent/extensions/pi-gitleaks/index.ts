import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";

const REDACTED = "<REDACTED>";

/**
 * Pipe text through `gitleaks stdin` and return all detected secret values.
 * Returns null if gitleaks errors or finds nothing.
 * NOTE: do NOT pass --redact — it wipes the Secret field in the JSON output,
 * making it impossible to know what to replace.
 */
async function detectSecrets(text: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      "gitleaks",
      ["stdin", "--no-banner", "--log-level", "error", "-f", "json", "-r", "-"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const stdout: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));

    proc.on("error", () => resolve(null));

    proc.on("close", (code) => {
      // exit 0 = no leaks, exit 1 = leaks found, anything else = error
      if (code === 0) return resolve(null);
      if (code !== 1) return resolve(null);

      try {
        const findings: Array<{ Secret?: string }> = JSON.parse(
          Buffer.concat(stdout).toString("utf-8")
        );
        const secrets = findings
          .map((f) => f.Secret)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        resolve(secrets.length > 0 ? secrets : null);
      } catch {
        resolve(null);
      }
    });

    proc.stdin.write(text, "utf-8");
    proc.stdin.end();
  });
}

function redactSecrets(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) {
    // Escape regex metacharacters in the secret value before substituting
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), REDACTED);
  }
  return result;
}

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
