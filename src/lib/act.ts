import { randomUUID } from "node:crypto";
import { recommendGptsByNeed } from "./gpts.js";
import { buildActPrompt, buildOutputPrompt, buildThinkingPrompt, findAct, findDance, findTal, getRecommendedCombos, listDances, listTals } from "./persona.js";

export type ActFilters = {
  talCategory?: string;
  danceCategory?: string;
  tag?: string;
  limitTal?: number;
  limitDance?: number;
  limitCombos?: number;
};

export type ActComboOption = {
  rank: number;
  comboName: string;
  talSlug: string;
  talName: string;
  talCategory: string;
  danceSlug: string;
  danceName: string;
  danceCategory: string | null;
  reason: string;
};

export type ActTalOption = {
  slug: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
};

export type ActDanceOption = {
  slug: string;
  name: string;
  category: string;
  description: string;
  tone: string[];
  structure: string[];
};

export type ActRecommendation = {
  need: string;
  matchedHintIds: string[];
  talOptions: ActTalOption[];
  danceOptions: ActDanceOption[];
  comboOptions: ActComboOption[];
  nextBestCombo: ActComboOption | null;
};

export type ActiveComboState = {
  talSlug: string | null;
  danceSlug: string | null;
  actSlug: string | null;
  stage: string | null;
  comboName: string;
  setAt: string;
};

export type ActSession = {
  id: string;
  goal: string;
  language: string;
  projectDir?: string;
  createdAt: string;
  updatedAt: string;
  filters: ActFilters;
  activeCombo: ActiveComboState | null;
  history: ActiveComboState[];
  recommendation: ActRecommendation;
};

const sessions = new Map<string, ActSession>();

const DEFAULT_LIMIT_TAL = 6;
const DEFAULT_LIMIT_DANCE = 8;
const DEFAULT_LIMIT_COMBOS = 8;

const lower = (value: string) => value.toLowerCase().trim();

const buildSystemInstructionHeader = () =>
  [
    "System Instruction:",
    "You are an AI assistant.",
    "Follow the reasoning rules first, then produce output using the response style rules.",
    "Keep reasoning disciplined and produce outputs and behavior that match the required tone, format, and operating constraints."
  ].join("\n");

const categoryMatch = (candidate: string, selected?: string) => {
  if (!selected || selected.trim().length === 0 || selected === "All") return true;
  return lower(candidate) === lower(selected);
};

const hasTag = (tags: string[], selected?: string) => {
  if (!selected || selected.trim().length === 0) return true;
  const target = lower(selected);
  return tags.some((tag) => lower(tag) === target);
};

const dedupeBySlug = <T extends { slug: string }>(items: T[]) => {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.slug)) map.set(item.slug, item);
  }
  return Array.from(map.values());
};

const buildFallbackTals = (need: string, filters: ActFilters): ActTalOption[] => {
  const withQuery = listTals({ query: need, category: filters.talCategory });
  const source = withQuery.length > 0 ? withQuery : listTals({ category: filters.talCategory });
  const items = source.map((item) => ({
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    tags: item.tags
  }));
  return items.filter((item) => hasTag(item.tags, filters.tag));
};

const buildFallbackDances = (need: string, filters: ActFilters): ActDanceOption[] => {
  const withQuery = listDances({ query: need, category: filters.danceCategory });
  const source = withQuery.length > 0 ? withQuery : listDances({ category: filters.danceCategory });
  const items = source.map((item) => ({
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    tone: item.tone,
    structure: item.structure
  }));

  if (!filters.tag) return items;
  return items.filter((item) => [...item.tone, ...item.structure].some((token) => lower(token) === lower(filters.tag ?? "")));
};

const buildRecommendation = (need: string, filters: ActFilters, triedComboKeys: Set<string>): ActRecommendation => {
  const limitTal = filters.limitTal ?? DEFAULT_LIMIT_TAL;
  const limitDance = filters.limitDance ?? DEFAULT_LIMIT_DANCE;
  const limitCombos = filters.limitCombos ?? DEFAULT_LIMIT_COMBOS;

  const byNeed = recommendGptsByNeed(need, limitTal, limitDance);

  const talFromNeed: ActTalOption[] = byNeed.recommendedTals
    .map((tal) => ({
      slug: tal.s,
      name: tal.n,
      category: tal.c,
      description: tal.d,
      tags: tal.t
    }))
    .filter((tal) => categoryMatch(tal.category, filters.talCategory) && hasTag(tal.tags, filters.tag));

  const danceFromNeed: ActDanceOption[] = byNeed.recommendedDances
    .map((dance) => ({
      slug: dance.s,
      name: dance.n,
      category: dance.c,
      description: dance.d,
      tone: dance.t,
      structure: dance.st
    }))
    .filter((dance) => categoryMatch(dance.category, filters.danceCategory) && hasTag([...dance.tone, ...dance.structure], filters.tag));

  const talOptions = dedupeBySlug(talFromNeed.length > 0 ? talFromNeed : buildFallbackTals(need, filters)).slice(0, limitTal);

  const danceOptions = dedupeBySlug(danceFromNeed.length > 0 ? danceFromNeed : buildFallbackDances(need, filters)).slice(0, limitDance);

  const danceSlugSet = new Set(danceOptions.map((dance) => dance.slug));
  const combos: ActComboOption[] = [];

  for (const tal of talOptions) {
    const recommendations = getRecommendedCombos({ talSlug: tal.slug, limit: 8 });
    if (!recommendations || !("recommendedDances" in recommendations) || !recommendations.recommendedDances) continue;

    for (const dance of recommendations.recommendedDances) {
      if (danceSlugSet.size > 0 && !danceSlugSet.has(dance.slug)) continue;
      if (!categoryMatch(dance.category ?? "", filters.danceCategory)) continue;

      combos.push({
        rank: combos.length + 1,
        comboName: `${tal.name} x ${dance.name}`,
        talSlug: tal.slug,
        talName: tal.name,
        talCategory: tal.category,
        danceSlug: dance.slug,
        danceName: dance.name,
        danceCategory: dance.category,
        reason: "Matched from need hints + recommended Tal-Dance relation"
      });

      if (combos.length >= limitCombos) break;
    }

    if (combos.length >= limitCombos) break;
  }

  if (combos.length === 0) {
    const fallbackTals = talOptions.slice(0, 3);
    const fallbackDances = danceOptions.slice(0, 4);

    for (const tal of fallbackTals) {
      for (const dance of fallbackDances) {
        combos.push({
          rank: combos.length + 1,
          comboName: `${tal.name} x ${dance.name}`,
          talSlug: tal.slug,
          talName: tal.name,
          talCategory: tal.category,
          danceSlug: dance.slug,
          danceName: dance.name,
          danceCategory: dance.category,
          reason: "Fallback combo by selected category and need"
        });
        if (combos.length >= limitCombos) break;
      }
      if (combos.length >= limitCombos) break;
    }
  }

  const uniqueCombos: ActComboOption[] = [];
  const seen = new Set<string>();
  for (const combo of combos) {
    const key = `${combo.talSlug}__${combo.danceSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCombos.push({ ...combo, rank: uniqueCombos.length + 1 });
  }

  const nextBestCombo = uniqueCombos.find((combo) => !triedComboKeys.has(`${combo.talSlug}__${combo.danceSlug}`)) ?? uniqueCombos[0] ?? null;

  return {
    need,
    matchedHintIds: byNeed.matchedHintIds,
    talOptions,
    danceOptions,
    comboOptions: uniqueCombos,
    nextBestCombo
  };
};

const buildPromptPack = ({ talSlug, danceSlug, actSlug }: { talSlug: string | null; danceSlug: string | null; actSlug: string | null }) => {
  const tal = talSlug ? findTal(talSlug) : null;
  const dance = danceSlug ? findDance(danceSlug) : null;
  const act = actSlug ? findAct(actSlug) : null;

  if (talSlug && !tal) return null;
  if (danceSlug && !dance) return null;
  if (actSlug && !act) return null;
  if (!tal && !dance && !act) return null;

  const thinkingPrompt = tal ? buildThinkingPrompt(tal) : null;
  const outputPrompt = dance ? buildOutputPrompt(dance) : null;
  const actPrompt = act ? buildActPrompt(act) : null;
  const combinedPrompt = [buildSystemInstructionHeader(), thinkingPrompt, actPrompt, outputPrompt].filter(Boolean).join("\n\n");

  return {
    tal,
    dance,
    act,
    thinkingPrompt,
    outputPrompt,
    actPrompt,
    combinedPrompt
  };
};

export const initializeStylingSession = ({
  goal,
  language,
  projectDir,
  talCategory,
  danceCategory,
  tag,
  limitTal,
  limitDance,
  limitCombos
}: {
  goal: string;
  language?: string;
  projectDir?: string;
  talCategory?: string;
  danceCategory?: string;
  tag?: string;
  limitTal?: number;
  limitDance?: number;
  limitCombos?: number;
}) => {
  const id = randomUUID();
  const now = new Date().toISOString();
  const filters: ActFilters = { talCategory, danceCategory, tag, limitTal, limitDance, limitCombos };
  const recommendation = buildRecommendation(goal, filters, new Set());

  const session: ActSession = {
    id,
    goal,
    language: language?.trim() || "English",
    projectDir: projectDir?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    filters,
    activeCombo: null,
    history: [],
    recommendation
  };

  sessions.set(id, session);

  return {
    session,
    guidance: {
      steps: [
        "Review recommendation.comboOptions.",
        "Call set_active_combo with talSlug + danceSlug (or only one for Tal-only / Dance-only mode).",
        "Call run_active_combo with your real task."
      ]
    }
  };
};

export const nextComboRecommendation = ({
  sessionId,
  need,
  talCategory,
  danceCategory,
  tag,
  limitTal,
  limitDance,
  limitCombos
}: {
  sessionId: string;
  need?: string;
  talCategory?: string;
  danceCategory?: string;
  tag?: string;
  limitTal?: number;
  limitDance?: number;
  limitCombos?: number;
}) => {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const filters: ActFilters = {
    talCategory: talCategory ?? session.filters.talCategory,
    danceCategory: danceCategory ?? session.filters.danceCategory,
    tag: tag ?? session.filters.tag,
    limitTal: limitTal ?? session.filters.limitTal,
    limitDance: limitDance ?? session.filters.limitDance,
    limitCombos: limitCombos ?? session.filters.limitCombos
  };

  const triedComboKeys = new Set(session.history.map((item) => `${item.talSlug ?? ""}__${item.danceSlug ?? ""}`));
  const recommendation = buildRecommendation(need?.trim() || session.goal, filters, triedComboKeys);

  session.goal = need?.trim() || session.goal;
  session.filters = filters;
  session.recommendation = recommendation;
  session.updatedAt = new Date().toISOString();
  sessions.set(session.id, session);

  return {
    session,
    guidance: {
      nextBestCombo: recommendation.nextBestCombo,
      message: recommendation.nextBestCombo
        ? "Call set_active_combo with nextBestCombo or any combo from comboOptions."
        : "No combo found with current filters. Relax category/tag filters and retry."
    }
  };
};

export const setActiveCombo = ({
  sessionId,
  talSlug,
  danceSlug,
  actSlug,
  stage,
  comboName
}: {
  sessionId: string;
  talSlug?: string;
  danceSlug?: string;
  actSlug?: string;
  stage?: string;
  comboName?: string;
}) => {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const normalizedTalSlug = talSlug?.trim() || null;
  const normalizedDanceSlug = danceSlug?.trim() || null;
  const normalizedActSlug = actSlug?.trim() || null;
  const normalizedStage = stage?.trim() || null;
  if (!normalizedTalSlug && !normalizedDanceSlug && !normalizedActSlug && !normalizedStage) return null;

  const promptPack = buildPromptPack({ talSlug: normalizedTalSlug, danceSlug: normalizedDanceSlug, actSlug: normalizedActSlug });
  if (!promptPack) return null;

  const now = new Date().toISOString();
  const resolvedComboName = comboName?.trim() || [promptPack.tal?.name, promptPack.dance?.name, promptPack.act?.name, normalizedStage].filter(Boolean).join(" x ") || "Custom Combo";
  const activeCombo: ActiveComboState = { talSlug: normalizedTalSlug, danceSlug: normalizedDanceSlug, actSlug: normalizedActSlug, stage: normalizedStage, comboName: resolvedComboName, setAt: now };

  session.activeCombo = activeCombo;
  session.history = [...session.history, activeCombo].slice(-20);
  session.updatedAt = now;
  sessions.set(session.id, session);

  return {
    session,
    activeCombo: {
      comboName: resolvedComboName,
      tal: promptPack.tal ? { slug: promptPack.tal.slug, name: promptPack.tal.name, category: promptPack.tal.category } : null,
      dance: promptPack.dance ? { slug: promptPack.dance.slug, name: promptPack.dance.name, category: promptPack.dance.category } : null,
      prompts: {
        thinkingPrompt: promptPack.thinkingPrompt,
        outputPrompt: promptPack.outputPrompt,
        combinedPrompt: promptPack.combinedPrompt
      }
    }
  };
};

export const getSession = (sessionId: string) => sessions.get(sessionId) ?? null;

export const upsertSession = (session: ActSession) => {
  sessions.set(session.id, session);
  return session;
};

export const removeSession = (sessionId: string) => {
  sessions.delete(sessionId);
};

export const listSessions = () =>
  Array.from(sessions.values()).map((session) => ({
    id: session.id,
    goal: session.goal,
    language: session.language,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    activeCombo: session.activeCombo
  }));

export const runActiveCombo = ({ sessionId, task }: { sessionId: string; task: string }) => {
  const session = sessions.get(sessionId);
  if (!session || !session.activeCombo) return null;

  const promptPack = buildPromptPack({ talSlug: session.activeCombo.talSlug, danceSlug: session.activeCombo.danceSlug, actSlug: session.activeCombo.actSlug });
  if (!promptPack) return null;

  return {
    sessionId,
    comboName: session.activeCombo.comboName,
    talSlug: session.activeCombo.talSlug,
    danceSlug: session.activeCombo.danceSlug,
    actSlug: session.activeCombo.actSlug,
    stage: session.activeCombo.stage,
    package: ["SYSTEM:", promptPack.combinedPrompt, "", "USER:", task].join("\n")
  };
};

export const clearSession = ({ sessionId, archive = false }: { sessionId: string; archive?: boolean }) => {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (archive) {
    sessions.delete(sessionId);
    return { sessionId, archived: true };
  }

  const now = new Date().toISOString();
  session.activeCombo = null;
  session.updatedAt = now;
  sessions.set(session.id, session);

  return {
    session,
    archived: false
  };
};

export const getActOverview = () => ({
  flow: [
    {
      step: 1,
      name: "advise_setup_mode",
      purpose: "Decide preset/custom/hybrid strategy and ask clarifying questions"
    },
    {
      step: 2,
      name: "initialize_styling_session",
      purpose: "Start a Tal x Dance session and receive recommended combos based on user goal"
    },
    {
      step: 3,
      name: "next_combo",
      purpose: "Refresh or refine combo recommendations by need/category/tag"
    },
    {
      step: 4,
      name: "set_active_combo",
      purpose: "Lock a Tal + Dance combo as active for the session (or Tal-only / Dance-only)"
    },
    {
      step: 5,
      name: "run_active_combo",
      purpose: "Build a task-ready SYSTEM + USER package using the active combo"
    }
  ],
  helpers: ["get_session", "list_sessions", "clear_session"]
});

// Backward-compatible aliases
export const nextPairRecommendation = nextComboRecommendation;
export const setActivePair = ({ sessionId, talSlug, danceSlug }: { sessionId: string; talSlug: string; danceSlug: string }) =>
  setActiveCombo({ sessionId, talSlug, danceSlug });
export const runActivePair = runActiveCombo;
