import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildCustomDance, buildCustomTal, buildCustomTalDance } from "../lib/customize.js";
import { getGptsBootstrap, listGptsDanceBriefs, listGptsTalBriefs, recommendGptsByNeed, recommendGptsByTalSlug } from "../lib/gpts.js";
import {
  buildOpenClawProfile,
  buildPrompt,
  findDance,
  findTal,
  getDataSummary,
  getRecommendedCombos,
  listDanceCategories,
  listDances,
  listTals,
  quickApply,
  recommendDanceCategories
} from "../lib/persona.js";
import {
  clearSession,
  getSession,
  getWorkflowOverview,
  initializeStylingSession,
  listSessions,
  nextComboRecommendation,
  runActiveCombo,
  setActiveCombo
} from "../lib/workflow.js";

const server = new McpServer({
  name: "dance-of-tal-mcp",
  version: "0.5.2",
  description: "Tal x Dance MCP server"
});

const textResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }]
});

const customSourceSchema = z.object({
  type: z.enum(["text", "file", "url"]),
  value: z.string().min(1),
  label: z.string().optional()
});

const ALL_TOOLS = [
  "workflow_overview",
  "initialize_styling_session",
  "next_combo",
  "set_active_combo",
  "get_session",
  "list_sessions",
  "run_active_combo",
  "clear_session",
  "list_tals",
  "get_tal",
  "list_dances",
  "get_dance",
  "list_dance_categories",
  "recommend_dance_categories",
  "get_data_summary",
  "get_recommended_combos",
  "build_prompt",
  "quick_apply",
  "build_openclaw_profile",
  "build_custom_tal",
  "build_custom_dance",
  "build_custom_tal_dance",
  "get_gpts_bootstrap",
  "list_gpts_tals",
  "list_gpts_dances",
  "recommend_gpts"
] as const;

const CORE_TOOLS = [
  "workflow_overview",
  "initialize_styling_session",
  "next_combo",
  "set_active_combo",
  "get_session",
  "run_active_combo",
  "clear_session",
  "list_tals",
  "get_tal",
  "list_dances",
  "get_dance",
  "build_prompt",
  "quick_apply",
  "recommend_gpts"
] as const;

const STANDARD_TOOLS = [
  ...CORE_TOOLS,
  "list_sessions",
  "list_dance_categories",
  "recommend_dance_categories",
  "get_recommended_combos",
  "build_openclaw_profile",
  "build_custom_tal",
  "build_custom_dance",
  "build_custom_tal_dance"
] as const;

type ToolName = (typeof ALL_TOOLS)[number];

const normalizeToolName = (value: string) => value.toLowerCase().trim().replace(/\s+/g, "_");
const ALL_TOOL_SET = new Set<string>(ALL_TOOLS);

const resolveToolSet = () => {
  const raw = (process.env.DANCE_OF_TAL_TOOLS ?? "standard").trim();
  const mode = raw.toLowerCase();

  if (mode === "all") return new Set<string>(ALL_TOOLS);
  if (mode === "standard" || mode === "default") return new Set<string>(STANDARD_TOOLS);
  if (mode === "core" || mode === "lean") return new Set<string>(CORE_TOOLS);

  const requested = raw
    .split(",")
    .map((token) => normalizeToolName(token))
    .filter(Boolean);

  if (requested.length === 0) {
    return new Set<string>(STANDARD_TOOLS);
  }

  const unknown = requested.filter((tool) => !ALL_TOOL_SET.has(tool));
  if (unknown.length > 0) {
    console.error(`[dance-of-tal-mcp] Ignoring unknown tools in DANCE_OF_TAL_TOOLS: ${unknown.join(", ")}`);
  }

  const resolved = requested.filter((tool) => ALL_TOOL_SET.has(tool));
  if (resolved.length === 0) {
    return new Set<string>(STANDARD_TOOLS);
  }

  return new Set<string>(resolved);
};

const enabledTools = resolveToolSet();
const loadedTools: ToolName[] = [];

const registerTool = (name: ToolName, register: () => void) => {
  if (!enabledTools.has(name)) return;
  register();
  loadedTools.push(name);
};

registerTool("workflow_overview", () => {
  server.tool("workflow_overview", "Show workflow for Tal x Dance", {}, async () => textResult(getWorkflowOverview()));
});

registerTool("initialize_styling_session", () => {
  server.tool(
    "initialize_styling_session",
    "Start a Tal x Dance workflow session by goal",
    {
      goal: z.string().min(3),
      language: z.string().optional(),
      talCategory: z.string().optional(),
      danceCategory: z.string().optional(),
      tag: z.string().optional(),
      limitTal: z.number().int().positive().max(20).optional(),
      limitDance: z.number().int().positive().max(20).optional(),
      limitCombos: z.number().int().positive().max(20).optional()
    },
    async ({ goal, language, talCategory, danceCategory, tag, limitTal, limitDance, limitCombos }) =>
      textResult(initializeStylingSession({ goal, language, talCategory, danceCategory, tag, limitTal, limitDance, limitCombos }))
  );
});

registerTool("next_combo", () => {
  server.tool(
    "next_combo",
    "Get next best Tal x Dance combo candidates for an existing session",
    {
      sessionId: z.string().min(1),
      need: z.string().optional(),
      talCategory: z.string().optional(),
      danceCategory: z.string().optional(),
      tag: z.string().optional(),
      limitTal: z.number().int().positive().max(20).optional(),
      limitDance: z.number().int().positive().max(20).optional(),
      limitCombos: z.number().int().positive().max(20).optional()
    },
    async ({ sessionId, need, talCategory, danceCategory, tag, limitTal, limitDance, limitCombos }) => {
      const result = nextComboRecommendation({ sessionId, need, talCategory, danceCategory, tag, limitTal, limitDance, limitCombos });
      if (!result) return textResult({ error: `Session not found: ${sessionId}` });
      return textResult(result);
    }
  );
});

registerTool("set_active_combo", () => {
  server.tool(
    "set_active_combo",
    "Lock active Tal and Dance combo in session (Tal-only or Dance-only is also allowed)",
    { sessionId: z.string().min(1), talSlug: z.string().min(1).optional(), danceSlug: z.string().min(1).optional(), comboName: z.string().optional() },
    async ({ sessionId, talSlug, danceSlug, comboName }) => {
      if (!talSlug && !danceSlug) {
        return textResult({ error: "talSlug or danceSlug is required" });
      }
      const result = setActiveCombo({ sessionId, talSlug, danceSlug, comboName });
      if (!result) return textResult({ error: "Session, Tal, or Dance not found" });
      return textResult(result);
    }
  );
});

registerTool("get_session", () => {
  server.tool("get_session", "Get workflow session snapshot", { sessionId: z.string().min(1) }, async ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) return textResult({ error: `Session not found: ${sessionId}` });
    return textResult(session);
  });
});

registerTool("list_sessions", () => {
  server.tool("list_sessions", "List active workflow sessions", {}, async () => textResult({ items: listSessions() }));
});

registerTool("run_active_combo", () => {
  server.tool(
    "run_active_combo",
    "Build task-ready package from active Tal x Dance combo",
    { sessionId: z.string().min(1), task: z.string().min(1) },
    async ({ sessionId, task }) => {
      const result = runActiveCombo({ sessionId, task });
      if (!result) return textResult({ error: "Session not found or no active combo. Call set_active_combo first." });
      return textResult(result);
    }
  );
});

registerTool("clear_session", () => {
  server.tool(
    "clear_session",
    "Clear active combo or archive session",
    { sessionId: z.string().min(1), archive: z.boolean().optional() },
    async ({ sessionId, archive }) => {
      const result = clearSession({ sessionId, archive: archive ?? false });
      if (!result) return textResult({ error: `Session not found: ${sessionId}` });
      return textResult(result);
    }
  );
});

registerTool("list_tals", () => {
  server.tool(
    "list_tals",
    "List Tal items",
    {
      query: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional()
    },
    async (args) => textResult({ items: listTals(args) })
  );
});

registerTool("get_tal", () => {
  server.tool("get_tal", "Get full Tal", { slug: z.string().min(1) }, async ({ slug }) => {
    const tal = findTal(slug);
    if (!tal) return textResult({ error: `Tal not found: ${slug}` });
    return textResult(tal);
  });
});

registerTool("list_dances", () => {
  server.tool(
    "list_dances",
    "List Dance items",
    {
      query: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional()
    },
    async (args) => textResult({ items: listDances(args) })
  );
});

registerTool("get_dance", () => {
  server.tool("get_dance", "Get full Dance", { slug: z.string().min(1) }, async ({ slug }) => {
    const dance = findDance(slug);
    if (!dance) return textResult({ error: `Dance not found: ${slug}` });
    return textResult(dance);
  });
});

registerTool("list_dance_categories", () => {
  server.tool("list_dance_categories", "List available Dance categories", {}, async () => textResult({ items: listDanceCategories() }));
});

registerTool("recommend_dance_categories", () => {
  server.tool(
    "recommend_dance_categories",
    "Recommend Dance categories for a Tal",
    { talSlug: z.string().min(1) },
    async ({ talSlug }) => {
      const categories = recommendDanceCategories(talSlug);
      if (!categories) return textResult({ error: `Tal not found: ${talSlug}` });
      return textResult({ talSlug, categories });
    }
  );
});

registerTool("get_data_summary", () => {
  server.tool(
    "get_data_summary",
    "Get summary data for tals, dances, combos, or all",
    {
      type: z.enum(["all", "tals", "dances", "combos"]).optional(),
      limit: z.number().int().positive().optional()
    },
    async ({ type, limit }) => textResult(getDataSummary(type ?? "all", limit))
  );
});

registerTool("get_recommended_combos", () => {
  server.tool(
    "get_recommended_combos",
    "Get recommended Tal-Dance combinations",
    {
      talSlug: z.string().optional(),
      danceSlug: z.string().optional(),
      limit: z.number().int().positive().optional()
    },
    async ({ talSlug, danceSlug, limit }) => {
      const result = getRecommendedCombos({ talSlug, danceSlug, limit });
      if (!result) return textResult({ error: `No recommendation for tal: ${talSlug}` });
      return textResult(result);
    }
  );
});

registerTool("build_prompt", () => {
  server.tool(
    "build_prompt",
    "Build Tal x Dance prompt",
    {
      talSlug: z.string().min(1),
      danceSlug: z.string().min(1),
      mode: z.enum(["thinking", "output", "combined"]).optional()
    },
    async ({ talSlug, danceSlug, mode }) => {
      const prompts = buildPrompt(talSlug, danceSlug, mode ?? "combined");
      if (!prompts) return textResult({ error: "Tal or Dance not found" });
      return textResult(prompts);
    }
  );
});

registerTool("quick_apply", () => {
  server.tool(
    "quick_apply",
    "Build quick apply package",
    {
      talSlug: z.string().min(1),
      danceSlug: z.string().min(1),
      task: z.string().min(1)
    },
    async ({ talSlug, danceSlug, task }) => {
      const output = quickApply({ talSlug, danceSlug, task });
      if (!output) return textResult({ error: "Tal or Dance not found" });
      return textResult({ package: output });
    }
  );
});

registerTool("build_openclaw_profile", () => {
  server.tool(
    "build_openclaw_profile",
    "Build OpenClaw-ready profile payload for a Personal AI Assistant",
    {
      talSlug: z.string().min(1),
      danceSlug: z.string().min(1),
      assistantName: z.string().optional(),
      personaGoal: z.string().optional(),
      userContext: z.string().optional(),
      includeTaskStarter: z.boolean().optional()
    },
    async ({ talSlug, danceSlug, assistantName, personaGoal, userContext, includeTaskStarter }) => {
      const payload = buildOpenClawProfile({
        talSlug,
        danceSlug,
        assistantName,
        personaGoal,
        userContext,
        includeTaskStarter
      });

      if (!payload) return textResult({ error: "Tal or Dance not found" });
      return textResult(payload);
    }
  );
});

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
      sources: z.array(customSourceSchema).min(1).max(8)
    },
    async ({ name, category, tags, description, goal, sources }) => {
      try {
        const result = await buildCustomTal({ name, category, tags, description, goal, sources });
        return textResult(result);
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
      sources: z.array(customSourceSchema).min(1).max(8)
    },
    async ({ name, category, tags, description, goal, sources }) => {
      try {
        const result = await buildCustomDance({ name, category, tags, description, goal, sources });
        return textResult(result);
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
      sources: z.array(customSourceSchema).min(1).max(8)
    },
    async ({ name, talCategory, danceCategory, tags, goal, sources }) => {
      try {
        const result = await buildCustomTalDance({ name, talCategory, danceCategory, tags, goal, sources });
        return textResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult({ error: message });
      }
    }
  );
});

registerTool("get_gpts_bootstrap", () => {
  server.tool("get_gpts_bootstrap", "Get compact GPTs bootstrap index", {}, async () => textResult(getGptsBootstrap()));
});

registerTool("list_gpts_tals", () => {
  server.tool(
    "list_gpts_tals",
    "List compact Tal briefs for GPTs",
    {
      q: z.string().optional(),
      category: z.string().optional(),
      tag: z.string().optional(),
      limit: z.number().int().positive().optional()
    },
    async ({ q, category, tag, limit }) => textResult({ items: listGptsTalBriefs({ q, category, tag, limit }) })
  );
});

registerTool("list_gpts_dances", () => {
  server.tool(
    "list_gpts_dances",
    "List compact Dance briefs for GPTs",
    {
      q: z.string().optional(),
      category: z.string().optional(),
      tag: z.string().optional(),
      limit: z.number().int().positive().optional()
    },
    async ({ q, category, tag, limit }) => textResult({ items: listGptsDanceBriefs({ q, category, tag, limit }) })
  );
});

registerTool("recommend_gpts", () => {
  server.tool(
    "recommend_gpts",
    "Recommend Tal and Dance by user need or selected Tal",
    {
      need: z.string().optional(),
      talSlug: z.string().optional(),
      limitTal: z.number().int().positive().optional(),
      limitDance: z.number().int().positive().optional()
    },
    async ({ need, talSlug, limitTal, limitDance }) => {
      if (talSlug) {
        const result = recommendGptsByTalSlug(talSlug);
        if (!result) return textResult({ error: `No recommendation for tal: ${talSlug}` });
        return textResult(result);
      }

      if (!need) {
        return textResult({ error: "need or talSlug is required" });
      }

      return textResult(recommendGptsByNeed(need, limitTal, limitDance));
    }
  );
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[dance-of-tal-mcp] ready. loaded tools=${loadedTools.length} mode=${process.env.DANCE_OF_TAL_TOOLS ?? "standard"} names=${loadedTools.join(",")}`
  );
}

main().catch((error) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
