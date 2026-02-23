import { buildPromptFromSelection, buildRunPackageFromSelection } from "../utils/prompts.js";
import { getResolvedActiveCombo, readProjectArg } from "../utils/resolvers.js";
import { readFlag, isMode } from "../utils/flags.js";
import { getConfigPaths } from "../dot-config.js";

export async function runPrompt(args: string[]) {
    const modeRaw = readFlag(args, "--mode") ?? "combined";
    if (!isMode(modeRaw)) {
        throw new Error("--mode must be one of: thinking, output, combined");
    }

    const projectDir = readProjectArg(args);
    const resolved = await getResolvedActiveCombo(projectDir);
    if (!resolved) {
        throw new Error("No active combo in project config. Run: dot lock ... or dot combo custom ...");
    }

    console.log(buildPromptFromSelection({ tal: resolved.tal, dance: resolved.dance, act: null, mode: modeRaw }));
}

export async function runRun(args: string[]) {
    const task = readFlag(args, "--task") ?? "Describe your task here.";
    const projectDir = readProjectArg(args);
    const resolved = await getResolvedActiveCombo(projectDir);
    if (!resolved) {
        throw new Error("No active combo in this project. Run: dot lock ... or dot combo custom ...");
    }

    console.log(buildRunPackageFromSelection({ tal: resolved.tal, dance: resolved.dance, act: null, task }));
}

export async function runCurrent(args: string[]) {
    const projectDir = readProjectArg(args);
    const resolved = await getResolvedActiveCombo(projectDir);
    const { configPath } = getConfigPaths(projectDir);

    if (!resolved) {
        console.log(
            JSON.stringify(
                {
                    message: "No active combo in this project. Run: dot lock ... or dot combo custom ...",
                    projectDir,
                    configPath,
                    activeCombo: null
                },
                null,
                2
            )
        );
        return;
    }

    const { config, combo, tal, dance } = resolved;

    console.log(
        JSON.stringify(
            {
                projectDir,
                configPath,
                updatedAt: config.updatedAt,
                activeCombo: {
                    id: combo.id,
                    name: combo.name,
                    tal: tal ? { ref: combo.talRef, slug: tal.slug, name: tal.name, category: tal.category } : null,
                    dance: dance ? { ref: combo.danceRef, slug: dance.slug, name: dance.name, category: dance.category } : null,
                    mode: tal && dance ? "combo" : tal ? "tal-only" : "dance-only"
                },
                comboCount: config.combos.length,
                historyCount: config.history.length
            },
            null,
            2
        )
    );
}
