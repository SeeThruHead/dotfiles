import type { RedactResult, EnvLine } from "./types.js";
import { classifyValue, containsInlineSecret } from "./patterns.js";

const REDACTED = "<REDACTED>";
const BLOCKED_OUTPUT = "🔒 Blocked: Output contained what appears to be secret values (API keys, tokens, credentials). Use `secret-env` CLI for safe access.";

function parseEnvLine(line: string): EnvLine | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
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

export function redactText(text: string): RedactResult {
  if (containsInlineSecret(text)) {
    const hasStructuredLines = text.split("\n").some((l) => parseEnvLine(l) !== null);
    if (!hasStructuredLines) return { text: BLOCKED_OUTPUT, redacted: true };
  }

  let anyRedacted = false;
  const lines = text.split("\n").map((line) => {
    const result = redactLine(line);
    if (result !== line) anyRedacted = true;
    return result;
  });

  return {
    text: anyRedacted ? lines.join("\n") : text,
    redacted: anyRedacted,
  };
}
