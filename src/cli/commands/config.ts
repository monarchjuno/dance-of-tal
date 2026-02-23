import fs from "node:fs";
import { getConfigPaths, readProjectConfig } from "../dot-config.js";
import { readProjectArg } from "../utils/resolvers.js";

export async function runConfig(args: string[]) {
    const target = args[0];
    const rest = args.slice(1);
    const projectDir = readProjectArg(rest);
    const paths = getConfigPaths(projectDir);

    if (target === "path") {
        console.log(paths.configPath);
        return;
    }

    if (target === "show") {
        if (!fs.existsSync(paths.configPath)) {
            throw new Error(`Config file not found: ${paths.configPath}`);
        }
        const content = fs.readFileSync(paths.configPath, "utf8");
        console.log(content);
        return;
    }

    throw new Error("Usage: dot config show|path [--project /path]");
}
