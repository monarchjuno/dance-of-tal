import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
} from "../../lib/persona.js";
import type { ToolName } from "../toolset.js";

type RegisterTool = (name: ToolName, register: () => void) => void;
type TextResult = (payload: unknown) => { content: { type: "text"; text: string }[] };

export const registerCatalogTools = ({
  server,
  registerTool,
  textResult
}: {
  server: McpServer;
  registerTool: RegisterTool;
  textResult: TextResult;
}) => {
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
};
