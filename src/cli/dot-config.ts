import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

const resolveDefaultComboName = ({ name, talSlug, danceSlug }: { name?: string; talSlug?: string | null; danceSlug?: string | null }) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (talSlug && danceSlug) return `${talSlug} x ${danceSlug}`;
  if (talSlug) return `${talSlug} Tal Focus`;
  if (danceSlug) return `${danceSlug} Dance Mode`;
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
  await writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
  try {
    const raw = await readFile(paths.configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeDotConfigShape(parsed);

    const strict = dotConfigSchema.safeParse(normalized);
    if (strict.success) {
      const parsedStable = JSON.stringify(parsed);
      const normalizedStable = JSON.stringify(strict.data);
      if (parsedStable !== normalizedStable) {
        await persistConfig(paths.projectDir, strict.data);
      }
      return strict.data;
    }

    throw strict.error;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
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
  activate = true
}: {
  projectDir?: string;
  name?: string;
  talSlug?: string;
  danceSlug?: string;
  activate?: boolean;
}) => {
  const normalizedTalSlug = talSlug?.trim() || null;
  const normalizedDanceSlug = danceSlug?.trim() || null;
  if (!normalizedTalSlug && !normalizedDanceSlug) {
    throw new Error("talSlug or danceSlug is required");
  }

  return createComboFromRefs({
    projectDir,
    name,
    talRef: normalizedTalSlug ? { kind: "preset", slug: normalizedTalSlug } : null,
    danceRef: normalizedDanceSlug ? { kind: "preset", slug: normalizedDanceSlug } : null,
    activate
  });
};

export const createComboFromRefs = async ({
  projectDir,
  name,
  talRef,
  danceRef,
  activate = true
}: {
  projectDir?: string;
  name?: string;
  talRef?: DotTalRef | null;
  danceRef?: DotDanceRef | null;
  activate?: boolean;
}) => {
  const normalizedTalRef = talRef ?? null;
  const normalizedDanceRef = danceRef ?? null;
  if (!normalizedTalRef && !normalizedDanceRef) {
    throw new Error("talRef or danceRef is required");
  }

  const resolvedProjectDir = resolveProjectDir(projectDir);
  const config = await readOrInitProjectConfig(resolvedProjectDir);
  const now = nowISO();
  const comboId = randomUUID();

  const talLabel = normalizedTalRef ? (normalizedTalRef.kind === "preset" ? normalizedTalRef.slug : "custom-tal") : null;
  const danceLabel = normalizedDanceRef ? (normalizedDanceRef.kind === "preset" ? normalizedDanceRef.slug : "custom-dance") : null;

  const combo: DotCombo = {
    id: comboId,
    name: resolveDefaultComboName({ name, talSlug: talLabel, danceSlug: danceLabel }),
    talRef: normalizedTalRef,
    danceRef: normalizedDanceRef,
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
