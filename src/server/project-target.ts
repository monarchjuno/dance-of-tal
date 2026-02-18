import { stat } from "node:fs/promises";
import path from "node:path";
import { getConfigPaths } from "../cli/dot-config.js";

export type ProjectTargetResolution =
  | {
      ok: true;
      projectDir: string;
      configPath: string;
      source: string;
      confidence: "high" | "medium";
    }
  | {
      ok: false;
      error: string;
      checked: string[];
    };

export const sanitizePath = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
};

const unique = (items: (string | null)[]) => Array.from(new Set(items.filter((item): item is string => Boolean(item))));

const isDirectory = async (candidate: string) => {
  try {
    const info = await stat(candidate);
    return info.isDirectory();
  } catch {
    return false;
  }
};

const hasDotConfig = async (projectDir: string) => {
  const { configPath } = getConfigPaths(projectDir);
  try {
    const info = await stat(configPath);
    return info.isFile();
  } catch {
    return false;
  }
};

const WORKSPACE_ENV_KEYS = [
  "DANCE_OF_TAL_PROJECT_DIR",
  "WORKSPACE_ROOT",
  "WORKSPACE_FOLDER",
  "VSCODE_WORKSPACE_FOLDER",
  "CURSOR_WORKSPACE_PATH",
  "WINDSURF_WORKSPACE_PATH",
  "CLAUDE_PROJECT_DIR",
  "OPENCLAW_PROJECT_DIR"
] as const;

const FALLBACK_ENV_KEYS = ["PWD", "INIT_CWD"] as const;

export const resolveProjectCandidates = async ({
  projectDir,
  sessionProjectDir
}: {
  projectDir?: string;
  sessionProjectDir?: string;
}) => {
  const directCandidates = unique([
    sanitizePath(projectDir),
    sanitizePath(sessionProjectDir),
    ...WORKSPACE_ENV_KEYS.map((key) => sanitizePath(process.env[key]))
  ]);

  const validatedDirect: string[] = [];
  for (const candidate of directCandidates) {
    if (await isDirectory(candidate)) {
      validatedDirect.push(candidate);
    }
  }

  const heuristicCandidates = unique([
    ...FALLBACK_ENV_KEYS.map((key) => sanitizePath(process.env[key])),
    sanitizePath(process.cwd())
  ]);

  const validatedHeuristic: string[] = [];
  for (const candidate of heuristicCandidates) {
    if (await isDirectory(candidate)) {
      validatedHeuristic.push(candidate);
    }
  }

  return unique([...validatedDirect, ...validatedHeuristic]);
};

export const resolveProjectTarget = async ({
  projectDir,
  sessionProjectDir
}: {
  projectDir?: string;
  sessionProjectDir?: string;
}): Promise<ProjectTargetResolution> => {
  const candidates = await resolveProjectCandidates({ projectDir, sessionProjectDir });
  const directCandidates = unique([
    sanitizePath(projectDir),
    sanitizePath(sessionProjectDir),
    ...WORKSPACE_ENV_KEYS.map((key) => sanitizePath(process.env[key]))
  ]);

  for (const candidate of directCandidates) {
    if (!candidate) continue;
    if (candidates.includes(candidate)) {
      const { configPath } = getConfigPaths(candidate);
      return { ok: true, projectDir: candidate, configPath, source: "direct", confidence: "high" };
    }
  }

  const configured: string[] = [];
  for (const candidate of candidates) {
    if (await hasDotConfig(candidate)) {
      configured.push(candidate);
    }
  }

  if (configured.length === 1) {
    const { configPath } = getConfigPaths(configured[0]);
    return { ok: true, projectDir: configured[0], configPath, source: "heuristic-existing-config", confidence: "medium" };
  }

  if (configured.length > 1) {
    return {
      ok: false,
      error: "Multiple project configs were found. Pass projectDir explicitly.",
      checked: configured
    };
  }

  return {
    ok: false,
    error: "Project directory could not be resolved for .dance-of-tal persistence. Pass projectDir or set DANCE_OF_TAL_PROJECT_DIR / WORKSPACE_ROOT.",
    checked: candidates
  };
};
