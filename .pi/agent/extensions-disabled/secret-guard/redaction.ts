import type { RedactResult, EnvLine } from "./types.js";
import { classifyValue, redactInlineSecrets } from "./patterns.js";

// ================================================================
//  Text redaction — optimized
// ================================================================
//
//  Key optimizations:
//  - Single pass to check for env content AND split lines
//  - No .map() allocation when nothing is redacted
//  - Inline secret check only runs when no per-line redaction occurred
//  - ENV_LINE_RE compiled once, reused via .exec() with lastIndex reset
// ================================================================

const REDACTED = "<REDACTED>";

const ENV_LINE_RE = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/;

function parseEnvLine(line: string): EnvLine | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.charCodeAt(0) === 35 /* # */) return null;

  const match = ENV_LINE_RE.exec(trimmed);
  if (match === null) return null;

  const raw = match[3].trim();
  const first = raw.charCodeAt(0);
  const last = raw.charCodeAt(raw.length - 1);
  const isQuoted =
    (first === 34 /* " */ && last === 34) ||
    (first === 39 /* ' */ && last === 39);

  return {
    prefix: match[1] || "",
    key: match[2],
    rawValue: match[3],
    innerValue: isQuoted ? raw.slice(1, -1) : raw,
    quoteChar: isQuoted ? raw[0] : "",
  };
}

// Quick scan: does text contain at least one line matching KEY=VALUE?
// Uses indexOf for speed — avoids running regex on the full text.
// Multiline version of ENV_LINE_RE for scanning full text blocks
const ENV_LINE_MULTI_RE = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=./m;

function hasEnvLine(text: string): boolean {
  // Look for pattern: word char followed by = not at start of line comment
  // Quick heuristic: just check if = exists (very cheap), then confirm with regex on first hit
  if (text.indexOf("=") === -1) return false;
  return ENV_LINE_MULTI_RE.test(text);
}

export function redactText(text: string): RedactResult {
  // Fast path: no KEY=VALUE patterns → just check inline secrets
  if (!hasEnvLine(text)) {
    return redactInlineSecrets(text);
  }

  // Split and redact per-line
  const lines = text.split("\n");
  let anyRedacted = false;
  // Build output only if we find something to redact (avoid allocation on clean path)
  let redactedLines: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parsed = parseEnvLine(line);
    if (parsed === null) continue;

    if (classifyValue(parsed.key, parsed.innerValue) === "secret") {
      if (redactedLines === null) {
        // First redaction — copy all lines up to this point
        redactedLines = new Array(lines.length);
        for (let j = 0; j < i; j++) redactedLines[j] = lines[j];
      }
      redactedLines[i] = `${parsed.prefix}${parsed.key}=${parsed.quoteChar}${REDACTED}${parsed.quoteChar}`;
      anyRedacted = true;
    } else if (redactedLines !== null) {
      redactedLines[i] = line;
    }
  }

  if (anyRedacted && redactedLines !== null) {
    // Fill any remaining unprocessed lines
    for (let i = 0; i < lines.length; i++) {
      if (redactedLines[i] === undefined) redactedLines[i] = lines[i];
    }
    // Also run inline redaction for non-env secrets (PEM blocks, conn strings in prose, etc.)
    const envRedacted = redactedLines.join("\n");
    const inlineResult = redactInlineSecrets(envRedacted);
    return { text: inlineResult.text, redacted: true };
  }

  // No per-line redaction — check for inline secrets in the full text
  const inlineResult = redactInlineSecrets(text);
  if (inlineResult.redacted) return inlineResult;

  return { text, redacted: false };
}
