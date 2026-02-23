#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { textResult } from "./response-utils.js";
import { registerCatalogTools } from "./tools/catalog-tools.js";
import { registerCustomTools } from "./tools/custom-tools.js";
import { registerGptsTools } from "./tools/gpts-tools.js";
import { registerWorkflowTools } from "./tools/workflow-tools.js";
import type { ToolName } from "./toolset.js";
import { resolveToolSet } from "./toolset.js";

const server = new McpServer({
  name: "dance-of-tal",
  version: "0.5.7",
  description: "Tal x Dance MCP server"
});

const enabledTools = resolveToolSet();
const loadedTools: ToolName[] = [];

const registerTool = (name: ToolName, register: () => void) => {
  if (!enabledTools.has(name)) return;
  register();
  loadedTools.push(name);
};

registerWorkflowTools({ server, registerTool, textResult });
registerCatalogTools({ server, registerTool, textResult });
registerCustomTools({ server, registerTool, textResult });
registerGptsTools({ server, registerTool, textResult });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[dance-of-tal] ready. loaded tools=${loadedTools.length} mode=${process.env.DANCE_OF_TAL_TOOLS ?? "core"} names=${loadedTools.join(",")}`
  );
}

main().catch((error) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
