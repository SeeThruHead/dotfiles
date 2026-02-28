import type { RedactResult, EnvLine } from "./types.js";
import {
  matchesAnchoredSecretPattern,
  containsInlineSecretPattern,
  hasSecretKeyName,
  hasSafeKeyName,
  isSafeValue,
  isLongRandomString,
  hasEmbeddedCredentials,
} from "./patterns.js";

const REDACTED = "<REDACTED>";
const BLOCKED_MESSAGE = "🔒 Blocked: Output contained what appears to be secret values (API keys, tokens, credentials). Use `secret-env` CLI for safe access.";

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

function isSecret(key: string, value: string): boolean {
  const v = value.trim();

  if (v.length === 0) return false;
  if (isSafeValue(v)) return false;
  if (matchesAnchoredSecretPattern(v)) return true;
  if (hasSafeKeyName(key)) return false;
  if (hasSecretKeyName(key)) return true;
  if (isLongRandomString(v)) return true;
  if (hasEmbeddedCredentials(v)) return true;

  return false;
}

function redactLine(line: string): string {
  const parsed = parseEnvLine(line);
  if (!parsed) return line;

  if (isSecret(parsed.key, parsed.innerValue)) {
    return `${parsed.prefix}${parsed.key}=${parsed.quoteChar}${REDACTED}${parsed.quoteChar}`;
  }

  return line;
}

export function redactText(text: string): RedactResult {
  if (containsInlineSecretPattern(text)) {
    const hasStructuredEnvLines = text.split("\n").some((l) => parseEnvLine(l) !== null);

    if (!hasStructuredEnvLines) {
      return { text: BLOCKED_MESSAGE, redacted: true };
    }
  }

  let anyRedacted = false;
  const redactedLines = text.split("\n").map((line) => {
    const result = redactLine(line);
    if (result !== line) anyRedacted = true;
    return result;
  });

  return {
    text: anyRedacted ? redactedLines.join("\n") : text,
    redacted: anyRedacted,
  };
}
