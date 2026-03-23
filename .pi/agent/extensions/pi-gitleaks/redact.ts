import { spawn } from "node:child_process";

export const REDACTED = "<REDACTED>";

// Patterns gitleaks misses — supplemental hardcoded rules
export const SUPPLEMENTAL_PATTERNS: RegExp[] = [
  // AWS Access Key ID — gitleaks only catches the secret key, not the ID
  /\b((?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16})\b/g,
  // Connection strings with embedded credentials (postgresql://user:pass@host)
  /([a-z]+:\/\/[^:@/\s]+:)[^:@/\s]+(@)/g,
];

// Key name fragments that always mean the value is secret
const SECRET_KEY_FRAGMENTS = /PASSWORD|PASSWD|PASS|TOKEN|SECRET|KEY|HMAC/i;

const ENV_LINE_RE = /^((?:export\s+)?([A-Z_][A-Z0-9_]*)=)(.+)$/;

/** Redact values for env lines whose key name looks secret. */
function redactByKeyName(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("#")) return line;
      const m = ENV_LINE_RE.exec(trimmed);
      if (!m) return line;
      const [, prefix, key, value] = m;
      if (!SECRET_KEY_FRAGMENTS.test(key)) return line;
      // Keep quotes if present, redact inner value
      const first = value[0];
      const last = value[value.length - 1];
      const quoted = (first === '"' && last === '"') || (first === "'" && last === "'");
      const redactedValue = quoted ? `${first}${REDACTED}${last}` : REDACTED;
      // Preserve any leading whitespace from the original line
      const indent = line.slice(0, line.length - trimmed.length);
      return `${indent}${prefix}${redactedValue}`;
    })
    .join("\n");
}

/**
 * Pipe text through `gitleaks stdin` and return all detected secret values.
 * Returns null if gitleaks errors or finds nothing.
 * NOTE: do NOT pass --redact — it wipes the Secret field in the JSON output,
 * making it impossible to know what to replace.
 */
const GITLEAKS_TIMEOUT_MS = 5000;

export async function detectSecrets(text: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: string[] | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const timer = setTimeout(() => {
      proc.kill();
      done(null);
    }, GITLEAKS_TIMEOUT_MS);

    const proc = spawn(
      "gitleaks",
      ["stdin", "--no-banner", "--log-level", "error", "-f", "json", "-r", "-"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const stdout: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));

    proc.on("error", () => { clearTimeout(timer); done(null); });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return done(null);
      if (code !== 1) return done(null);

      try {
        const findings: Array<{ Secret?: string }> = JSON.parse(
          Buffer.concat(stdout).toString("utf-8")
        );
        const secrets = findings
          .map((f) => f.Secret)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        done(secrets.length > 0 ? secrets : null);
      } catch {
        done(null);
      }
    });

    try {
      proc.stdin.write(text, "utf-8");
      proc.stdin.end();
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

export function redactSecrets(text: string, secrets: string[] | null): string {
  let result = text;
  if (secrets) {
    for (const secret of secrets) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), REDACTED);
    }
  }
  for (const pattern of SUPPLEMENTAL_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  result = redactByKeyName(result);
  return result;
}

export async function redactText(text: string): Promise<string> {
  const secrets = await detectSecrets(text);
  return redactSecrets(text, secrets);
}
