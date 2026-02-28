import type { RedactResult, EnvLine } from "./types.js";
import { classifyValue, containsInlineSecret } from "./patterns.js";

const REDACTED = "<REDACTED>";
const BLOCKED_OUTPUT = "🔒 Blocked: Output contained what appears to be secret values (API keys, tokens, credentials).";

const ENV_LINE_RE = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/;

function parseEnvLine(line: string): EnvLine | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;

  const match = trimmed.match(ENV_LINE_RE);
  if (!match) return null;

  const raw = match[3].trim();
  const isQuoted =
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"));

  return {
    prefix: match[1] || "",
    key: match[2],
    rawValue: match[3],
    innerValue: isQuoted ? raw.slice(1, -1) : raw,
    quoteChar: isQuoted ? raw[0] : "",
  };
}

function redactLine(line: string): string {
  const parsed = parseEnvLine(line);
  if (!parsed) return line;

  return classifyValue(parsed.key, parsed.innerValue) === "secret"
    ? `${parsed.prefix}${parsed.key}=${parsed.quoteChar}${REDACTED}${parsed.quoteChar}`
    : line;
}

// Fast path: does this text look like it could contain secrets?
// Checks for KEY=VALUE patterns or known secret indicators before doing real work.
const looksLikeEnvContent = (text: string): boolean =>
  ENV_LINE_RE.test(text);

export function redactText(text: string): RedactResult {
  // Fast path: if no KEY=VALUE lines, just check for inline secrets
  if (!looksLikeEnvContent(text)) {
    if (containsInlineSecret(text)) {
      return { text: BLOCKED_OUTPUT, redacted: true };
    }
    return { text, redacted: false };
  }

  // Has structured lines — redact per-line
  let anyRedacted = false;
  const lines = text.split("\n").map((line) => {
    const result = redactLine(line);
    if (result !== line) anyRedacted = true;
    return result;
  });

  // Also check if non-structured lines contain inline secrets
  if (!anyRedacted && containsInlineSecret(text)) {
    return { text: BLOCKED_OUTPUT, redacted: true };
  }

  return {
    text: anyRedacted ? lines.join("\n") : text,
    redacted: anyRedacted,
  };
}
