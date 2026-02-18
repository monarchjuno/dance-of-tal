import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Dance, Tal } from "../data/types.js";

const DEFAULT_SCHEMA_VERSION = "2.1.0";

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

const migrateLegacyConfig = (raw: unknown): DotConfig | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const talSlug = typeof (obj.activePair as Record<string, unknown> | undefined)?.talSlug === "string"
    ? ((obj.activePair as Record<string, unknown>).talSlug as string)
    : null;
  const danceSlug = typeof (obj.activePair as Record<string, unknown> | undefined)?.danceSlug === "string"
    ? ((obj.activePair as Record<string, unknown>).danceSlug as string)
    : null;

  const base = buildDefaultConfig();
  if (!talSlug && !danceSlug) return base;

  const comboId = randomUUID();
  const createdAt = nowISO();
  return {
    ...base,
    updatedAt: createdAt,
    activeComboId: comboId,
    combos: [
      {
        id: comboId,
        name: resolveDefaultComboName({ name: "Migrated Combo", talSlug, danceSlug }),
        talRef: talSlug ? { kind: "preset", slug: talSlug } : null,
        danceRef: danceSlug ? { kind: "preset", slug: danceSlug } : null,
        createdAt,
        updatedAt: createdAt
      }
    ],
    history: [{ comboId, setAt: createdAt }]
  };
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
    const parsed = JSON.parse(raw);

    const strict = dotConfigSchema.safeParse(parsed);
    if (strict.success) {
      return strict.data;
    }

    const migrated = migrateLegacyConfig(parsed);
    if (migrated) {
      return migrated;
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
