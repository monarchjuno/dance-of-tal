import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGptsBootstrap, listGptsDanceBriefs, listGptsTalBriefs, recommendGptsByNeed, recommendGptsByTalSlug } from "../../lib/gpts.js";
import type { ToolName } from "../toolset.js";

type RegisterTool = (name: ToolName, register: () => void) => void;
type TextResult = (payload: unknown) => { content: { type: "text"; text: string }[] };

export const registerGptsTools = ({
  server,
  registerTool,
  textResult
}: {
  server: McpServer;
  registerTool: RegisterTool;
  textResult: TextResult;
}) => {
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
};
