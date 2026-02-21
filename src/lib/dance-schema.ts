import { Dance, DanceExemplarSet, DanceRules, DanceStyleExample } from "../data/types.js";

const normalizeList = (items?: string[]) => (Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : []);

const normalizeExample = (value: { input?: string; output?: string; label?: string; notes?: string }): DanceStyleExample | null => {
  const input = value.input?.trim() ?? "";
  const output = value.output?.trim() ?? "";
  if (!input || !output) return null;
  return {
    input,
    output,
    label: value.label?.trim() || undefined,
    notes: value.notes?.trim() || undefined
  };
};

export const resolveDanceRules = (dance: Dance): DanceRules => {
  const rules = dance.rules;
  return {
    tone: normalizeList(rules?.tone ?? dance.tone),
    structure: normalizeList(rules?.structure ?? dance.structure),
    formatting: normalizeList(rules?.formatting ?? dance.formatting),
    forbidden: normalizeList(rules?.forbidden ?? dance.forbidden),
    rhythm: rules?.rhythm?.trim() || dance.rhythm?.trim() || undefined
  };
};

export const resolveDanceExemplarSet = (dance: Dance): DanceExemplarSet => {
  const styleExamples = (dance.exemplarSet?.styleExamples ?? [])
    .map((example) => normalizeExample(example))
    .filter((example): example is DanceStyleExample => Boolean(example));

  const fromLegacy = (dance.examples ?? [])
    .map((example) => normalizeExample(example))
    .filter((example): example is DanceStyleExample => Boolean(example));

  return {
    styleExamples: (styleExamples.length > 0 ? styleExamples : fromLegacy).slice(0, 4),
    antiPatterns: dance.exemplarSet?.antiPatterns?.slice(0, 4)
  };
};

export const resolveDanceExamples = (dance: Dance) => resolveDanceExemplarSet(dance).styleExamples;

export const collectDanceRuleTokens = (dance: Dance) => {
  const rules = resolveDanceRules(dance);
  return [...rules.tone, ...rules.structure, ...rules.formatting, ...rules.forbidden];
};
