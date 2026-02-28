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

const keywordPrefilter = (rule: CompiledRule, text: string): boolean =>
  rule.keywords.length === 0 ||
  rule.keywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));

export const matchesGitleaksValue = (value: string): string | null => {
  if (value.length < 8) return null;
  for (const rule of rules) {
    if (!keywordPrefilter(rule, value)) continue;
    if (rule.pattern.test(value)) return rule.id;
  }
  return null;
};

export const matchesGitleaksText = (text: string): string | null => {
  for (const rule of rules) {
    if (!keywordPrefilter(rule, text)) continue;
    if (rule.pattern.test(text)) return rule.id;
  }
  return null;
};
