import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as lockfile from "proper-lockfile";
import { z } from "zod";
import { getConfigPaths } from "./dot-config.js";
import type { ActSession } from "../lib/act.js";

const SESSION_SCHEMA_VERSION = "1.0.0";

const actSessionSchema = z.custom<ActSession>();

const archivedActSessionSchema = z.object({
  archivedAt: z.string().min(1),
  session: actSessionSchema
});

const dotSessionStateSchema = z.object({
  schemaVersion: z.string().min(1),
  updatedAt: z.string().min(1),
  sessions: z.array(actSessionSchema),
  archived: z.array(archivedActSessionSchema)
});

type ArchivedActSession = z.infer<typeof archivedActSessionSchema>;
type DotSessionState = z.infer<typeof dotSessionStateSchema>;

const nowISO = () => new Date().toISOString();

const isNotFoundError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  return (error as NodeJS.ErrnoException).code === "ENOENT";
};

const buildDefaultSessionState = (): DotSessionState => ({
  schemaVersion: SESSION_SCHEMA_VERSION,
  updatedAt: nowISO(),
  sessions: [],
  archived: []
});

export const getSessionPaths = (projectDir?: string) => {
  const { projectDir: resolvedProjectDir, dotDir } = getConfigPaths(projectDir);
  const sessionsPath = path.join(dotDir, "sessions.json");
  return { projectDir: resolvedProjectDir, dotDir, sessionsPath };
};

const readSessionState = async (projectDir?: string): Promise<DotSessionState> => {
  const { dotDir, sessionsPath } = getSessionPaths(projectDir);
  let release = () => Promise.resolve();

  try {
    await mkdir(dotDir, { recursive: true });
    release = await lockfile.lock(dotDir, {
      retries: { retries: 3, minTimeout: 50, maxTimeout: 500 }
    });

    const raw = await readFile(sessionsPath, "utf8");
    const parsed = JSON.parse(raw);

    const normalized = {
      schemaVersion: typeof parsed.schemaVersion === "string" ? parsed.schemaVersion : SESSION_SCHEMA_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowISO(),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      archived: Array.isArray(parsed.archived) ? parsed.archived : []
    };

    const strict = dotSessionStateSchema.safeParse(normalized);
    if (strict.success) {
      const parsedStable = JSON.stringify(parsed);
      const normalizedStable = JSON.stringify(strict.data);
      if (parsedStable !== normalizedStable) {
        await writeFile(sessionsPath, `${JSON.stringify(strict.data, null, 2)}\n`, "utf8");
      }
      return strict.data;
    }

    throw strict.error;
  } catch (error) {
    if (isNotFoundError(error)) return buildDefaultSessionState();
    throw error;
  } finally {
    await release().catch(() => { });
  }
};

const persistSessionState = async (projectDir: string, state: DotSessionState) => {
  const { dotDir, sessionsPath } = getSessionPaths(projectDir);
  await mkdir(dotDir, { recursive: true });

  let release = () => Promise.resolve();
  try {
    release = await lockfile.lock(dotDir, {
      retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 }
    });
    const finalState = { ...state, updatedAt: nowISO(), schemaVersion: SESSION_SCHEMA_VERSION };
    await writeFile(sessionsPath, `${JSON.stringify(finalState, null, 2)}\n`, "utf8");
  } finally {
    await release().catch(() => { });
  }
  return { projectDir, dotDir, sessionsPath };
};

export const upsertActSession = async ({ projectDir, session }: { projectDir?: string; session: ActSession }) => {
  const resolvedProjectDir = getSessionPaths(projectDir).projectDir;
  const state = await readSessionState(resolvedProjectDir);
  const nextSessions = [...state.sessions.filter((item) => item.id !== session.id), session];
  const nextState: DotSessionState = {
    ...state,
    sessions: nextSessions
  };
  const paths = await persistSessionState(resolvedProjectDir, nextState);
  return { ...paths, session };
};

export const getActSessionById = async ({ projectDir, sessionId }: { projectDir?: string; sessionId: string }) => {
  const state = await readSessionState(projectDir);
  const session = state.sessions.find((item) => item.id === sessionId) ?? null;
  return { state, session };
};

export const listActSessionsFromFile = async (projectDir?: string) => {
  const state = await readSessionState(projectDir);
  return state.sessions;
};

export const clearActSessionInFile = async ({
  projectDir,
  sessionId,
  archive
}: {
  projectDir?: string;
  sessionId: string;
  archive?: boolean;
}) => {
  const resolvedProjectDir = getSessionPaths(projectDir).projectDir;
  const state = await readSessionState(resolvedProjectDir);
  const session = state.sessions.find((item) => item.id === sessionId) ?? null;
  if (!session) return { session: null, projectDir: resolvedProjectDir };

  const remaining = state.sessions.filter((item) => item.id !== sessionId);
  const nextArchived = archive ? [...state.archived, { archivedAt: nowISO(), session }] : state.archived;
  const nextSession = archive
    ? null
    : {
      ...session,
      activeCombo: null,
      updatedAt: nowISO()
    };

  const nextState: DotSessionState = {
    ...state,
    sessions: archive ? remaining : [...remaining, nextSession as ActSession],
    archived: nextArchived
  };

  const paths = await persistSessionState(resolvedProjectDir, nextState);
  return { ...paths, session: nextSession ?? session, archived: archive ?? false };
};
