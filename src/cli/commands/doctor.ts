import { stat } from "node:fs/promises";
import path from "node:path";
import { ui } from "../utils/ui.js";
import { getConfigPaths, readProjectConfig } from "../dot-config.js";
import { readProjectArg } from "../utils/resolvers.js";
import { readFlag } from "../utils/flags.js";
import { resolveTargetHost, buildTargetSetup, buildGenericMcpConfigSnippet } from "../utils/targets.js";

type DoctorCheck = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string;
};

const pathExists = async (targetPath: string) => {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

export async function runDoctor(args: string[]) {
  const projectDir = readProjectArg(args);
  const targetHost = resolveTargetHost(readFlag(args, "--target"));
  const { configPath } = getConfigPaths(projectDir);

  const checks: DoctorCheck[] = [];

  const config = await readProjectConfig(projectDir);
  if (config) {
    checks.push({
      id: "project-config",
      status: "pass",
      message: "Project config found",
      details: configPath
    });
  } else {
    checks.push({
      id: "project-config",
      status: "warn",
      message: "Project config missing",
      details: "Run: dot init"
    });
  }

  if (config?.activeComboId) {
    checks.push({
      id: "active-combo",
      status: "pass",
      message: "Active combo set",
      details: config.activeComboId
    });
  } else {
    checks.push({
      id: "active-combo",
      status: "warn",
      message: "No active combo set",
      details: "Run: dot lock --tal <slug> [--dance <slug>]"
    });
  }

  const runtimeCliDir = path.dirname(new URL(import.meta.url).pathname);
  const candidateServerPaths = [
    path.resolve(runtimeCliDir, "../../server/index.js"),
    path.resolve(process.cwd(), "dist/server/index.js"),
    path.resolve(process.cwd(), "mcp/dist/server/index.js"),
    path.resolve(process.cwd(), "dance-of-tal/mcp/dist/server/index.js"),
    path.resolve(projectDir, "dist/server/index.js"),
    path.resolve(projectDir, "mcp/dist/server/index.js"),
    path.resolve(projectDir, "../mcp/dist/server/index.js")
  ];

  let detectedServerPath: string | null = null;
  for (const candidate of candidateServerPaths) {
    if (await pathExists(candidate)) {
      detectedServerPath = candidate;
      break;
    }
  }

  if (detectedServerPath) {
    checks.push({
      id: "mcp-server-build",
      status: "pass",
      message: "MCP server build found",
      details: detectedServerPath
    });
  } else {
    checks.push({
      id: "mcp-server-build",
      status: "warn",
      message: "MCP server build not found",
      details: "Install package: npm install -g dance-of-tal (or run local build: npm run build)"
    });
  }

  const targetSetup = buildTargetSetup(targetHost);
  const configSnippet = buildGenericMcpConfigSnippet("/ABSOLUTE/PATH/TO/YOUR/PROJECT");
  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarn = checks.some((check) => check.status === "warn");
  const summary = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  console.log(
    JSON.stringify(
      {
        summary,
        projectDir,
        configPath,
        targetHost,
        checks,
        targetSetup,
        configSnippet
      },
      null,
      2
    )
  );
}
