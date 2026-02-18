import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfigPaths } from "./dot-config.js";
import type { WorkflowSession } from "../lib/workflow.js";

const SESSION_SCHEMA_VERSION = "1.0.0";

type ArchivedWorkflowSession = {
  archivedAt: string;
  session: WorkflowSession;
};

type DotSessionState = {
  schemaVersion: string;
  updatedAt: string;
  sessions: WorkflowSession[];
  archived: ArchivedWorkflowSession[];
};

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
  const { sessionsPath } = getSessionPaths(projectDir);
  try {
    const raw = await readFile(sessionsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DotSessionState>;
    return {
      schemaVersion: typeof parsed.schemaVersion === "string" ? parsed.schemaVersion : SESSION_SCHEMA_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowISO(),
      sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as WorkflowSession[]) : [],
      archived: Array.isArray(parsed.archived) ? (parsed.archived as ArchivedWorkflowSession[]) : []
    };
  } catch (error) {
    if (isNotFoundError(error)) return buildDefaultSessionState();
    throw error;
  }
};

const persistSessionState = async (projectDir: string, state: DotSessionState) => {
  const paths = getSessionPaths(projectDir);
  await mkdir(paths.dotDir, { recursive: true });
  await writeFile(
    paths.sessionsPath,
    `${JSON.stringify({ ...state, updatedAt: nowISO(), schemaVersion: SESSION_SCHEMA_VERSION }, null, 2)}\n`,
    "utf8"
  );
  return paths;
};

export const upsertWorkflowSession = async ({ projectDir, session }: { projectDir?: string; session: WorkflowSession }) => {
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

export const getWorkflowSessionById = async ({ projectDir, sessionId }: { projectDir?: string; sessionId: string }) => {
  const state = await readSessionState(projectDir);
  const session = state.sessions.find((item) => item.id === sessionId) ?? null;
  return { state, session };
};

export const listWorkflowSessionsFromFile = async (projectDir?: string) => {
  const state = await readSessionState(projectDir);
  return state.sessions;
};

export const clearWorkflowSessionInFile = async ({
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
    sessions: archive ? remaining : [...remaining, nextSession as WorkflowSession],
    archived: nextArchived
  };

  const paths = await persistSessionState(resolvedProjectDir, nextState);
  return { ...paths, session: nextSession ?? session, archived: archive ?? false };
};
