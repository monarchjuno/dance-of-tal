import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createCustomCombo } from "../../cli/dot-config.js";
import type { Dance, Tal } from "../../data/types.js";
import { buildCustomDance, buildCustomTal, buildCustomTalDance, resolveUnifiedSources } from "../../lib/customize.js";
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

const unifiedInputFields = {
  input: z.string().optional(),
  inputs: z.array(z.string().min(1)).max(12).optional(),
  sources: z.array(customSourceSchema).max(12).optional()
};

const stylePolicySchema = z.object({
  referenceWindow: z
    .object({
      mode: z.enum(["any", "historical", "recent"]).optional(),
      cutoffYear: z.number().int().min(1900).max(2100).optional()
    })
    .optional(),
  expression: z
    .object({
      structure: z.enum(["paragraph", "hybrid", "list"]).optional(),
      punctuationDiscipline: z.enum(["relaxed", "balanced", "strict"]).optional(),
      templateStrictness: z.enum(["relaxed", "balanced", "strict"]).optional()
    })
    .optional(),
  constraints: z
    .object({
      prefer: z.array(z.string().min(2)).max(12).optional(),
      avoid: z.array(z.string().min(2)).max(12).optional()
    })
    .optional()
});

const stageSchema = z.enum(["generic", "gpts", "mcp", "openclaw", "threads"]);

const stageContextSchema = z.object({
  threadsAccessToken: z.string().min(1).optional(),
  threadsUserId: z.string().min(1).optional(),
  threadsBaseUrl: z.string().url().optional(),
  threadsApiVersion: z.string().optional(),
  threadsFetchLimit: z.number().int().min(1).max(20).optional()
});

const buildAutoInputPreview = ({
  input,
  inputs
}: {
  input?: string;
  inputs?: string[];
}) => {
  const raw = [...(input ? [input] : []), ...(inputs ?? [])].map((item) => item.trim()).filter(Boolean);
  return raw.slice(0, 5);
};

const deriveNameFromInput = ({
  providedName,
  input,
  inputs,
  fallback
}: {
  providedName?: string;
  input?: string;
  inputs?: string[];
  fallback: string;
}) => {
  if (providedName?.trim()) return providedName.trim();

  const raw = [...(input ? [input] : []), ...(inputs ?? [])].map((item) => item.trim()).filter(Boolean);
  const seed = raw[0] ?? fallback;
  const words = seed
    .replace(/^https?:\/\//i, "")
    .split(/[\s/._-]+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return words.length > 0 ? words.replace(/\b\w/g, (char) => char.toUpperCase()) : fallback;
};

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
      "Generate a custom Tal from unified input. Source type is auto-detected (text/file/url).",
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
        ...unifiedInputFields
      },
      async ({ name, category, tags, description, goal, comboName, projectDir, persist, activate, input, inputs, sources }) => {
        try {
          const normalizedSources = await resolveUnifiedSources({ input, inputs, sources });
          const result = await buildCustomTal({ name, category, tags, description, goal, sources: normalizedSources });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${result.tal.name} Custom Combo`,
            tal: result.tal,
            persist,
            activate
          });
          return textResult({
            ...result,
            storage,
            abstraction: {
              inputMode: "unified-auto-detect",
              inputPreview: buildAutoInputPreview({ input, inputs })
            }
          });
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
      "Generate a custom Dance from unified input. Source type is auto-detected (text/file/url).",
      {
        name: z.string().min(2),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        description: z.string().optional(),
        goal: z.string().optional(),
        stylePolicy: stylePolicySchema.optional(),
        stage: stageSchema.optional(),
        examples: z.array(z.string().min(1)).max(8).optional(),
        stageContext: stageContextSchema.optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        activate: z.boolean().optional(),
        ...unifiedInputFields
      },
      async ({
        name,
        category,
        tags,
        description,
        goal,
        stylePolicy,
        stage,
        examples,
        stageContext,
        comboName,
        projectDir,
        persist,
        activate,
        input,
        inputs,
        sources
      }) => {
        try {
          const normalizedSources = await resolveUnifiedSources({ input, inputs, sources });
          const result = await buildCustomDance({
            name,
            category,
            tags,
            description,
            goal,
            stylePolicy,
            stage,
            examples,
            stageContext,
            sources: normalizedSources
          });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${result.dance.name} Custom Combo`,
            dance: result.dance,
            persist,
            activate
          });
          return textResult({
            ...result,
            storage,
            abstraction: {
              inputMode: "unified-auto-detect",
              inputPreview: buildAutoInputPreview({ input, inputs })
            }
          });
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
      "Generate both custom Tal and Dance from unified input. Source type is auto-detected (text/file/url).",
      {
        name: z.string().min(2),
        talCategory: z.string().optional(),
        danceCategory: z.string().optional(),
        tags: z.array(z.string()).optional(),
        goal: z.string().optional(),
        stylePolicy: stylePolicySchema.optional(),
        stage: stageSchema.optional(),
        examples: z.array(z.string().min(1)).max(8).optional(),
        stageContext: stageContextSchema.optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        activate: z.boolean().optional(),
        ...unifiedInputFields
      },
      async ({
        name,
        talCategory,
        danceCategory,
        tags,
        goal,
        stylePolicy,
        stage,
        examples,
        stageContext,
        comboName,
        projectDir,
        persist,
        activate,
        input,
        inputs,
        sources
      }) => {
        try {
          const normalizedSources = await resolveUnifiedSources({ input, inputs, sources });
          const result = await buildCustomTalDance({
            name,
            talCategory,
            danceCategory,
            tags,
            goal,
            stylePolicy,
            stage,
            examples,
            stageContext,
            sources: normalizedSources
          });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${name} Custom Combo`,
            tal: result.tal,
            dance: result.dance,
            persist,
            activate
          });
          return textResult({
            ...result,
            storage,
            abstraction: {
              inputMode: "unified-auto-detect",
              inputPreview: buildAutoInputPreview({ input, inputs })
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return textResult({ error: message });
        }
      }
    );
  });

  registerTool("abstract_tal_dance", () => {
    server.tool(
      "abstract_tal_dance",
      "Abstract Tal and/or Dance from any single input style (person, company, notes, docs, links).",
      {
        mode: z.enum(["tal", "dance", "combo"]).optional(),
        name: z.string().optional(),
        talCategory: z.string().optional(),
        danceCategory: z.string().optional(),
        tags: z.array(z.string()).optional(),
        goal: z.string().optional(),
        stylePolicy: stylePolicySchema.optional(),
        stage: stageSchema.optional(),
        examples: z.array(z.string().min(1)).max(8).optional(),
        stageContext: stageContextSchema.optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        activate: z.boolean().optional(),
        ...unifiedInputFields
      },
      async ({
        mode,
        name,
        talCategory,
        danceCategory,
        tags,
        goal,
        stylePolicy,
        stage,
        examples,
        stageContext,
        comboName,
        projectDir,
        persist,
        activate,
        input,
        inputs,
        sources
      }) => {
        try {
          const effectiveMode = mode ?? "combo";
          const normalizedSources = await resolveUnifiedSources({ input, inputs, sources });
          const resolvedName = deriveNameFromInput({ providedName: name, input, inputs, fallback: "Custom Abstraction" });

          if (effectiveMode === "tal") {
            const talResult = await buildCustomTal({
              name: resolvedName,
              category: talCategory,
              tags,
              goal,
              sources: normalizedSources
            });
            const storage = await persistCustomCombo({
              projectDir,
              comboName: comboName?.trim() || `${talResult.tal.name} Abstraction`,
              tal: talResult.tal,
              persist,
              activate
            });
            return textResult({
              mode: "tal-only",
              tal: talResult.tal,
              thinkingPrompt: talResult.thinkingPrompt,
              sourceDigest: talResult.sourceDigest,
              extraction: talResult.extraction,
              storage,
              abstraction: {
                inputMode: "unified-auto-detect",
                inputPreview: buildAutoInputPreview({ input, inputs })
              }
            });
          }

          if (effectiveMode === "dance") {
            const danceResult = await buildCustomDance({
              name: resolvedName,
              category: danceCategory,
              tags,
              goal,
              stylePolicy,
              stage,
              examples,
              stageContext,
              sources: normalizedSources
            });
            const storage = await persistCustomCombo({
              projectDir,
              comboName: comboName?.trim() || `${danceResult.dance.name} Abstraction`,
              dance: danceResult.dance,
              persist,
              activate
            });
            return textResult({
              mode: "dance-only",
              dance: danceResult.dance,
              outputPrompt: danceResult.outputPrompt,
              sourceDigest: danceResult.sourceDigest,
              extraction: danceResult.extraction,
              storage,
              abstraction: {
                inputMode: "unified-auto-detect",
                inputPreview: buildAutoInputPreview({ input, inputs })
              }
            });
          }

          const comboResult = await buildCustomTalDance({
            name: resolvedName,
            talCategory,
            danceCategory,
            tags,
            goal,
            stylePolicy,
            stage,
            examples,
            stageContext,
            sources: normalizedSources
          });
          const storage = await persistCustomCombo({
            projectDir,
            comboName: comboName?.trim() || `${resolvedName} Abstraction`,
            tal: comboResult.tal,
            dance: comboResult.dance,
            persist,
            activate
          });
          return textResult({
            mode: "combo",
            ...comboResult,
            storage,
            abstraction: {
              inputMode: "unified-auto-detect",
              inputPreview: buildAutoInputPreview({ input, inputs })
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return textResult({ error: message });
        }
      }
    );
  });
};
