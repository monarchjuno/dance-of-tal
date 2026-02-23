import { createInterface } from "node:readline/promises";
import { resolveProjectDir, createPresetCombo, createCustomCombo, initProjectConfig } from "../dot-config.js";
import { listDances, listTals } from "../../lib/persona.js";
import { ui } from "../utils/ui.js";
import { buildTargetSetup, InitTargetHost, InitWizardMode, InitWizardSourceType, resolveTargetHost } from "../utils/targets.js";
import { buildCustomDance, buildCustomTal, resolveUnifiedSources } from "../../lib/customize.js";
import { findDance, findTal } from "../../lib/persona.js";
import { readFlag, hasFlag } from "../utils/flags.js";
import { readProjectArg } from "../utils/resolvers.js";
import type { Dance, Tal } from "../../data/types.js";

type InitWizardSelection = {
    cancelled: boolean;
    projectDir: string;
    targetHost: InitTargetHost;
};

const isInteractiveTty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function selectByNumber({
    ask,
    label,
    items
}: {
    ask: (prompt: string) => Promise<string>;
    label: "Tal" | "Dance";
    items: { slug: string; name: string; category?: string }[];
}) {
    if (items.length === 0) {
        throw new Error(`${label} catalog is empty.`);
    }

    const previewLimit = Math.min(items.length, 20);
    const printPreview = () => {
        items.slice(0, previewLimit).forEach((item, index) => {
            const category = item.category ? ` / ${item.category}` : "";
            console.log(`  ${ui.command(String(index + 1).padStart(2, " "))}. ${item.slug}${ui.dim(category)} - ${item.name}`);
        });
        if (items.length > previewLimit) {
            console.log(ui.dim(`  ... ${items.length - previewLimit} more. Type "list" to show all.`));
        }
    };

    const printAll = () => {
        items.forEach((item, index) => {
            const category = item.category ? ` / ${item.category}` : "";
            console.log(`  ${ui.command(String(index + 1).padStart(2, " "))}. ${item.slug}${ui.dim(category)} - ${item.name}`);
        });
    };

    printPreview();

    while (true) {
        const raw = await ask(`Select ${label} by number or slug [1]: `);
        const input = raw.trim();
        const normalized = input.toLowerCase();

        if (!input) {
            return items[0].slug;
        }

        if (normalized === "list" || normalized === "all" || normalized === "more") {
            printAll();
            continue;
        }

        const index = Number(input);
        if (Number.isInteger(index) && index >= 1 && index <= items.length) {
            return items[index - 1].slug;
        }

        const bySlug = items.find((item) => item.slug === input);
        if (bySlug) {
            return bySlug.slug;
        }

        console.log(ui.warning(`Invalid ${label} selection. Enter a number (1-${items.length}) or exact slug.`));
    }
}

async function collectCustomInputs({ ask }: { ask: (prompt: string) => Promise<string> }) {
    const inputs: string[] = [];
    while (true) {
        console.log("");
        const value = await ask(`Input #${inputs.length + 1} (text, file path, URL, or mixed note). Press Enter to finish: `);
        const normalized = value.trim();

        if (!normalized) {
            if (inputs.length === 0) {
                console.log(ui.warning("Add at least one input before finishing."));
                continue;
            }
            break;
        }
        inputs.push(normalized);
    }

    return inputs;
}

export async function runInitWizard({
    defaultProjectDir,
}: {
    defaultProjectDir: string;
}): Promise<InitWizardSelection> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const ask = async (prompt: string) => (await rl.question(prompt)).trim();
    const askWithDefault = async (prompt: string, defaultValue: string) => {
        const value = await ask(`${prompt} [${defaultValue}]: `);
        return value || defaultValue;
    };

    let projectDir = defaultProjectDir;
    let targetHost: InitTargetHost = "claude";

    try {
        console.log(ui.title("dot init wizard"));
        console.log(ui.dim("----------------"));

        console.log(ui.step("Step 1: Choose project directory"));
        const projectInput = await askWithDefault("Project path for .dance-of-tal config", defaultProjectDir);
        projectDir = resolveProjectDir(projectInput);

        console.log("");
        console.log(ui.step("Step 2: Choose host target"));
        console.log("Where will you use this configuration first?");
        console.log("  1) Windsurf");
        console.log("  2) Claude Desktop [recommended]");
        console.log("  3) OpenClaw.ai");
        console.log("  4) Cursor");
        console.log("  5) ChatGPT (GPTs)");
        console.log("  6) Other MCP host");
        while (true) {
            const hostInput = (await ask("Select 1-6 [2]: ")) || "2";
            if (hostInput === "1") {
                targetHost = "windsurf";
                break;
            }
            if (hostInput === "2") {
                targetHost = "claude";
                break;
            }
            if (hostInput === "3") {
                targetHost = "openclaw";
                break;
            }
            if (hostInput === "4") {
                targetHost = "cursor";
                break;
            }
            if (hostInput === "5") {
                targetHost = "gpts";
                break;
            }
            if (hostInput === "6") {
                targetHost = "other";
                break;
            }
            console.log(ui.warning("Please enter 1, 2, 3, 4, 5, or 6."));
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes("closed")) {
            return {
                cancelled: true,
                projectDir,
                targetHost: "other"
            };
        }
        throw error;
    } finally {
        rl.close();
    }

    return {
        cancelled: false,
        projectDir,
        targetHost
    };
}

export async function runInit(args: string[]) {
    let projectDir = readProjectArg(args);
    let talSlug = readFlag(args, "--tal");
    let danceSlug = readFlag(args, "--dance");
    let comboName = readFlag(args, "--name");
    let targetHost: InitTargetHost = resolveTargetHost(readFlag(args, "--target"));
    let sourceType: InitWizardSourceType = "preset";
    let customTalName: string | undefined;
    let customDanceName: string | undefined;
    let customInputs: string[] | undefined;
    const skipInteractive = hasFlag(args, "--no-interactive");
    const shouldRunWizard = !skipInteractive && isInteractiveTty();

    if (shouldRunWizard) {
        const wizard = await runInitWizard({ defaultProjectDir: projectDir });
        if (wizard.cancelled) {
            console.log(
                JSON.stringify(
                    {
                        message: "dot init cancelled. No changes were made.",
                        projectDir: wizard.projectDir
                    },
                    null,
                    2
                )
            );
            return;
        }
        projectDir = wizard.projectDir;
        targetHost = wizard.targetHost;
    }

    const created = await initProjectConfig(projectDir);
    const nextSteps: string[] = [];
    let activeCombo: unknown = null;
    let customTal: Tal | null = null;
    let customDance: Dance | null = null;

    if (talSlug || danceSlug) {
        const tal = talSlug ? findTal(talSlug) : null;
        const dance = danceSlug ? findDance(danceSlug) : null;

        if (talSlug && !tal) {
            throw new Error(`Tal not found: ${talSlug}`);
        }
        if (danceSlug && !dance) {
            throw new Error(`Dance not found: ${danceSlug}`);
        }

        const stored = await createPresetCombo({
            projectDir,
            name: comboName,
            talSlug: talSlug ?? undefined,
            danceSlug: danceSlug ?? undefined,
            activate: true
        });
        activeCombo = stored.config.combos.find((item) => item.id === stored.config.activeComboId) ?? null;
    }

    if (!activeCombo) {
        nextSteps.push("dot list tal");
        nextSteps.push("dot list dance");
        nextSteps.push("dot lock --tal <tal-slug> [--dance <dance-slug>] --name \"My Combo\"");
    } else {
        nextSteps.push("dot current");
        nextSteps.push("dot run --task \"Describe your real task\"");
    }

    const targetSetup = buildTargetSetup(targetHost);
    nextSteps.push(...targetSetup.steps);

    console.log(
        JSON.stringify(
            {
                message: "dot init completed.",
                projectDir: created.projectDir,
                configPath: created.configPath,
                schemaVersion: created.config.schemaVersion,
                targetHost,
                targetSetup,
                activeCombo,
                customTal,
                customDance,
                nextSteps
            },
            null,
            2
        )
    );
}
