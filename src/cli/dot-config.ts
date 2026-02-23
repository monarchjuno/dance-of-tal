import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as lockfile from "proper-lockfile";
import { z } from "zod";
import { Dance, Tal } from "../data/types.js";

const DEFAULT_SCHEMA_VERSION = "2.2.0";

const talRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("custom"), id: z.string().min(1) })
]);

const danceRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("custom"), id: z.string().min(1) })
]);

const actRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("custom"), id: z.string().min(1) })
]);

const storedCustomTalSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  tal: z.custom<Tal>()
});

const storedCustomDanceSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  dance: z.custom<Dance>()
});

const comboSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  talRef: talRefSchema.nullable(),
  danceRef: danceRefSchema.nullable(),
  actRef: actRefSchema.nullable().optional(),
  stage: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const comboHistorySchema = z.object({
  comboId: z.string().min(1),
  setAt: z.string().min(1)
});

const dotConfigSchema = z.object({
  schemaVersion: z.string().min(1),
  updatedAt: z.string().min(1),
  activeComboId: z.string().nullable(),
  combos: z.array(comboSchema),
  customTals: z.array(storedCustomTalSchema),
  customDances: z.array(storedCustomDanceSchema),
  history: z.array(comboHistorySchema)
});

export type DotTalRef = z.infer<typeof talRefSchema>;
export type DotDanceRef = z.infer<typeof danceRefSchema>;
export type DotActRef = z.infer<typeof actRefSchema>;
export type DotCombo = z.infer<typeof comboSchema>;
export type DotConfig = z.infer<typeof dotConfigSchema>;

const nowISO = () => new Date().toISOString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeString = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};

const normalizeStringList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => normalizeString(item))
    .map((item) => item.trim())
    .filter(Boolean);
};

const listToSection = (title: string, values: string[]) => {
  if (values.length === 0) return null;
  return [title, ...values.map((item) => `- ${item}`)].join("\n");
};

const normalizeTalThinking = (thinking: unknown) => {
  if (typeof thinking === "string" && thinking.trim()) return thinking.trim();
  if (Array.isArray(thinking)) {
    const values = normalizeStringList(thinking);
    if (values.length > 0) return values.join("\n");
  }
  if (isRecord(thinking)) {
    const principles = normalizeStringList(thinking.principles);
    const todo = normalizeStringList(thinking.do);
    const dont = normalizeStringList(thinking.dont);
    const checklist = normalizeStringList(thinking.checklist);
    const sections = [
      listToSection("Principles:", principles),
      listToSection("Do:", todo),
      listToSection("Don't:", dont),
      listToSection("Checklist:", checklist)
    ].filter((section): section is string => Boolean(section));

    if (sections.length > 0) return sections.join("\n\n");
  }
  return "Apply explicit reasoning with clear assumptions, tradeoffs, and actionable next steps.";
};

const normalizeDanceRules = (rawDance: Record<string, unknown>) => {
  const existingRules = normalizeString(rawDance.rules);
  if (existingRules) return existingRules;

  const tone = normalizeStringList(rawDance.tone);
  const structure = normalizeStringList(rawDance.structure);
  const formatting = normalizeStringList(rawDance.formatting);
  const forbidden = normalizeStringList(rawDance.forbidden);
  const rhythm = normalizeString(rawDance.rhythm);

  const parts = [
    tone.length > 0 ? `Voice and tone guidance: ${tone.join(", ")}.` : "",
    structure.length > 0 ? `Response flow guidance: ${structure.join(" -> ")}.` : "",
    formatting.length > 0 ? `Formatting preferences: ${formatting.join("; ")}.` : "",
    forbidden.length > 0 ? `Avoid patterns: ${forbidden.join("; ")}.` : "",
    rhythm ? `Cadence: ${rhythm}.` : ""
  ].filter(Boolean);

  if (parts.length > 0) return parts.join("\n");
  return "Output objective: deliver clear, actionable responses with strong structure and context fidelity.";
};

const normalizeDanceExemplarSet = (rawDance: Record<string, unknown>) => {
  const exemplarSet = rawDance.exemplarSet;
  if (isRecord(exemplarSet) && Array.isArray(exemplarSet.styleExamples)) {
    const styleExamples = exemplarSet.styleExamples
      .map((item) => (isRecord(item) ? item : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const input = normalizeString(item.input);
        const output = normalizeString(item.output);
        if (!input || !output) return null;
        const label = normalizeString(item.label);
        const notes = normalizeString(item.notes);
        return {
          input,
          output,
          ...(label ? { label } : {}),
          ...(notes ? { notes } : {})
        };
      })
      .filter((item): item is { input: string; output: string; label?: string; notes?: string } => Boolean(item))
      .slice(0, 8);

    if (styleExamples.length > 0) {
      const antiPatterns = Array.isArray(exemplarSet.antiPatterns)
        ? exemplarSet.antiPatterns
          .map((item) => (isRecord(item) ? item : null))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => {
            const bad = normalizeString(item.bad);
            const better = normalizeString(item.better);
            const reason = normalizeString(item.reason);
            if (!bad) return null;
            return {
              bad,
              ...(better ? { better } : {}),
              ...(reason ? { reason } : {})
            };
          })
          .filter((item): item is { bad: string; better?: string; reason?: string } => Boolean(item))
          .slice(0, 8)
        : [];

      return {
        styleExamples,
        ...(antiPatterns.length > 0 ? { antiPatterns } : {})
      };
    }
  }

  if (Array.isArray(rawDance.examples)) {
    const styleExamples = rawDance.examples
      .map((item) => (isRecord(item) ? item : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const input = normalizeString(item.input);
        const output = normalizeString(item.output);
        if (!input || !output) return null;
        return { input, output };
      })
      .filter((item): item is { input: string; output: string } => Boolean(item))
      .slice(0, 8);

    if (styleExamples.length > 0) {
      return { styleExamples };
    }
  }

  return undefined;
};

const normalizeCustomTal = (raw: unknown, index: number) => {
  const item = isRecord(raw) ? raw : {};
  const rawTal = isRecord(item.tal) ? item.tal : {};
  const slug = normalizeString(rawTal.slug) || `custom-tal-${index + 1}`;
  const name = normalizeString(rawTal.name) || `Custom Tal ${index + 1}`;
  const description = normalizeString(rawTal.description) || "Custom Tal";
  const category = normalizeString(rawTal.category) || "General";
  const tags = normalizeStringList(rawTal.tags).slice(0, 16);
  const featuredScoreRaw = Number(rawTal.featuredScore);
  const featuredScore = Number.isFinite(featuredScoreRaw) ? featuredScoreRaw : 100;
  const createdAt = normalizeString(rawTal.createdAt) || nowISO().slice(0, 10);

  const tal: Tal = {
    slug,
    name,
    description,
    category,
    tags,
    featuredScore,
    createdAt,
    thinking: normalizeTalThinking(rawTal.thinking)
  };

  return {
    id: normalizeString(item.id) || `tal_${randomUUID()}`,
    createdAt: normalizeString(item.createdAt) || nowISO(),
    tal
  };
};

const normalizeCustomDance = (raw: unknown, index: number) => {
  const item = isRecord(raw) ? raw : {};
  const rawDance = isRecord(item.dance) ? item.dance : {};
  const slug = normalizeString(rawDance.slug) || `custom-dance-${index + 1}`;
  const name = normalizeString(rawDance.name) || `Custom Dance ${index + 1}`;
  const description = normalizeString(rawDance.description) || "Custom Dance";
  const category = normalizeString(rawDance.category) || "General";
  const exemplarSet = normalizeDanceExemplarSet(rawDance);

  const dance: Dance = {
    slug,
    name,
    description,
    category,
    rules: normalizeDanceRules(rawDance),
    ...(exemplarSet ? { exemplarSet } : {})
  };

  return {
    id: normalizeString(item.id) || `dance_${randomUUID()}`,
    createdAt: normalizeString(item.createdAt) || nowISO(),
    dance
  };
};

const normalizeDotConfigShape = (parsed: unknown): DotConfig => {
  const raw = isRecord(parsed) ? parsed : {};
  const normalized: DotConfig = {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    updatedAt: normalizeString(raw.updatedAt) || nowISO(),
    activeComboId: raw.activeComboId === null ? null : normalizeString(raw.activeComboId) || null,
    combos: Array.isArray(raw.combos) ? raw.combos.filter(Boolean).map((combo) => comboSchema.parse(combo)) : [],
    customTals: Array.isArray(raw.customTals) ? raw.customTals.map((item, idx) => normalizeCustomTal(item, idx)) : [],
    customDances: Array.isArray(raw.customDances)
      ? raw.customDances.map((item, idx) => normalizeCustomDance(item, idx))
      : [],
    history: Array.isArray(raw.history) ? raw.history.filter(Boolean).map((item) => comboHistorySchema.parse(item)) : []
  };

  return normalized;
};

const isNotFoundError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  return (error as NodeJS.ErrnoException).code === "ENOENT";
};

const buildDefaultConfig = (): DotConfig => ({
  schemaVersion: DEFAULT_SCHEMA_VERSION,
  updatedAt: nowISO(),
  activeComboId: null,
  combos: [],
  customTals: [],
  customDances: [],
  history: []
});

const resolveDefaultComboName = ({ name, talSlug, danceSlug, actSlug, stage }: { name?: string; talSlug?: string | null; danceSlug?: string | null; actSlug?: string | null; stage?: string | null }) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (talSlug && danceSlug) return `${talSlug} x ${danceSlug}`;
  if (talSlug) return `${talSlug} Tal Focus`;
  if (danceSlug) return `${danceSlug} Dance Mode`;
  if (actSlug) return `${actSlug} Act Sequence`;
  if (stage) return `${stage} Stage Target`;
  return `combo-${new Date().toISOString().slice(0, 10)}`;
};

export const resolveProjectDir = (projectDir?: string) => {
  const input = projectDir?.trim();
  return path.resolve(input && input.length > 0 ? input : process.cwd());
};

export const getConfigPaths = (projectDir?: string) => {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  const dotDir = path.join(resolvedProjectDir, ".dance-of-tal");
  const configPath = path.join(dotDir, "config.json");
  return { projectDir: resolvedProjectDir, dotDir, configPath };
};

const persistConfig = async (projectDir: string, config: DotConfig) => {
  const paths = getConfigPaths(projectDir);
  await mkdir(paths.dotDir, { recursive: true });

  let release = () => Promise.resolve();
  try {
    release = await lockfile.lock(paths.dotDir, {
      retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 }
    });
    await writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } finally {
    await release().catch(() => { });
  }
  return paths;
};

const saveAndReturn = async (projectDir: string, config: DotConfig) => {
  const paths = await persistConfig(projectDir, config);
  return { ...paths, config };
};

const readOrInitProjectConfig = async (projectDir?: string) => {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  const current = await readProjectConfig(resolvedProjectDir);
  if (current) return current;

  const created = buildDefaultConfig();
  await persistConfig(resolvedProjectDir, created);
  return created;
};

export const initProjectConfig = async (projectDir?: string) => {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  const existing = await readProjectConfig(resolvedProjectDir);
  const config = existing ?? buildDefaultConfig();
  const paths = await persistConfig(resolvedProjectDir, config);
  return { ...paths, config };
};

export const readProjectConfig = async (projectDir?: string): Promise<DotConfig | null> => {
  const paths = getConfigPaths(projectDir);
  let release = () => Promise.resolve();

  try {
    await mkdir(paths.dotDir, { recursive: true });
    release = await lockfile.lock(paths.dotDir, {
      retries: { retries: 3, minTimeout: 50, maxTimeout: 500 }
    });

    const raw = await readFile(paths.configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeDotConfigShape(parsed);

    const strict = dotConfigSchema.safeParse(normalized);
    if (strict.success) {
      const parsedStable = JSON.stringify(parsed);
      const normalizedStable = JSON.stringify(strict.data);
      if (parsedStable !== normalizedStable) {
        await writeFile(paths.configPath, `${JSON.stringify(strict.data, null, 2)}\n`, "utf8");
      }
      return strict.data;
    }

    throw strict.error;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  } finally {
    await release().catch(() => { });
  }
};

export const getComboById = async ({ projectDir, comboId }: { projectDir?: string; comboId: string }) => {
  const config = await readOrInitProjectConfig(projectDir);
  const combo = config.combos.find((item) => item.id === comboId) ?? null;
  return { config, combo };
};

export const createPresetCombo = async ({
  projectDir,
  name,
  talSlug,
  danceSlug,
  actSlug,
  stage,
  activate = true
}: {
  projectDir?: string;
  name?: string;
  talSlug?: string;
  danceSlug?: string;
  actSlug?: string;
  stage?: string;
  activate?: boolean;
}) => {
  const normalizedTalSlug = talSlug?.trim() || null;
  const normalizedDanceSlug = danceSlug?.trim() || null;
  const normalizedActSlug = actSlug?.trim() || null;
  const normalizedStage = stage?.trim() || null;
  if (!normalizedTalSlug && !normalizedDanceSlug && !normalizedActSlug && !normalizedStage) {
    throw new Error("At least one configuration target (Tal, Dance, Act, Stage) must be provided");
  }

  return createComboFromRefs({
    projectDir,
    name,
    talRef: normalizedTalSlug ? { kind: "preset", slug: normalizedTalSlug } : null,
    danceRef: normalizedDanceSlug ? { kind: "preset", slug: normalizedDanceSlug } : null,
    actRef: normalizedActSlug ? { kind: "preset", slug: normalizedActSlug } : null,
    stage: normalizedStage,
    activate
  });
};

export const createComboFromRefs = async ({
  projectDir,
  name,
  talRef,
  danceRef,
  actRef,
  stage,
  activate = true
}: {
  projectDir?: string;
  name?: string;
  talRef?: DotTalRef | null;
  danceRef?: DotDanceRef | null;
  actRef?: DotActRef | null;
  stage?: string | null;
  activate?: boolean;
}) => {
  const normalizedTalRef = talRef ?? null;
  const normalizedDanceRef = danceRef ?? null;
  const normalizedActRef = actRef ?? null;
  const normalizedStage = stage?.trim() || null;
  if (!normalizedTalRef && !normalizedDanceRef && !normalizedActRef && !normalizedStage) {
    throw new Error("At least one configuration target reference must be provided");
  }

  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const now = nowISO();
  const comboId = randomUUID();

  const talLabel = normalizedTalRef ? (normalizedTalRef.kind === "preset" ? normalizedTalRef.slug : "custom-tal") : null;
  const danceLabel = normalizedDanceRef ? (normalizedDanceRef.kind === "preset" ? normalizedDanceRef.slug : "custom-dance") : null;
  const actLabel = normalizedActRef ? (normalizedActRef.kind === "preset" ? normalizedActRef.slug : "custom-act") : null;

  const combo: DotCombo = {
    id: comboId,
    name: resolveDefaultComboName({ name, talSlug: talLabel, danceSlug: danceLabel, actSlug: actLabel, stage: normalizedStage }),
    talRef: normalizedTalRef,
    danceRef: normalizedDanceRef,
    actRef: normalizedActRef,
    stage: normalizedStage,
    createdAt: now,
    updatedAt: now
  };

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: now,
    combos: [...config.combos, combo],
    activeComboId: activate ? comboId : config.activeComboId,
    history: activate ? [...config.history, { comboId, setAt: now }].slice(-50) : config.history
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

export const createCustomCombo = async ({
  projectDir,
  name,
  tal,
  dance,
  activate = true
}: {
  projectDir?: string;
  name: string;
  tal?: Tal;
  dance?: Dance;
  activate?: boolean;
}) => {
  if (!tal && !dance) {
    throw new Error("tal or dance is required to create a custom combo");
  }

  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const now = nowISO();

  const customTalId = tal ? `tal_${randomUUID()}` : null;
  const customDanceId = dance ? `dance_${randomUUID()}` : null;
  const comboId = randomUUID();

  const combo: DotCombo = {
    id: comboId,
    name: resolveDefaultComboName({ name, talSlug: tal?.slug ?? null, danceSlug: dance?.slug ?? null }),
    talRef: customTalId ? { kind: "custom", id: customTalId } : null,
    danceRef: customDanceId ? { kind: "custom", id: customDanceId } : null,
    createdAt: now,
    updatedAt: now
  };

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: now,
    activeComboId: activate ? comboId : config.activeComboId,
    combos: [...config.combos, combo],
    customTals: tal && customTalId ? [...config.customTals, { id: customTalId, createdAt: now, tal }] : config.customTals,
    customDances: dance && customDanceId ? [...config.customDances, { id: customDanceId, createdAt: now, dance }] : config.customDances,
    history: activate ? [...config.history, { comboId, setAt: now }].slice(-50) : config.history
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

export const setActiveComboById = async ({ projectDir, comboId }: { projectDir?: string; comboId: string }) => {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const combo = config.combos.find((item) => item.id === comboId);
  if (!combo) return null;

  const now = nowISO();
  const nextConfig: DotConfig = {
    ...config,
    updatedAt: now,
    activeComboId: comboId,
    history: [...config.history, { comboId, setAt: now }].slice(-50)
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

export const renameCombo = async ({ projectDir, comboId, name }: { projectDir?: string; comboId: string; name: string }) => {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("combo name cannot be empty");

  let found = false;
  const nextCombos = config.combos.map((combo) => {
    if (combo.id !== comboId) return combo;
    found = true;
    return {
      ...combo,
      name: trimmed,
      updatedAt: nowISO()
    };
  });

  if (!found) return null;

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: nowISO(),
    combos: nextCombos
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

const applyRequiredStringPatch = (current: string, next: string | undefined, fieldName: string) => {
  if (next === undefined) return current;
  const trimmed = next.trim();
  if (!trimmed) throw new Error(`${fieldName} cannot be empty`);
  return trimmed;
};

const applyOptionalScorePatch = (current: number, next: number | undefined) => {
  if (next === undefined) return current;
  if (!Number.isFinite(next)) throw new Error("featuredScore must be a finite number");
  return next;
};

const normalizeTagPatch = (next: string[] | undefined) => {
  if (next === undefined) return undefined;
  return next.map((item) => item.trim()).filter(Boolean).slice(0, 16);
};

const normalizeExemplarPatch = (value: Dance["exemplarSet"] | null | undefined): Dance["exemplarSet"] | null | undefined => {
  if (value === undefined || value === null) return value;

  const styleExamples = Array.isArray(value.styleExamples)
    ? value.styleExamples
      .map((item) => ({
        input: item.input?.trim() ?? "",
        output: item.output?.trim() ?? "",
        ...(item.label?.trim() ? { label: item.label.trim() } : {}),
        ...(item.notes?.trim() ? { notes: item.notes.trim() } : {})
      }))
      .filter((item) => item.input.length > 0 && item.output.length > 0)
      .slice(0, 12)
    : [];

  if (styleExamples.length === 0) {
    throw new Error("exemplarSet.styleExamples must include at least one input/output pair");
  }

  const antiPatterns = Array.isArray(value.antiPatterns)
    ? value.antiPatterns
      .map((item) => ({
        bad: item.bad?.trim() ?? "",
        ...(item.better?.trim() ? { better: item.better.trim() } : {}),
        ...(item.reason?.trim() ? { reason: item.reason.trim() } : {})
      }))
      .filter((item) => item.bad.length > 0)
      .slice(0, 12)
    : [];

  return antiPatterns.length > 0 ? { styleExamples, antiPatterns } : { styleExamples };
};

export const updateCustomTal = async ({
  projectDir,
  talId,
  patch
}: {
  projectDir?: string;
  talId: string;
  patch: Partial<Pick<Tal, "slug" | "name" | "description" | "category" | "tags" | "featuredScore" | "createdAt" | "thinking">>;
}) => {
  const normalizedTalId = talId.trim();
  if (!normalizedTalId) throw new Error("talId is required");

  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const now = nowISO();
  const nextTags = normalizeTagPatch(patch.tags);

  let found = false;
  const nextCustomTals = config.customTals.map((item) => {
    if (item.id !== normalizedTalId) return item;
    found = true;

    const nextTal: Tal = {
      ...item.tal,
      slug: applyRequiredStringPatch(item.tal.slug, patch.slug, "tal.slug"),
      name: applyRequiredStringPatch(item.tal.name, patch.name, "tal.name"),
      description: applyRequiredStringPatch(item.tal.description, patch.description, "tal.description"),
      category: applyRequiredStringPatch(item.tal.category, patch.category, "tal.category"),
      tags: nextTags ?? item.tal.tags,
      featuredScore: applyOptionalScorePatch(item.tal.featuredScore, patch.featuredScore),
      createdAt: applyRequiredStringPatch(item.tal.createdAt, patch.createdAt, "tal.createdAt"),
      thinking: applyRequiredStringPatch(item.tal.thinking, patch.thinking, "tal.thinking")
    };

    return {
      ...item,
      tal: nextTal
    };
  });

  if (!found) return null;

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: now,
    customTals: nextCustomTals,
    combos: config.combos.map((combo) =>
      combo.talRef?.kind === "custom" && combo.talRef.id === normalizedTalId
        ? {
          ...combo,
          updatedAt: now
        }
        : combo
    )
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

export const updateCustomDance = async ({
  projectDir,
  danceId,
  patch
}: {
  projectDir?: string;
  danceId: string;
  patch: Partial<Pick<Dance, "slug" | "name" | "description" | "category" | "rules">> & { exemplarSet?: Dance["exemplarSet"] | null };
}) => {
  const normalizedDanceId = danceId.trim();
  if (!normalizedDanceId) throw new Error("danceId is required");

  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const now = nowISO();
  const nextExemplarSet = normalizeExemplarPatch(patch.exemplarSet);

  let found = false;
  const nextCustomDances = config.customDances.map((item) => {
    if (item.id !== normalizedDanceId) return item;
    found = true;

    const baseDance: Dance = {
      ...item.dance,
      slug: applyRequiredStringPatch(item.dance.slug, patch.slug, "dance.slug"),
      name: applyRequiredStringPatch(item.dance.name, patch.name, "dance.name"),
      description: applyRequiredStringPatch(item.dance.description, patch.description, "dance.description"),
      category: applyRequiredStringPatch(item.dance.category, patch.category, "dance.category"),
      rules: applyRequiredStringPatch(item.dance.rules, patch.rules, "dance.rules")
    };

    const nextDance: Dance =
      nextExemplarSet === undefined
        ? baseDance
        : nextExemplarSet === null
          ? (() => {
            const { exemplarSet: _removed, ...withoutExemplar } = baseDance;
            return withoutExemplar;
          })()
          : { ...baseDance, exemplarSet: nextExemplarSet };

    return {
      ...item,
      dance: nextDance
    };
  });

  if (!found) return null;

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: now,
    customDances: nextCustomDances,
    combos: config.combos.map((combo) =>
      combo.danceRef?.kind === "custom" && combo.danceRef.id === normalizedDanceId
        ? {
          ...combo,
          updatedAt: now
        }
        : combo
    )
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

const validateTalRef = (config: DotConfig, talRef: DotTalRef | null) => {
  if (!talRef) return;
  if (talRef.kind === "preset") {
    if (!talRef.slug.trim()) throw new Error("talRef.slug cannot be empty");
    return;
  }

  const exists = config.customTals.some((item) => item.id === talRef.id);
  if (!exists) throw new Error(`Custom Tal not found: ${talRef.id}`);
};

const validateDanceRef = (config: DotConfig, danceRef: DotDanceRef | null) => {
  if (!danceRef) return;
  if (danceRef.kind === "preset") {
    if (!danceRef.slug.trim()) throw new Error("danceRef.slug cannot be empty");
    return;
  }

  const exists = config.customDances.some((item) => item.id === danceRef.id);
  if (!exists) throw new Error(`Custom Dance not found: ${danceRef.id}`);
};

export const updateCombo = async ({
  projectDir,
  comboId,
  name,
  talRef,
  danceRef,
  actRef,
  stage,
  activate
}: {
  projectDir?: string;
  comboId: string;
  name?: string;
  talRef?: DotTalRef | null;
  danceRef?: DotDanceRef | null;
  actRef?: DotActRef | null;
  stage?: string | null;
  activate?: boolean;
}) => {
  const normalizedComboId = comboId.trim();
  if (!normalizedComboId) throw new Error("comboId is required");

  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const current = config.combos.find((combo) => combo.id === normalizedComboId);
  if (!current) return null;

  const resolvedTalRef = talRef === undefined ? current.talRef : talRef;
  const resolvedDanceRef = danceRef === undefined ? current.danceRef : danceRef;
  const resolvedActRef = actRef === undefined ? current.actRef : actRef;
  const resolvedStage = stage === undefined ? current.stage : stage;

  if (!resolvedTalRef && !resolvedDanceRef && !resolvedActRef && !resolvedStage) {
    throw new Error("combo must keep at least one of talRef, danceRef, actRef, or stage");
  }

  validateTalRef(config, resolvedTalRef);
  validateDanceRef(config, resolvedDanceRef);
  validateActRef(config, resolvedActRef);

  const now = nowISO();
  const trimmedName = name?.trim();
  if (name !== undefined && !trimmedName) throw new Error("combo name cannot be empty");

  const nextCombo: DotCombo = {
    ...current,
    name: trimmedName ?? current.name,
    talRef: resolvedTalRef,
    danceRef: resolvedDanceRef,
    actRef: resolvedActRef,
    stage: resolvedStage,
    updatedAt: now
  };

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: now,
    combos: config.combos.map((combo) => (combo.id === normalizedComboId ? nextCombo : combo)),
    activeComboId: activate ? normalizedComboId : config.activeComboId,
    history: activate ? [...config.history, { comboId: normalizedComboId, setAt: now }].slice(-50) : config.history
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};

export const clearActiveCombo = async (projectDir?: string) => {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);

  const nextConfig: DotConfig = {
    ...config,
    updatedAt: nowISO(),
    activeComboId: null
  };

  return saveAndReturn(resolvedProjectDir, nextConfig);
};
