import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfigPaths } from "./dot-config.js";

type ProjectEnvLoadResult = {
  projectDir: string;
  loadedFiles: string[];
  values: Record<string, string>;
};

const parseEnvLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const equalsIdx = normalized.indexOf("=");
  if (equalsIdx <= 0) return null;

  const key = normalized.slice(0, equalsIdx).trim();
  if (!key) return null;

  const rawValue = normalized.slice(equalsIdx + 1).trim();
  if (!rawValue) return { key, value: "" };

  if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    const quote = rawValue[0];
    const inner = rawValue.slice(1, -1);
    const value =
      quote === '"'
        ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : inner;
    return { key, value };
  }

  const inlineCommentIdx = rawValue.search(/\s+#/);
  const cleanValue = inlineCommentIdx >= 0 ? rawValue.slice(0, inlineCommentIdx).trim() : rawValue;
  return { key, value: cleanValue };
};

const parseEnvContent = (content: string) => {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    result[parsed.key] = parsed.value;
  }
  return result;
};

export const loadProjectDotEnv = async (projectDir: string): Promise<ProjectEnvLoadResult> => {
  const resolvedProjectDir = path.resolve(projectDir);
  const { dotDir } = getConfigPaths(resolvedProjectDir);
  const candidates = [path.join(dotDir, ".env"), path.join(dotDir, ".env.local")];
  const loadedFiles: string[] = [];
  const values: Record<string, string> = {};

  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, "utf8");
      Object.assign(values, parseEnvContent(raw));
      loadedFiles.push(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    }
  }

  return {
    projectDir: resolvedProjectDir,
    loadedFiles,
    values
  };
};

export const readFirstEnv = ({ keys, projectEnv }: { keys: string[]; projectEnv: Record<string, string> }) => {
  for (const key of keys) {
    const runtimeValue = process.env[key];
    if (typeof runtimeValue === "string" && runtimeValue.trim()) return runtimeValue.trim();
    const fileValue = projectEnv[key];
    if (typeof fileValue === "string" && fileValue.trim()) return fileValue.trim();
  }
  return undefined;
};

export const readFirstEnvNumber = ({
  keys,
  projectEnv,
  min,
  max
}: {
  keys: string[];
  projectEnv: Record<string, string>;
  min?: number;
  max?: number;
}) => {
  const value = readFirstEnv({ keys, projectEnv });
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (typeof min === "number" && parsed < min) return undefined;
  if (typeof max === "number" && parsed > max) return undefined;
  return parsed;
};

export const THREADS_ENV_KEYS = {
  accessToken: ["DANCE_OF_TAL_THREADS_ACCESS_TOKEN", "THREADS_ACCESS_TOKEN", "THREADS_TOKEN"],
  userId: ["DANCE_OF_TAL_THREADS_USER_ID", "THREADS_USER_ID"],
  baseUrl: ["DANCE_OF_TAL_THREADS_BASE_URL", "THREADS_BASE_URL"],
  apiVersion: ["DANCE_OF_TAL_THREADS_API_VERSION", "THREADS_API_VERSION"],
  fetchLimit: ["DANCE_OF_TAL_THREADS_FETCH_LIMIT", "THREADS_FETCH_LIMIT"]
} as const;
