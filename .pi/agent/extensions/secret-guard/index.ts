/**
 * Secret Guard Extension
 *
 * Prevents secrets from leaking into the LLM context by:
 *
 * 1. Blocking read/write/edit of .env files and known secret files
 * 2. Blocking bash commands that could expose env vars (echo $VAR, env, printenv, cat .env, etc.)
 * 3. Redacting any secret values from ALL tool results as a safety net
 * 4. Adding `secret-env` CLI to PATH as the safe alternative
 *
 * The `secret-env` CLI (bash script) is what the LLM should use instead:
 *   secret-env read <file>                   Show .env with values redacted (<SET>/<EMPTY>)
 *   secret-env check <file> <KEY>            Check if a variable exists and has a value
 *   secret-env list [dir]                    List all .env files and their variable names
 *   secret-env copy <source> <target> <KEY>  Copy a variable between .env files on disk
 *   secret-env keys <file>                   List just the variable names
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";

// --- Secret Detection ---

const SECRET_FILE_PATTERNS = [
  /\.env$/,
  /\.env\.[^.]+$/,
  /secrets?\.(json|yaml|yml|toml)$/i,
  /credentials?\.(json|yaml|yml|toml)$/i,
  /\.netrc$/,
  /\.pgpass$/,
];

const SECRET_DIR_PATTERNS = [
  /\/\.ssh\//,
  /\/\.aws\//,
  /\/\.gnupg\//,
  /\/\.config\/gh\//,
];

function isSecretFile(filePath: string): boolean {
  const name = basename(filePath);
  return (
    SECRET_FILE_PATTERNS.some((p) => p.test(name)) ||
    SECRET_DIR_PATTERNS.some((p) => p.test(filePath))
  );
}

// Parse .env to extract variable names and values (including commented-out lines)
function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(
      /^(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
    );
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value.length > 0) {
        vars.set(key, value);
      }
    }
  }
  return vars;
}

function findEnvFiles(cwd: string): string[] {
  try {
    const result = execSync(
      `find "${cwd}" -maxdepth 5 -name '.env' -o -name '.env.*' 2>/dev/null | grep -v node_modules | grep -v .git/`,
      { encoding: "utf-8", timeout: 5000 }
    );
    return result.trim().split("\n").filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function loadAllSecrets(cwd: string): { secrets: Map<string, string>; files: string[] } {
  const secrets = new Map<string, string>();
  const envFiles = findEnvFiles(cwd);

  for (const file of envFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const vars = parseEnvFile(content);
      for (const [key, value] of vars) {
        secrets.set(key, value);
      }
    } catch {}
  }

  // Also grab process.env vars with secret-looking names
  const secretEnvPatterns = [
    /^[A-Z_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASS|PWD|AUTH|CREDENTIAL|API_KEY|PRIVATE)/i,
    /^(?:AWS|AZURE|GCP|GITHUB|GITLAB|SLACK|STRIPE|TWILIO|SENDGRID|DATABASE_URL|REDIS_URL|MONGO)/i,
  ];

  for (const [key, value] of Object.entries(process.env)) {
    if (value && secretEnvPatterns.some((p) => p.test(key))) {
      secrets.set(key, value);
    }
  }

  return { secrets, files: envFiles };
}

function redactSecrets(text: string, secrets: Map<string, string>): string {
  let result = text;
  const entries = Array.from(secrets.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [key, value] of entries) {
    if (value.length >= 4) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), `<REDACTED:${key}>`);
    }
  }
  return result;
}

// --- Bash command patterns that leak secrets ---

const DANGEROUS_BASH_PATTERNS = [
  /\becho\s+.*\$[A-Za-z_]/,
  /\bprintf\s+.*\$[A-Za-z_]/,
  /\b(env|printenv|set)\s*($|\||;|&)/,
  /\bexport\s+-p\b/,
  /\bcat\s+.*\.env\b/,
  /\bless\s+.*\.env\b/,
  /\bmore\s+.*\.env\b/,
  /\bhead\s+.*\.env\b/,
  /\btail\s+.*\.env\b/,
  /\bgrep\s+.*\.env\b/,
  /\bsed\s+.*\.env\b/,
  /\bawk\s+.*\.env\b/,
  /\b(source|\.)\s+.*\.env\b/,
  /\bdocker\s+inspect\b/,
  /\bcurl\b.*(-H|--header)\s+['"]?(Authorization|X-Api-Key)/i,
];

function isDangerousBashCommand(command: string): { dangerous: boolean; reason: string } {
  // Allow secret-env commands through
  if (command.match(/\bsecret-env\b/)) {
    return { dangerous: false, reason: "" };
  }
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason: `Matches blocked pattern: ${pattern.source}` };
    }
  }
  return { dangerous: false, reason: "" };
}

// === EXTENSION ===

export default function (pi: ExtensionAPI) {
  let secrets = new Map<string, string>();
  let envFiles: string[] = [];

  // secret-env CLI lives in ~/.local/bin (should already be on PATH via .zshrc)

  // Load secrets on session start
  pi.on("session_start", async (_event, ctx) => {
    const result = loadAllSecrets(ctx.cwd);
    secrets = result.secrets;
    envFiles = result.files;

    const count = secrets.size;
    const fileCount = envFiles.length;
    ctx.ui.setStatus(
      "secret-guard",
      ctx.ui.theme.fg("muted", `🔒 ${count} secrets from ${fileCount} file${fileCount !== 1 ? "s" : ""}`)
    );

    if (count > 0) {
      ctx.ui.notify(
        `Secret Guard: Protecting ${count} secret values from ${fileCount} env file${fileCount !== 1 ? "s" : ""}`,
        "info"
      );
    }
  });

  // Inject instructions into system prompt so the LLM knows about secret-env
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt: event.systemPrompt + `

<secret-guard>
IMPORTANT: Secret files (.env, .env.*, secrets.json, credentials.*, ~/.ssh/, ~/.aws/) are BLOCKED from read, write, edit, cat, grep, and all other direct access.

To work with .env files, use the \`secret-env\` CLI via bash:
  secret-env read <file>                   — Show .env with values redacted (<SET>/<EMPTY>)
  secret-env check <file> <KEY>            — Check if a variable exists and has a value
  secret-env list [dir]                    — List all .env files and their variable names
  secret-env copy <source> <target> <KEY>  — Copy a variable between .env files (on disk, value never printed)
  secret-env keys <file>                   — List just the variable names

NEVER attempt to: cat .env, read .env, echo $SECRET, env, printenv, or any command that prints secret values.
If you need the user to set a value, tell them to open the file in their editor.
</secret-guard>`,
    };
  });

  // --- Block reads of secret files ---
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const filePath = resolve(ctx.cwd, event.input.path);
      if (isSecretFile(filePath)) {
        return {
          block: true,
          reason: `🔒 Blocked: "${event.input.path}" is a secret file. Use \`secret-env read ${event.input.path}\` via bash instead.`,
        };
      }
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = resolve(ctx.cwd, (event.input as any).path);
      if (isSecretFile(filePath)) {
        return {
          block: true,
          reason: `🔒 Blocked: Cannot write/edit "${(event.input as any).path}". Ask the user to edit this file directly in their editor.`,
        };
      }
    }

    if (isToolCallEventType("bash", event)) {
      const check = isDangerousBashCommand(event.input.command);
      if (check.dangerous) {
        return {
          block: true,
          reason: `🔒 Blocked: ${check.reason}. Use \`secret-env\` CLI instead, or ask the user to run this in their own terminal.`,
        };
      }
    }

    return undefined;
  });

  // --- Redact secrets from ALL tool results (safety net) ---
  pi.on("tool_result", async (event, _ctx) => {
    if (secrets.size === 0) return;

    let modified = false;
    const newContent = event.content.map((c) => {
      if (c.type === "text") {
        const redacted = redactSecrets(c.text, secrets);
        if (redacted !== c.text) {
          modified = true;
          return { ...c, text: redacted };
        }
      }
      return c;
    });

    if (modified) {
      return { content: newContent };
    }
  });

  // --- Commands ---

  pi.registerCommand("secrets-reload", {
    description: "Reload secret values from all .env files (run after editing env files)",
    handler: async (_args, ctx) => {
      const result = loadAllSecrets(ctx.cwd);
      secrets = result.secrets;
      envFiles = result.files;

      ctx.ui.setStatus(
        "secret-guard",
        ctx.ui.theme.fg("muted", `🔒 ${secrets.size} secrets from ${envFiles.length} files`)
      );
      ctx.ui.notify(
        `Reloaded: ${secrets.size} secrets from ${envFiles.length} file${envFiles.length !== 1 ? "s" : ""}`,
        "info"
      );
    },
  });

  pi.registerCommand("secrets", {
    description: "Show secret guard status",
    handler: async (_args, _ctx) => {
      const lines = [
        "🔒 Secret Guard Status",
        "",
        `Protected secrets: ${secrets.size}`,
        `Env files found: ${envFiles.length}`,
        ...envFiles.map((f) => `  📄 ${f}`),
        "",
        "CLI: secret-env read|check|list|copy|keys",
        "Commands: /secrets-reload, /secrets",
      ];
      _ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
