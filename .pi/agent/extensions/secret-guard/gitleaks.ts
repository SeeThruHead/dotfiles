import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface RawRule {
  id: string;
  pattern: string;
  keywords: string[];
}

interface CompiledRule {
  id: string;
  pattern: RegExp;
  keywords: string[];
}

const compileRule = (raw: RawRule): CompiledRule | null => {
  try {
    return { id: raw.id, pattern: new RegExp(raw.pattern, "i"), keywords: raw.keywords };
  } catch {
    return null;
  }
};

const extensionDir = dirname(fileURLToPath(import.meta.url));

const rawRules: RawRule[] = JSON.parse(
  readFileSync(join(extensionDir, "gitleaks-rules.json"), "utf-8")
);

const rules: CompiledRule[] = rawRules
  .map(compileRule)
  .filter((r): r is CompiledRule => r !== null);

// Pre-compute: all keywords lowercased, plus index from keyword → rules
const allKeywords: string[] = [
  ...new Set(rules.flatMap((r) => r.keywords.map((k) => k.toLowerCase())))
];

const keywordToRules = new Map<string, CompiledRule[]>();
for (const rule of rules) {
  if (rule.keywords.length === 0) continue;
  for (const kw of rule.keywords) {
    const lower = kw.toLowerCase();
    const list = keywordToRules.get(lower) ?? [];
    list.push(rule);
    keywordToRules.set(lower, list);
  }
}

const rulesWithoutKeywords = rules.filter((r) => r.keywords.length === 0);

// Fast check: does this text contain ANY gitleaks keyword?
const findMatchingKeywords = (text: string): Set<string> => {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const kw of allKeywords) {
    if (lower.includes(kw)) found.add(kw);
  }
  return found;
};

// Get candidate rules based on keyword hits (avoids running all 221 regexes)
const candidateRules = (text: string): CompiledRule[] => {
  const hits = findMatchingKeywords(text);
  if (hits.size === 0) return rulesWithoutKeywords;

  const candidates = new Set<CompiledRule>(rulesWithoutKeywords);
  for (const kw of hits) {
    for (const rule of keywordToRules.get(kw) ?? []) {
      candidates.add(rule);
    }
  }
  return [...candidates];
};

export const matchesGitleaksValue = (value: string): string | null => {
  if (value.length < 8) return null;

  for (const rule of candidateRules(value)) {
    if (rule.pattern.test(value)) return rule.id;
  }
  return null;
};

export const matchesGitleaksText = (text: string): string | null => {
  const candidates = candidateRules(text);
  if (candidates.length === 0) return null;

  for (const rule of candidates) {
    if (rule.pattern.test(text)) return rule.id;
  }
  return null;
};
