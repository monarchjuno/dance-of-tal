import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createCustomCombo } from "../../cli/dot-config.js";
import type { Dance, Tal } from "../../data/types.js";
import { buildCustomDance, buildCustomTal, buildCustomTalDance } from "../../lib/customize.js";
import { resolveProjectTarget, sanitizePath } from "../project-target.js";
import { SOURCE_TYPES } from "../setup-mode.js";
import type { ToolName } from "../toolset.js";

type RegisterTool = (name: ToolName, register: () => void) => void;
type TextResult = (payload: unknown) => { content: { type: "text"; text: string }[] };

const customSourceSchema = z.object({
  type: z.enum(SOURCE_TYPES),
  value: z.string().min(1),
  label: z.string().optional()
});

const persistCustomCombo = async ({
  projectDir,
  comboName,
  tal,
  dance,
  persist,
  activate
}: {
  projectDir?: string;
  comboName: string;
  tal?: Tal;
  dance?: Dance;
  persist?: boolean;
  activate?: boolean;
}) => {
  const shouldPersist = persist ?? true;
  if (!shouldPersist) return { persisted: false, skipped: true };

  const target = await resolveProjectTarget({ projectDir: sanitizePath(projectDir) ?? undefined });
  if (!target.ok) {
    return { persisted: false, error: target.error };
  }

  const stored = await createCustomCombo({
    projectDir: target.projectDir,
    name: comboName,
    tal,
    dance,
    activate: activate ?? true
  });

  return {
    persisted: true,
    projectDir: stored.projectDir,
    configPath: stored.configPath,
    activeComboId: stored.config.activeComboId
  };
};

export const registerCustomTools = ({
  server,
  registerTool,
  textResult
}: {
  server: McpServer;
  registerTool: RegisterTool;
  textResult: TextResult;
}) => {
  registerTool("build_custom_tal", () => {
    server.tool(
      "build_custom_tal",
      "Generate a custom Tal from text, file paths, and URLs",
      {
        name: z.string().min(2),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        description: z.string().optional(),
        goal: z.string().optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        activate: z.boolean().optional(),
        sources: z.array(customSourceSchema).min(1).max(8)
      },
      async ({ name, category, tags, description, goal, comboName, projectDir, persist, activate, sources }) => {
        try {
          const result = await buildCustomTal({ name, category, tags, description, goal, sources });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${result.tal.name} Custom Combo`,
            tal: result.tal,
            persist,
            activate
          });
          return textResult({ ...result, storage });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return textResult({ error: message });
        }
      }
    );
  });

  registerTool("build_custom_dance", () => {
    server.tool(
      "build_custom_dance",
      "Generate a custom Dance from text, file paths, and URLs",
      {
        name: z.string().min(2),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        description: z.string().optional(),
        goal: z.string().optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        activate: z.boolean().optional(),
        sources: z.array(customSourceSchema).min(1).max(8)
      },
      async ({ name, category, tags, description, goal, comboName, projectDir, persist, activate, sources }) => {
        try {
          const result = await buildCustomDance({ name, category, tags, description, goal, sources });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${result.dance.name} Custom Combo`,
            dance: result.dance,
            persist,
            activate
          });
          return textResult({ ...result, storage });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return textResult({ error: message });
        }
      }
    );
  });

  registerTool("build_custom_tal_dance", () => {
    server.tool(
      "build_custom_tal_dance",
      "Generate both custom Tal and Dance from text, file paths, and URLs",
      {
        name: z.string().min(2),
        talCategory: z.string().optional(),
        danceCategory: z.string().optional(),
        tags: z.array(z.string()).optional(),
        goal: z.string().optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        activate: z.boolean().optional(),
        sources: z.array(customSourceSchema).min(1).max(8)
      },
      async ({ name, talCategory, danceCategory, tags, goal, comboName, projectDir, persist, activate, sources }) => {
        try {
          const result = await buildCustomTalDance({ name, talCategory, danceCategory, tags, goal, sources });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${name} Custom Combo`,
            tal: result.tal,
            dance: result.dance,
            persist,
            activate
          });
          return textResult({ ...result, storage });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return textResult({ error: message });
        }
      }
    );
  });
};
