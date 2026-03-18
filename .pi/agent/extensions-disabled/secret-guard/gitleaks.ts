import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ================================================================
//  Gitleaks rule engine — optimized keyword pre-filter
// ================================================================
//
//  V8's native String.indexOf() is extremely fast on modern CPUs
//  (uses SIMD internally). 244 indexOf() calls on 50KB completes
//  in ~1-2ms, faster than any JS Aho-Corasick implementation.
//
//  Strategy:
//  1. Single toLowerCase() of the text
//  2. 244 indexOf() calls to find which keywords are present
//  3. Only test regexes for rules whose keywords matched
// ================================================================

interface RawRule {
  id: string;
  pattern: string;
  keywords: string[];
}

interface CompiledRule {
  id: string;
  pattern: RegExp;
}

// --- Load and compile rules at startup ---

const extensionDir = dirname(fileURLToPath(import.meta.url));
const rawRules: RawRule[] = JSON.parse(
  readFileSync(join(extensionDir, "gitleaks-rules.json"), "utf-8")
);

// Deduplicate keywords, build keyword→rules index
const keywordToRuleIdx = new Map<string, number[]>();
const uniqueKeywords: string[] = [];
const rules: CompiledRule[] = [];
const rulesWithoutKeywords: number[] = []; // indices into rules[]

for (const raw of rawRules) {
  let pattern: RegExp;
  try {
    // Strip inline (?i) flags — Node.js doesn't support them,
    // and we already pass "i" to RegExp(). Also handle (?i) mid-pattern.
    const cleaned = raw.pattern.replace(/\(\?i\)/g, "");
    pattern = new RegExp(cleaned, "i");
  } catch {
    continue;
  }

  const ruleIdx = rules.length;
  rules.push({ id: raw.id, pattern });

  if (raw.keywords.length === 0) {
    rulesWithoutKeywords.push(ruleIdx);
    continue;
  }

  for (const kw of raw.keywords) {
    const lower = kw.toLowerCase();
    let indices = keywordToRuleIdx.get(lower);
    if (!indices) {
      indices = [];
      keywordToRuleIdx.set(lower, indices);
      uniqueKeywords.push(lower);
    }
    indices.push(ruleIdx);
  }
}

// Sort keywords longest-first so longer matches are checked first
// (minor optimization: longer keywords fail faster on average)
uniqueKeywords.sort((a, b) => b.length - a.length);

// Pre-allocate a boolean array for deduplicating candidate rules
const rulesSeen = new Uint8Array(rules.length);

// ================================================================
//  Candidate rule selection
// ================================================================

function getCandidateIndices(lower: string): number[] {
  // Reset seen array
  rulesSeen.fill(0);

  const candidates: number[] = [];

  // Always include keywordless rules
  for (let i = 0; i < rulesWithoutKeywords.length; i++) {
    const ri = rulesWithoutKeywords[i];
    candidates.push(ri);
    rulesSeen[ri] = 1;
  }

  // Find which keywords appear in text
  for (let i = 0; i < uniqueKeywords.length; i++) {
    if (lower.indexOf(uniqueKeywords[i]) !== -1) {
      const ruleIndices = keywordToRuleIdx.get(uniqueKeywords[i])!;
      for (let j = 0; j < ruleIndices.length; j++) {
        const ri = ruleIndices[j];
        if (!rulesSeen[ri]) {
          rulesSeen[ri] = 1;
          candidates.push(ri);
        }
      }
    }
  }

  return candidates;
}

// ================================================================
//  Public API
// ================================================================

export function matchesGitleaksValue(value: string): string | null {
  if (value.length < 8) return null;

  const lower = value.toLowerCase();
  const candidates = getCandidateIndices(lower);
  for (let i = 0; i < candidates.length; i++) {
    const rule = rules[candidates[i]];
    if (rule.pattern.test(value)) return rule.id;
  }
  return null;
}

export function matchesGitleaksText(text: string): string | null {
  const lower = text.toLowerCase();
  const candidates = getCandidateIndices(lower);
  for (let i = 0; i < candidates.length; i++) {
    const rule = rules[candidates[i]];
    if (rule.pattern.test(text)) return rule.id;
  }
  return null;
}
