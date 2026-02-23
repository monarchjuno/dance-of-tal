import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createPresetCombo, readProjectConfig } from "../../cli/dot-config.js";
import { clearActSessionInFile, getActSessionById, listActSessionsFromFile, upsertActSession } from "../../cli/dot-session-config.js";
import type { DotConfig, DotDanceRef, DotTalRef } from "../../cli/dot-config.js";
import type { Dance, Tal } from "../../data/types.js";
import { buildOutputPrompt, buildThinkingPrompt, findAct, findDance, findTal } from "../../lib/persona.js";
import {
  clearSession,
  getSession,
  getActOverview,
  initializeStylingSession,
  nextComboRecommendation,
  runActiveCombo,
  setActiveCombo,
  upsertSession,
  removeSession
} from "../../lib/act.js";
import type { ActSession } from "../../lib/act.js";
import { resolveProjectCandidates, resolveProjectTarget, sanitizePath } from "../project-target.js";
import { SYSTEM_INSTRUCTION_HEADER, summarizeRecommendation } from "../response-utils.js";
import { SOURCE_TYPES, buildSetupModeAdvice } from "../setup-mode.js";
import type { ToolName } from "../toolset.js";

type RegisterTool = (name: ToolName, register: () => void) => void;
type TextResult = (payload: unknown) => { content: { type: "text"; text: string }[] };

const resolveTalFromRef = (config: DotConfig, talRef: DotTalRef | null): Tal | null => {
  if (!talRef) return null;
  if (talRef.kind === "preset") return findTal(talRef.slug) ?? null;
  return config.customTals.find((item) => item.id === talRef.id)?.tal ?? null;
};

const resolveDanceFromRef = (config: DotConfig, danceRef: DotDanceRef | null): Dance | null => {
  if (!danceRef) return null;
  if (danceRef.kind === "preset") return findDance(danceRef.slug) ?? null;
  return config.customDances.find((item) => item.id === danceRef.id)?.dance ?? null;
};

const resolveSessionById = async ({ sessionId, projectDir }: { sessionId: string; projectDir?: string }) => {
  const inMemory = getSession(sessionId);
  if (inMemory) return { session: inMemory, source: "memory" as const };

  const candidates = await resolveProjectCandidates({ projectDir });
  for (const candidate of candidates) {
    const { session } = await getActSessionById({ projectDir: candidate, sessionId });
    if (session) {
      upsertSession(session);
      return { session, source: "file" as const, projectDir: candidate };
    }
  }

  return null;
};

const persistSession = async ({ projectDir, session }: { projectDir?: string; session: ActSession | null }) => {
  if (!session) return { persisted: false, error: "No session to persist." };
  const target = await resolveProjectTarget({
    projectDir,
    sessionProjectDir: session.projectDir
  });
  if (!target.ok) {
    return { persisted: false, error: target.error, checked: target.checked };
  }

  const normalized = {
    ...session,
    projectDir: target.projectDir
  };
  upsertSession(normalized);
  await upsertActSession({ projectDir: target.projectDir, session: normalized });
  return {
    persisted: true,
    projectDir: target.projectDir,
    configPath: target.configPath
  };
};

export const registerActTools = ({
  server,
  registerTool,
  textResult
}: {
  server: McpServer;
  registerTool: RegisterTool;
  textResult: TextResult;
}) => {
  registerTool("act_overview", () => {
    server.tool("act_overview", "Show act for Tal x Dance", {}, async () => textResult(getActOverview()));
  });

  registerTool("advise_setup_mode", () => {
    server.tool(
      "advise_setup_mode",
      "Decide whether to start with preset, custom, or hybrid Tal/Dance setup and return clarifying questions",
      {
        goal: z.string().min(3),
        mode: z.enum(["auto", "preset", "custom", "hybrid"]).optional(),
        hasUserSources: z.boolean().optional(),
        sourceTypes: z.array(z.enum(SOURCE_TYPES)).optional(),
        userNote: z.string().optional()
      },
      async ({ goal, mode, hasUserSources, sourceTypes, userNote }) =>
        textResult({
          goal,
          advice: buildSetupModeAdvice({
            goal,
            mode: mode ?? "auto",
            hasUserSources: hasUserSources ?? false,
            sourceTypes: sourceTypes ?? [],
            userNote
          })
        })
    );
  });

  registerTool("initialize_styling_session", () => {
    server.tool(
      "initialize_styling_session",
      "Start a Tal x Dance act session by goal",
      {
        goal: z.string().min(3),
        language: z.string().optional(),
        mode: z.enum(["auto", "preset", "custom", "hybrid"]).optional(),
        hasUserSources: z.boolean().optional(),
        sourceTypes: z.array(z.enum(SOURCE_TYPES)).optional(),
        userNote: z.string().optional(),
        projectDir: z.string().optional(),
        talCategory: z.string().optional(),
        danceCategory: z.string().optional(),
        tag: z.string().optional(),
        limitTal: z.number().int().positive().max(20).optional(),
        limitDance: z.number().int().positive().max(20).optional(),
        limitCombos: z.number().int().positive().max(20).optional(),
        verbose: z.boolean().optional()
      },
      async ({ goal, language, mode, hasUserSources, sourceTypes, userNote, projectDir, talCategory, danceCategory, tag, limitTal, limitDance, limitCombos, verbose }) => {
        const target = await resolveProjectTarget({ projectDir });
        const effectiveProjectDir = target.ok ? target.projectDir : sanitizePath(projectDir) ?? undefined;
        const advice = buildSetupModeAdvice({
          goal,
          mode: mode ?? "auto",
          hasUserSources: hasUserSources ?? false,
          sourceTypes: sourceTypes ?? [],
          userNote
        });

        const result = initializeStylingSession({
          goal,
          language,
          projectDir: effectiveProjectDir,
          talCategory,
          danceCategory,
          tag,
          limitTal,
          limitDance,
          limitCombos
        });

        const sessionPersistence = await persistSession({ projectDir: effectiveProjectDir, session: result.session });

        if (verbose) {
          return textResult({
            ...result,
            projectTarget: target,
            setupAdvice: advice,
            sessionPersistence
          });
        }

        return textResult({
          status: "initialized",
          goal: result.session.goal,
          setupAdvice: advice,
          recommendation: summarizeRecommendation(result.session.recommendation),
          sessionPersistence: sessionPersistence.persisted ? { persisted: true } : { persisted: false, error: sessionPersistence.error },
          nextAction: advice.suggestedMode === "preset" ? "Choose one combo and call set_active_combo with talSlug and danceSlug." : advice.nextAction
        });
      }
    );
  });

  registerTool("next_combo", () => {
    server.tool(
      "next_combo",
      "Get next best Tal x Dance combo candidates for an existing session",
      {
        sessionId: z.string().min(1).optional(),
        need: z.string().optional(),
        mode: z.enum(["auto", "preset", "custom", "hybrid"]).optional(),
        hasUserSources: z.boolean().optional(),
        sourceTypes: z.array(z.enum(SOURCE_TYPES)).optional(),
        userNote: z.string().optional(),
        projectDir: z.string().optional(),
        talCategory: z.string().optional(),
        danceCategory: z.string().optional(),
        tag: z.string().optional(),
        limitTal: z.number().int().positive().max(20).optional(),
        limitDance: z.number().int().positive().max(20).optional(),
        limitCombos: z.number().int().positive().max(20).optional(),
        verbose: z.boolean().optional()
      },
      async ({ sessionId, need, mode, hasUserSources, sourceTypes, userNote, projectDir, talCategory, danceCategory, tag, limitTal, limitDance, limitCombos, verbose }) => {
        const normalizedSessionId = sessionId?.trim();
        const normalizedNeed = need?.trim();
        const advice = buildSetupModeAdvice({
          goal: normalizedNeed ?? "refine current setup",
          mode: mode ?? "auto",
          hasUserSources: hasUserSources ?? false,
          sourceTypes: sourceTypes ?? [],
          userNote
        });

        if (normalizedSessionId) {
          const existing = await resolveSessionById({ sessionId: normalizedSessionId, projectDir });
          if (!existing) return textResult({ error: `Session not found: ${normalizedSessionId}` });

          const result = nextComboRecommendation({
            sessionId: normalizedSessionId,
            need: normalizedNeed,
            talCategory,
            danceCategory,
            tag,
            limitTal,
            limitDance,
            limitCombos
          });
          if (!result) return textResult({ error: `Session not found: ${normalizedSessionId}` });

          const sessionPersistence = await persistSession({ projectDir: projectDir ?? existing.projectDir, session: result.session });

          if (verbose) {
            return textResult({
              ...result,
              setupAdvice: advice,
              sessionPersistence
            });
          }
          return textResult({
            status: "recommended",
            goal: result.session.goal,
            setupAdvice: advice,
            recommendation: summarizeRecommendation(result.session.recommendation),
            sessionPersistence: sessionPersistence.persisted ? { persisted: true } : { persisted: false, error: sessionPersistence.error },
            nextAction: advice.suggestedMode === "preset" ? "Choose one combo and call set_active_combo." : advice.nextAction
          });
        }

        if (!normalizedNeed) {
          return textResult({
            error: "need is required when sessionId is not provided",
            hint: "Call next_combo with need, or pass a valid sessionId."
          });
        }

        const target = await resolveProjectTarget({ projectDir });
        const effectiveProjectDir = target.ok ? target.projectDir : sanitizePath(projectDir) ?? undefined;
        const seeded = initializeStylingSession({
          goal: normalizedNeed,
          language: "English",
          projectDir: effectiveProjectDir,
          talCategory,
          danceCategory,
          tag,
          limitTal,
          limitDance,
          limitCombos
        });
        const sessionPersistence = await persistSession({ projectDir: effectiveProjectDir, session: seeded.session });

        if (verbose) {
          return textResult({
            ...seeded,
            projectTarget: target,
            setupAdvice: advice,
            sessionPersistence
          });
        }

        return textResult({
          status: "recommended",
          goal: seeded.session.goal,
          setupAdvice: advice,
          recommendation: summarizeRecommendation(seeded.session.recommendation),
          sessionPersistence: sessionPersistence.persisted ? { persisted: true } : { persisted: false, error: sessionPersistence.error },
          nextAction: advice.suggestedMode === "preset" ? "Choose one combo and call set_active_combo." : advice.nextAction
        });
      }
    );
  });

  registerTool("set_active_combo", () => {
    server.tool(
      "set_active_combo",
      "Lock active combo in session (any combination of Tal, Dance, Act, Stage)",
      {
        sessionId: z.string().min(1).optional(),
        talSlug: z.string().min(1).optional(),
        danceSlug: z.string().min(1).optional(),
        actSlug: z.string().min(1).optional(),
        stage: z.string().min(1).optional(),
        comboName: z.string().optional(),
        projectDir: z.string().optional(),
        persist: z.boolean().optional(),
        verbose: z.boolean().optional()
      },
      async ({ sessionId, talSlug, danceSlug, actSlug, stage, comboName, projectDir, persist, verbose }) => {
        if (!talSlug && !danceSlug && !actSlug && !stage) return textResult({ error: "At least one of talSlug, danceSlug, actSlug, or stage is required" });
        if (talSlug && !findTal(talSlug)) return textResult({ error: `Tal not found: ${talSlug}` });
        if (danceSlug && !findDance(danceSlug)) return textResult({ error: `Dance not found: ${danceSlug}` });
        if (actSlug && !findAct(actSlug)) return textResult({ error: `Act not found: ${actSlug}` });

        let resolvedSessionId = sessionId?.trim();
        let autoSessionCreated = false;
        let sessionProjectDir = sanitizePath(projectDir) ?? undefined;

        if (resolvedSessionId) {
          const existing = await resolveSessionById({ sessionId: resolvedSessionId, projectDir });
          if (existing?.session?.projectDir) sessionProjectDir = existing.session.projectDir;
        }

        if (!resolvedSessionId) {
          const target = await resolveProjectTarget({ projectDir });
          const effectiveProjectDir = target.ok ? target.projectDir : sanitizePath(projectDir) ?? undefined;
          const created = initializeStylingSession({
            goal: "Direct active combo set",
            language: "English",
            projectDir: effectiveProjectDir
          });
          resolvedSessionId = created.session.id;
          sessionProjectDir = created.session.projectDir;
          autoSessionCreated = true;
        }

        let result = setActiveCombo({ sessionId: resolvedSessionId, talSlug, danceSlug, actSlug, stage, comboName });
        if (!result) {
          const target = await resolveProjectTarget({ projectDir, sessionProjectDir });
          const recovered = initializeStylingSession({
            goal: "Recovered active combo set",
            language: "English",
            projectDir: target.ok ? target.projectDir : sanitizePath(projectDir) ?? undefined
          });
          resolvedSessionId = recovered.session.id;
          sessionProjectDir = recovered.session.projectDir;
          autoSessionCreated = true;
          result = setActiveCombo({ sessionId: resolvedSessionId, talSlug, danceSlug, actSlug, stage, comboName });
        }
        if (!result) return textResult({ error: "Failed to set active combo" });

        const sessionPersistence = await persistSession({ projectDir: sessionProjectDir ?? projectDir, session: result.session });

        const shouldPersistCombo = persist ?? true;
        let comboPersistence: unknown = null;
        if (shouldPersistCombo) {
          const target = await resolveProjectTarget({ projectDir, sessionProjectDir: result.session.projectDir });
          if (!target.ok) {
            comboPersistence = { persisted: false, error: target.error };
          } else {
            try {
              const stored = await createPresetCombo({
                projectDir: target.projectDir,
                talSlug: result.activeCombo.tal?.slug ?? undefined,
                danceSlug: result.activeCombo.dance?.slug ?? undefined,
                actSlug: result.activeCombo.actSlug ?? undefined,
                stage: result.activeCombo.stage ?? undefined,
                name: result.activeCombo.comboName,
                activate: true
              });
              comboPersistence = { persisted: true, activeComboId: stored.config.activeComboId };
            } catch (error) {
              comboPersistence = { persisted: false, error: error instanceof Error ? error.message : String(error) };
            }
          }
        }

        if (verbose) {
          return textResult({
            ...result,
            context: { autoSessionCreated, sessionId: resolvedSessionId },
            sessionPersistence,
            comboPersistence
          });
        }

        const comboPersisted = comboPersistence && typeof comboPersistence === "object" && "persisted" in comboPersistence ? (comboPersistence as { persisted: boolean }).persisted : true;
        return textResult({
          status: comboPersisted ? "active_combo_set" : "active_combo_set_not_persisted",
          activeCombo: {
            comboName: result.activeCombo.comboName,
            tal: result.activeCombo.tal,
            dance: result.activeCombo.dance,
            actSlug: result.activeCombo.actSlug,
            stage: result.activeCombo.stage
          },
          sessionPersistence: sessionPersistence.persisted ? { persisted: true } : { persisted: false, error: sessionPersistence.error },
          comboPersistence,
          warning: comboPersisted ? null : "Active combo is set but not persisted to config. Set projectDir or DANCE_OF_TAL_PROJECT_DIR."
        });
      }
    );
  });

  registerTool("get_session", () => {
    server.tool(
      "get_session",
      "Get act session snapshot",
      { sessionId: z.string().min(1), projectDir: z.string().optional() },
      async ({ sessionId, projectDir }) => {
        const resolved = await resolveSessionById({ sessionId, projectDir });
        if (!resolved) return textResult({ error: `Session not found: ${sessionId}` });
        return textResult(resolved.session);
      }
    );
  });

  registerTool("list_sessions", () => {
    server.tool("list_sessions", "List active act sessions", { projectDir: z.string().optional() }, async ({ projectDir }) => {
      const target = await resolveProjectTarget({ projectDir });
      if (!target.ok) {
        return textResult({ items: [], warning: target.error });
      }
      const sessions = await listActSessionsFromFile(target.projectDir);
      return textResult({
        items: sessions.map((session) => ({
          id: session.id,
          goal: session.goal,
          language: session.language,
          updatedAt: session.updatedAt,
          activeCombo: session.activeCombo
        }))
      });
    });
  });

  registerTool("run_active_combo", () => {
    server.tool(
      "run_active_combo",
      "Build task-ready package from active Tal x Dance combo",
      { sessionId: z.string().min(1).optional(), projectDir: z.string().optional(), task: z.string().min(1), verbose: z.boolean().optional() },
      async ({ sessionId, projectDir, task, verbose }) => {
        const normalizedSessionId = sessionId?.trim();

        if (normalizedSessionId) {
          const existing = await resolveSessionById({ sessionId: normalizedSessionId, projectDir });
          if (existing) {
            const sessionResult = runActiveCombo({ sessionId: normalizedSessionId, task });
            if (sessionResult) {
              if (verbose) return textResult({ ...sessionResult, source: existing.source });
              return textResult({
                source: existing.source,
                comboName: sessionResult.comboName,
                talSlug: sessionResult.talSlug,
                danceSlug: sessionResult.danceSlug,
                actSlug: sessionResult.actSlug,
                stage: sessionResult.stage,
                package: sessionResult.package
              });
            }
          }
        }

        const target = await resolveProjectTarget({ projectDir });
        if (!target.ok) {
          return textResult({
            error: "No active local config found for run_active_combo.",
            details: target.error,
            checked: target.checked,
            hint: "Pass projectDir explicitly or set DANCE_OF_TAL_PROJECT_DIR / WORKSPACE_ROOT, then call set_active_combo."
          });
        }

        const config = await readProjectConfig(target.projectDir);
        if (!config || !config.activeComboId) {
          return textResult({
            error: "No active combo in local config.",
            projectDir: target.projectDir,
            configPath: target.configPath,
            hint: "Call set_active_combo first."
          });
        }

        const combo = config.combos.find((item) => item.id === config.activeComboId) ?? null;
        if (!combo) {
          return textResult({
            error: "Active combo reference is invalid in local config.",
            projectDir: target.projectDir,
            configPath: target.configPath
          });
        }

        const tal = resolveTalFromRef(config, combo.talRef);
        const dance = resolveDanceFromRef(config, combo.danceRef);

        // We do not have resolveActFromRef explicitly yet, but if it's preset we can just find it
        const act = combo.actRef?.kind === "preset" ? findAct(combo.actRef.slug) ?? null : null;

        if (!tal && !dance && !act) {
          return textResult({
            error: "Active combo has no valid Tal/Dance/Act references.",
            comboId: combo.id,
            projectDir: target.projectDir
          });
        }

        const thinkingPrompt = tal ? buildThinkingPrompt(tal) : null;
        const outputPrompt = dance ? buildOutputPrompt(dance) : null;
        const actPrompt = act ? buildActPrompt(act) : null;
        const combinedPrompt = [SYSTEM_INSTRUCTION_HEADER, thinkingPrompt, actPrompt, outputPrompt].filter(Boolean).join("\n\n");
        const payload = {
          source: "local-config",
          comboName: combo.name,
          talSlug: tal?.slug ?? null,
          danceSlug: dance?.slug ?? null,
          actSlug: act?.slug ?? null,
          stage: combo.stage ?? null,
          package: ["SYSTEM:", combinedPrompt, "", "USER:", task].join("\n")
        };
        return textResult(verbose ? { ...payload, projectDir: target.projectDir, configPath: target.configPath } : payload);
      }
    );
  });

  registerTool("clear_session", () => {
    server.tool(
      "clear_session",
      "Clear active combo or archive session",
      { sessionId: z.string().min(1), projectDir: z.string().optional(), archive: z.boolean().optional() },
      async ({ sessionId, projectDir, archive }) => {
        const existing = await resolveSessionById({ sessionId, projectDir });
        if (!existing) return textResult({ error: `Session not found: ${sessionId}` });

        const result = clearSession({ sessionId, archive: archive ?? false });
        const fileResult = await clearActSessionInFile({
          projectDir: projectDir ?? existing.projectDir ?? existing.session.projectDir,
          sessionId,
          archive: archive ?? false
        });
        if (archive) removeSession(sessionId);
        if (!result) return textResult({ error: `Session not found in memory: ${sessionId}` });

        return textResult({
          archived: archive ?? false,
          sessionId,
          filePersisted: fileResult.session !== null
        });
      }
    );
  });
};
