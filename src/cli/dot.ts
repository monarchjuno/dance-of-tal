#!/usr/bin/env node
import { stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Dance, Tal } from "../data/types.js";
import { buildCustomDance, buildCustomTal, CustomSource } from "../lib/customize.js";
import { buildOutputPrompt, buildThinkingPrompt, findDance, findTal, listDances, listTals } from "../lib/persona.js";
import {
  clearActiveCombo,
  createComboFromRefs,
  createCustomCombo,
  createPresetCombo,
  DotDanceRef,
  DotTalRef,
  getComboById,
  getConfigPaths,
  initProjectConfig,
  readProjectConfig,
  renameCombo,
  resolveProjectDir,
  setActiveComboById
} from "./dot-config.js";

const supportsColor = Boolean(process.stdout.isTTY && process.env.NO_COLOR !== "1");

const color = (value: string, code: string) => (supportsColor ? `${code}${value}\u001b[0m` : value);
const ui = {
  title: (value: string) => color(value, "\u001b[1;36m"),
  section: (value: string) => color(value, "\u001b[1;35m"),
  command: (value: string) => color(value, "\u001b[36m"),
  step: (value: string) => color(value, "\u001b[1;33m"),
  dim: (value: string) => color(value, "\u001b[2m"),
  success: (value: string) => color(value, "\u001b[1;32m"),
  warning: (value: string) => color(value, "\u001b[1;33m"),
  error: (value: string) => color(value, "\u001b[1;31m")
};

type SelectItem = {
  slug: string;
  name: string;
  category?: string;
};

function printUsage() {
  const commandRows: Array<[string, string]> = [
    ["dot init [--project ...]", "Step-by-step setup wizard for .dance-of-tal config"],
    ["dot init --tal ... [--dance ...] [--name ...] [--target ...]", "Non-interactive init + optional starting combo"],
    ["dot setup ...", "Alias of dot init"],
    ["dot list tal|dance [filters]", "Browse preset data (add --include-custom to include saved custom items)"],
    ["dot show tal|dance <slug>", "Inspect one Tal or Dance"],
    ["dot use --tal <slug> [--dance <slug>]", "Activate Tal-only, Dance-only, or Combo mode"],
    ["dot switch tal|dance|combo", "Switch active Tal/Dance/Combo with selection UX"],
    ["dot doctor [--project ...] [--target ...]", "Run host-connection diagnostics and setup hints"],
    ["dot current", "Show active mode and combo details"],
    ["dot prompt --mode combined|thinking|output", "Print active prompt block"],
    ["dot run --task \"...\"", "Build task-ready SYSTEM + USER package from active mode"],
    ["dot combo list|show|use|rename", "Manage saved combos in this project"],
    ["dot combo custom --name ...", "Generate custom Tal/Dance and save as combo"],
    ["dot clear", "Clear active combo"],
    ["dot config show|path", "Inspect config file location/content"]
  ];

  const comboRows: Array<[string, string]> = [
    ["Combo", "Tal + Dance"],
    ["Tal-only", "Tal thinking only (no Dance)"],
    ["Dance-only", "Dance style only (no Tal)"]
  ];

  const width = Math.max(...commandRows.map(([left]) => left.length), ...comboRows.map(([left]) => left.length)) + 2;
  const pad = (value: string) => value.padEnd(width, " ");

  console.log(
    [
      "",
      ui.title("Dance of Tal CLI"),
      ui.dim("================"),
      "",
      ui.section("Purpose"),
      "  Apply Tal (thinking) and Dance (output) to AI behavior per project.",
      "",
      ui.section("Quick Start"),
      `  1) ${ui.command("dot init")}`,
      `  2) ${ui.command('dot use --tal elon-musk-case-tal --dance boardroom-brief --name "Founder Combo"')}`,
      `  3) ${ui.command('dot run --task "Draft weekly board update"')}`,
      "",
      ui.section("Modes"),
      ...comboRows.map(([left, right]) => `  ${pad(left)}${right}`),
      "",
      ui.section("Commands"),
      ...commandRows.map(([left, right]) => `  ${ui.command(pad(left))}${right}`),
      "",
      ui.section("Examples"),
      `  ${ui.command('dot init --tal elon-musk-case-tal --name "Thinking Start"')}`,
      `  ${ui.command('dot init --tal elon-musk-case-tal --dance boardroom-brief --target openclaw --no-interactive')}`,
      `  ${ui.command("dot doctor --target windsurf")}`,
      `  ${ui.command('dot use --dance boardroom-brief --name "Output Only"')}`,
      `  ${ui.command("dot switch tal")}`,
      `  ${ui.command('dot combo custom --name "My Custom" --tal-only --text "first principles and constraints"')}`,
      `  ${ui.command("dot list dance --category Executive --query concise")}`,
      "",
      ui.section("Project Config"),
      "  Stored at: .dance-of-tal/config.json",
      "  Init targets: windsurf | claude | openclaw | cursor | gpts | other",
      ""
    ].join("\n")
  );
}

function readFlag(args: string[], flag: string) {
  const idx = args.findIndex((item) => item === flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

function parseCsv(value?: string) {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function readFlags(args: string[], flag: string) {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function buildSourcesFromArgs(args: string[]): CustomSource[] {
  const textSources = readFlags(args, "--text").map((value) => ({ type: "text" as const, value }));
  const fileSources = readFlags(args, "--file").map((value) => ({ type: "file" as const, value }));
  const urlSources = readFlags(args, "--url").map((value) => ({ type: "url" as const, value }));
  return [...textSources, ...fileSources, ...urlSources];
}

const isMode = (value: string): value is "thinking" | "output" | "combined" => {
  return value === "thinking" || value === "output" || value === "combined";
};

const readProjectArg = (args: string[]) => resolveProjectDir(readFlag(args, "--project"));
const isInteractiveTty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

type InitWizardMode = "init-only" | "tal-only" | "dance-only" | "combo";
type InitWizardSourceType = "preset" | "custom";
type InitTargetHost = "windsurf" | "claude" | "openclaw" | "cursor" | "gpts" | "other";

type InitWizardSelection = {
  cancelled: boolean;
  projectDir: string;
  mode: InitWizardMode;
  targetHost: InitTargetHost;
  sourceType: InitWizardSourceType;
  talSlug?: string;
  danceSlug?: string;
  customTalName?: string;
  customDanceName?: string;
  customSources?: CustomSource[];
  comboName?: string;
};

type SwitchTarget = "tal" | "dance" | "combo";

type RefChoice = {
  id: string;
  ref: DotTalRef | DotDanceRef | null;
  label: string;
  meta?: string;
  aliases?: string[];
};

type DoctorCheck = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string;
};

const resolveTargetHost = (value?: string): InitTargetHost => {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "windsurf") return "windsurf";
  if (normalized === "claude" || normalized === "claude-desktop") return "claude";
  if (normalized === "openclaw" || normalized === "openclaw.ai") return "openclaw";
  if (normalized === "cursor") return "cursor";
  if (normalized === "gpts" || normalized === "chatgpt" || normalized === "gpt") return "gpts";
  if (normalized === "other") return "other";
  return "claude";
};

const buildTargetSetup = (targetHost: InitTargetHost) => {
  if (targetHost === "windsurf") {
    return {
      host: "windsurf",
      steps: [
        "Open Windsurf MCP settings and register a local stdio server.",
        "Set command: npx",
        "Set args: -y dance-of-tal",
        "Reload MCP tools and run: workflow_overview."
      ]
    };
  }
  if (targetHost === "claude") {
    return {
      host: "claude",
      steps: [
        "Open Claude Desktop MCP settings.",
        "Set command: npx",
        "Set args: -y dance-of-tal",
        "Reload Claude Desktop and verify with: workflow_overview."
      ]
    };
  }
  if (targetHost === "openclaw") {
    return {
      host: "openclaw",
      steps: [
        "Run this MCP server via stdio command: npx -y dance-of-tal.",
        "Call build_openclaw_profile with selected Tal/Dance.",
        "Paste returned systemPrompt into your OpenClaw assistant profile."
      ]
    };
  }
  if (targetHost === "cursor") {
    return {
      host: "cursor",
      steps: [
        "Open Cursor MCP integration settings and add a local stdio server.",
        "Set command: npx",
        "Set args: -y dance-of-tal",
        "Reload tools and test with: list_tals."
      ]
    };
  }
  if (targetHost === "gpts") {
    return {
      host: "gpts",
      steps: [
        "For GPTs Knowledge mode, upload tals/dances/summary JSON files.",
        "Optionally use web endpoints: https://dance-of-tal.vercel.app/data/*.json",
        "Use recommended combo first, then lock style in system instructions."
      ]
    };
  }
  return {
    host: "other",
    steps: [
      "Connect any MCP host using stdio command: npx -y dance-of-tal.",
      "Verify tool visibility with: workflow_overview.",
      "Use dot switch and dot run to validate active behavior."
    ]
  };
};

const buildGenericMcpConfigSnippet = (projectDir: string) =>
  JSON.stringify(
    {
      mcpServers: {
        "dance-of-tal": {
          command: "npx",
          args: ["-y", "dance-of-tal"],
          env: {
            DANCE_OF_TAL_PROJECT_DIR: projectDir
          }
        }
      }
    },
    null,
    2
  );

const pathExists = async (targetPath: string) => {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

async function selectByNumber({
  ask,
  label,
  items
}: {
  ask: (prompt: string) => Promise<string>;
  label: "Tal" | "Dance";
  items: SelectItem[];
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

async function selectRefChoiceByNumber({
  ask,
  title,
  choices
}: {
  ask: (prompt: string) => Promise<string>;
  title: string;
  choices: RefChoice[];
}) {
  if (choices.length === 0) {
    throw new Error(`No selectable ${title} entries.`);
  }

  const printChoices = () => {
    choices.forEach((choice, index) => {
      const meta = choice.meta ? ` / ${choice.meta}` : "";
      console.log(`  ${ui.command(String(index + 1).padStart(2, " "))}. ${choice.label}${ui.dim(meta)}`);
    });
  };

  printChoices();

  while (true) {
    const raw = await ask(`Select ${title} [1]: `);
    const input = raw.trim();
    if (!input) return choices[0];

    const index = Number(input);
    if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
      return choices[index - 1];
    }

    const normalized = input.toLowerCase();
    const found = choices.find((choice) => {
      const names = [choice.id, ...(choice.aliases ?? [])].map((item) => item.toLowerCase());
      return names.includes(normalized);
    });
    if (found) return found;

    console.log(ui.warning(`Invalid selection. Enter a number (1-${choices.length}) or listed identifier.`));
  }
}

async function collectCustomSources({
  ask
}: {
  ask: (prompt: string) => Promise<string>;
}) {
  const sources: CustomSource[] = [];
  while (true) {
    console.log("");
    console.log("  1) Add text");
    console.log("  2) Add file path");
    console.log("  3) Add URL");
    console.log("  4) Done");
    const action = (await ask("Choose source action 1-4 [4]: ")) || "4";
    if (action === "4") {
      if (sources.length === 0) {
        console.log(ui.warning("Add at least one source before finishing."));
        continue;
      }
      break;
    }
    if (action === "1") {
      const value = await ask("Text source: ");
      if (!value.trim()) {
        console.log(ui.warning("Text cannot be empty."));
        continue;
      }
      sources.push({ type: "text", value: value.trim() });
      continue;
    }
    if (action === "2") {
      const value = await ask("File path: ");
      if (!value.trim()) {
        console.log(ui.warning("File path cannot be empty."));
        continue;
      }
      sources.push({ type: "file", value: value.trim() });
      continue;
    }
    if (action === "3") {
      const value = await ask("URL: ");
      if (!value.trim()) {
        console.log(ui.warning("URL cannot be empty."));
        continue;
      }
      sources.push({ type: "url", value: value.trim() });
      continue;
    }
    console.log(ui.warning("Please enter 1, 2, 3, or 4."));
  }

  return sources;
}

async function runInitWizard({
  defaultProjectDir,
  defaultComboName
}: {
  defaultProjectDir: string;
  defaultComboName?: string;
}): Promise<InitWizardSelection> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = async (prompt: string) => (await rl.question(prompt)).trim();
  const askWithDefault = async (prompt: string, defaultValue: string) => {
    const value = await ask(`${prompt} [${defaultValue}]: `);
    return value || defaultValue;
  };
  const askOptional = async (prompt: string, defaultValue?: string) => {
    if (defaultValue && defaultValue.trim().length > 0) {
      return askWithDefault(prompt, defaultValue);
    }
    return ask(`${prompt}: `);
  };

  let projectDir = defaultProjectDir;
  let mode: InitWizardMode = "combo";
  let targetHost: InitTargetHost = "claude";
  let sourceType: InitWizardSourceType = "preset";
  let talSlug: string | undefined;
  let danceSlug: string | undefined;
  let customTalName: string | undefined;
  let customDanceName: string | undefined;
  let customSources: CustomSource[] | undefined;
  let comboName: string | undefined = defaultComboName?.trim() || undefined;

  try {
    console.log(ui.title("dot init wizard"));
    console.log(ui.dim("----------------"));

    console.log(ui.step("Step 1: Choose project directory"));
    const projectInput = await askWithDefault("Project path for .dance-of-tal config", defaultProjectDir);
    projectDir = resolveProjectDir(projectInput);

    console.log("");
    console.log(ui.step("Step 2: Choose rule profiles"));
    console.log("Which rule profiles would you like to add to your project?");
    console.log("  1) Tal + Dance (Combo) [recommended]");
    console.log("  2) Tal-only");
    console.log("  3) Dance-only");
    console.log("  4) None for now (config only)");
    while (true) {
      const modeInput = await ask("Select 1-4 [1]: ");
      const normalized = modeInput || "1";
      if (normalized === "1") {
        mode = "combo";
        break;
      }
      if (normalized === "2") {
        mode = "tal-only";
        break;
      }
      if (normalized === "3") {
        mode = "dance-only";
        break;
      }
      if (normalized === "4") {
        mode = "init-only";
        break;
      }
      console.log(ui.warning("Please enter 1, 2, 3, or 4."));
    }

    if (mode !== "init-only") {
      console.log("");
      console.log(ui.step("Step 3: Choose host target"));
      console.log("Where will you use these rule profiles first?");
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

      console.log("");
      console.log(ui.step("Step 4: Choose source type"));
      console.log("  1) Preset catalog");
      console.log("  2) Custom generate (text/file/url)");
      while (true) {
        const sourceInput = (await ask("Select 1-2 [1]: ")) || "1";
        if (sourceInput === "1") {
          sourceType = "preset";
          break;
        }
        if (sourceInput === "2") {
          sourceType = "custom";
          break;
        }
        console.log(ui.warning("Please enter 1 or 2."));
      }

      if (sourceType === "preset") {
        if (mode === "tal-only" || mode === "combo") {
          console.log("");
          console.log(ui.step("Step 5: Choose Tal"));
          talSlug = await selectByNumber({ ask, label: "Tal", items: listTals({}) });
        }

        if (mode === "dance-only" || mode === "combo") {
          console.log("");
          console.log(ui.step("Step 6: Choose Dance"));
          danceSlug = await selectByNumber({ ask, label: "Dance", items: listDances({}) });
        }
      } else {
        console.log("");
        console.log(ui.step("Step 5: Add custom sources"));
        customSources = await collectCustomSources({ ask });

        console.log("");
        console.log(ui.step("Step 6: Name custom profile(s)"));
        if (mode === "tal-only" || mode === "combo") {
          const talNameInput = await askOptional("Custom Tal name", comboName ? `${comboName} Tal` : undefined);
          customTalName = talNameInput.trim() || "Custom Tal";
        }
        if (mode === "dance-only" || mode === "combo") {
          const danceNameInput = await askOptional("Custom Dance name", comboName ? `${comboName} Dance` : undefined);
          customDanceName = danceNameInput.trim() || "Custom Dance";
        }
      }

      console.log("");
      console.log(ui.step("Step 7: Optional combo name"));
      const nameInput = await askOptional("Combo name", comboName);
      comboName = nameInput.trim() || undefined;
    }

    console.log("");
    console.log(ui.step("Final: Confirm"));
    console.log(`  Project: ${projectDir}`);
    console.log(`  Mode: ${mode}`);
    console.log(`  Target Host: ${targetHost}`);
    console.log(`  Source: ${sourceType}`);
    if (talSlug) console.log(`  Tal: ${talSlug}`);
    if (danceSlug) console.log(`  Dance: ${danceSlug}`);
    if (customTalName) console.log(`  Custom Tal: ${customTalName}`);
    if (customDanceName) console.log(`  Custom Dance: ${customDanceName}`);
    if (customSources?.length) console.log(`  Custom Sources: ${customSources.length}`);
    if (comboName) console.log(`  Name: ${comboName}`);
    const confirm = (await ask("Apply this setup? (Y/n): ")).toLowerCase();
    const cancelled = confirm === "n" || confirm === "no";

    return {
      cancelled,
      projectDir,
      mode,
      targetHost,
      sourceType,
      talSlug,
      danceSlug,
      customTalName,
      customDanceName,
      customSources,
      comboName
    };
  } finally {
    rl.close();
  }
}

const buildSystemInstructionHeader = () =>
  [
    "System Instruction:",
    "You are an AI assistant.",
    "Follow the reasoning rules first, then produce output using the response style rules.",
    "Keep reasoning disciplined and produce outputs and behavior that match the required tone, format, and operating constraints."
  ].join("\n");

const buildPromptFromSelection = ({ tal, dance, mode }: { tal: Tal | null; dance: Dance | null; mode: "thinking" | "output" | "combined" }) => {
  const header = buildSystemInstructionHeader();
  const thinkingPrompt = tal ? buildThinkingPrompt(tal) : null;
  const outputPrompt = dance ? buildOutputPrompt(dance) : null;

  if (mode === "thinking") {
    if (!thinkingPrompt) throw new Error("Active combo does not include Tal. Switch combo or use --mode combined/output.");
    return thinkingPrompt;
  }

  if (mode === "output") {
    if (!outputPrompt) throw new Error("Active combo does not include Dance. Switch combo or use --mode combined/thinking.");
    return outputPrompt;
  }

  return [header, thinkingPrompt, outputPrompt].filter(Boolean).join("\n\n");
};

const buildRunPackageFromSelection = ({ tal, dance, task }: { tal: Tal | null; dance: Dance | null; task: string }) => {
  const combined = buildPromptFromSelection({ tal, dance, mode: "combined" });
  return ["SYSTEM:", combined, "", "USER:", task].join("\n");
};

const resolveTal = (
  config: NonNullable<Awaited<ReturnType<typeof readProjectConfig>>>,
  talRef: { kind: "preset"; slug: string } | { kind: "custom"; id: string } | null
) => {
  if (!talRef) return null;
  if (talRef.kind === "preset") {
    return findTal(talRef.slug) ?? null;
  }
  return config.customTals.find((item) => item.id === talRef.id)?.tal ?? null;
};

const resolveDance = (
  config: NonNullable<Awaited<ReturnType<typeof readProjectConfig>>>,
  danceRef: { kind: "preset"; slug: string } | { kind: "custom"; id: string } | null
) => {
  if (!danceRef) return null;
  if (danceRef.kind === "preset") {
    return findDance(danceRef.slug) ?? null;
  }
  return config.customDances.find((item) => item.id === danceRef.id)?.dance ?? null;
};

async function getResolvedActiveCombo(projectDir: string) {
  const config = await readProjectConfig(projectDir);
  if (!config || !config.activeComboId) return null;

  const combo = config.combos.find((item) => item.id === config.activeComboId);
  if (!combo) return null;

  const tal = resolveTal(config, combo.talRef);
  const dance = resolveDance(config, combo.danceRef);

  if (combo.talRef && !tal) {
    throw new Error(`Active combo has missing Tal reference: ${combo.id}`);
  }
  if (combo.danceRef && !dance) {
    throw new Error(`Active combo has missing Dance reference: ${combo.id}`);
  }
  if (!tal && !dance) {
    throw new Error(`Active combo has no Tal/Dance: ${combo.id}`);
  }

  return { config, combo, tal, dance };
}

const refsEqual = <T extends { kind: "preset"; slug: string } | { kind: "custom"; id: string }>(a: T | null, b: T | null) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  return a.kind === "preset" ? a.slug === (b as { kind: "preset"; slug: string }).slug : a.id === (b as { kind: "custom"; id: string }).id;
};

const describeTalRef = (config: NonNullable<Awaited<ReturnType<typeof readProjectConfig>>>, talRef: DotTalRef | null) => {
  if (!talRef) return "none";
  if (talRef.kind === "preset") {
    const tal = findTal(talRef.slug);
    return tal ? `${tal.name} (${tal.slug})` : talRef.slug;
  }
  const custom = config.customTals.find((item) => item.id === talRef.id);
  return custom ? `${custom.tal.name} (${custom.tal.slug}, custom)` : `custom:${talRef.id}`;
};

const describeDanceRef = (config: NonNullable<Awaited<ReturnType<typeof readProjectConfig>>>, danceRef: DotDanceRef | null) => {
  if (!danceRef) return "none";
  if (danceRef.kind === "preset") {
    const dance = findDance(danceRef.slug);
    return dance ? `${dance.name} (${dance.slug})` : danceRef.slug;
  }
  const custom = config.customDances.find((item) => item.id === danceRef.id);
  return custom ? `${custom.dance.name} (${custom.dance.slug}, custom)` : `custom:${danceRef.id}`;
};

const buildTalRefChoices = (config: NonNullable<Awaited<ReturnType<typeof readProjectConfig>>>) => {
  const presetChoices: RefChoice[] = listTals({}).map((item) => ({
    id: item.slug,
    ref: { kind: "preset", slug: item.slug } satisfies DotTalRef,
    label: item.slug,
    meta: `preset / ${item.category}`,
    aliases: [item.slug]
  }));

  const customChoices: RefChoice[] = config.customTals.map((item) => ({
    id: item.id,
    ref: { kind: "custom", id: item.id } satisfies DotTalRef,
    label: item.tal.slug,
    meta: "custom",
    aliases: [item.id, item.tal.slug]
  }));

  return [
    { id: "none", ref: null, label: "none", meta: "switch to Dance-only", aliases: ["none", "null"] },
    ...presetChoices,
    ...customChoices
  ];
};

const buildDanceRefChoices = (config: NonNullable<Awaited<ReturnType<typeof readProjectConfig>>>) => {
  const presetChoices: RefChoice[] = listDances({}).map((item) => ({
    id: item.slug,
    ref: { kind: "preset", slug: item.slug } satisfies DotDanceRef,
    label: item.slug,
    meta: `preset / ${item.category}`,
    aliases: [item.slug]
  }));

  const customChoices: RefChoice[] = config.customDances.map((item) => ({
    id: item.id,
    ref: { kind: "custom", id: item.id } satisfies DotDanceRef,
    label: item.dance.slug,
    meta: "custom",
    aliases: [item.id, item.dance.slug]
  }));

  return [
    { id: "none", ref: null, label: "none", meta: "switch to Tal-only", aliases: ["none", "null"] },
    ...presetChoices,
    ...customChoices
  ];
};

async function runList(args: string[]) {
  const target = args[0];
  const rest = args.slice(1);
  const query = readFlag(rest, "--query");
  const category = readFlag(rest, "--category");
  const tags = parseCsv(readFlag(rest, "--tags"));
  const includeCustom = hasFlag(rest, "--include-custom");
  const projectDir = readProjectArg(rest);

  if (target === "tal") {
    const preset = listTals({ query, category, tags }).map((item) => ({ ...item, source: "preset" as const }));
    if (!includeCustom) {
      console.log(JSON.stringify(preset, null, 2));
      return;
    }

    const config = await readProjectConfig(projectDir);
    const custom = (config?.customTals ?? [])
      .map((item) => ({
        slug: item.tal.slug,
        name: item.tal.name,
        description: item.tal.description,
        category: item.tal.category,
        tags: item.tal.tags,
        source: "custom" as const,
        customId: item.id
      }))
      .filter((item) => {
        const q = query?.toLowerCase().trim();
        const matchQuery = !q || [item.name, item.description, item.category, ...item.tags].join(" ").toLowerCase().includes(q);
        const matchCategory = !category || item.category === category;
        const matchTags = !tags || tags.every((tag) => item.tags.map((x) => x.toLowerCase()).includes(tag.toLowerCase()));
        return matchQuery && matchCategory && matchTags;
      });

    console.log(JSON.stringify([...preset, ...custom], null, 2));
    return;
  }

  if (target === "dance") {
    const preset = listDances({ query, category, tags }).map((item) => ({ ...item, source: "preset" as const }));
    if (!includeCustom) {
      console.log(JSON.stringify(preset, null, 2));
      return;
    }

    const config = await readProjectConfig(projectDir);
    const custom = (config?.customDances ?? [])
      .map((item) => ({
        slug: item.dance.slug,
        name: item.dance.name,
        description: item.dance.description,
        category: item.dance.category,
        tone: item.dance.tone,
        structure: item.dance.structure,
        source: "custom" as const,
        customId: item.id
      }))
      .filter((item) => {
        const q = query?.toLowerCase().trim();
        const matchQuery = !q || [item.name, item.description, item.category, ...item.tone, ...item.structure].join(" ").toLowerCase().includes(q);
        const matchCategory = !category || item.category === category;
        const normalizedTags = tags?.map((tag) => tag.toLowerCase()) ?? [];
        const matchTags = normalizedTags.length === 0 || normalizedTags.every((tag) => [...item.tone, ...item.structure].map((x) => x.toLowerCase()).includes(tag));
        return matchQuery && matchCategory && matchTags;
      });

    console.log(JSON.stringify([...preset, ...custom], null, 2));
    return;
  }

  throw new Error("Usage: dot list tal|dance [--query ...] [--category ...] [--tags a,b]");
}

async function runShow(args: string[]) {
  const target = args[0];
  const slug = args[1];
  const rest = args.slice(2);
  if (!slug) throw new Error("Usage: dot show tal|dance <slug>");

  if (target === "tal") {
    const tal = findTal(slug);
    if (tal) {
      console.log(JSON.stringify({ source: "preset", tal }, null, 2));
      return;
    }

    const config = await readProjectConfig(readProjectArg(rest));
    const custom = config?.customTals.find((item) => item.tal.slug === slug);
    if (custom) {
      console.log(JSON.stringify({ source: "custom", customId: custom.id, tal: custom.tal }, null, 2));
      return;
    }

    throw new Error(`Tal not found: ${slug}`);
  }

  if (target === "dance") {
    const dance = findDance(slug);
    if (dance) {
      console.log(JSON.stringify({ source: "preset", dance }, null, 2));
      return;
    }

    const config = await readProjectConfig(readProjectArg(rest));
    const custom = config?.customDances.find((item) => item.dance.slug === slug);
    if (custom) {
      console.log(JSON.stringify({ source: "custom", customId: custom.id, dance: custom.dance }, null, 2));
      return;
    }

    throw new Error(`Dance not found: ${slug}`);
  }

  throw new Error("Usage: dot show tal|dance <slug>");
}

async function runUse(args: string[]) {
  const positionalTal = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  const talSlug = readFlag(args, "--tal") ?? positionalTal;
  const danceSlug = readFlag(args, "--dance");
  const comboName = readFlag(args, "--name");
  const projectDir = readProjectArg(args);

  if (!talSlug && !danceSlug) {
    throw new Error("Usage: dot use <tal-slug> [--dance <dance-slug>] OR dot use --tal <tal-slug> OR dot use --dance <dance-slug>");
  }

  const tal = talSlug ? findTal(talSlug) : null;
  if (talSlug && !tal) throw new Error(`Tal not found: ${talSlug}`);

  const dance = danceSlug ? findDance(danceSlug) : null;
  if (danceSlug && !dance) throw new Error(`Dance not found: ${danceSlug}`);

  const stored = await createPresetCombo({
    projectDir,
    name: comboName,
    talSlug: talSlug ?? undefined,
    danceSlug: danceSlug ?? undefined,
    activate: true
  });

  const activeCombo = stored.config.combos.find((item) => item.id === stored.config.activeComboId) ?? null;

  console.log(
    JSON.stringify(
      {
        message: "Active combo saved.",
        projectDir: stored.projectDir,
        configPath: stored.configPath,
        activeCombo,
        tal: tal ? { slug: tal.slug, name: tal.name, category: tal.category } : null,
        dance: dance ? { slug: dance.slug, name: dance.name, category: dance.category } : null
      },
      null,
      2
    )
  );
}

async function runSwitch(args: string[]) {
  const first = args[0];
  const explicitTarget: SwitchTarget | undefined =
    first === "tal" || first === "dance" || first === "combo" ? (first as SwitchTarget) : undefined;
  const rest = explicitTarget ? args.slice(1) : args;
  const projectDir = readProjectArg(rest);

  const initialized = await initProjectConfig(projectDir);
  const config = initialized.config;

  let target: SwitchTarget | undefined = explicitTarget;
  if (!target) {
    if (!isInteractiveTty()) {
      throw new Error("Usage: dot switch tal|dance|combo [args]");
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ask = async (prompt: string) => (await rl.question(prompt)).trim();
      console.log(ui.step("Switch target"));
      console.log("  1) Tal");
      console.log("  2) Dance");
      console.log("  3) Combo");
      while (true) {
        const input = (await ask("Select 1-3 [1]: ")) || "1";
        if (input === "1") {
          target = "tal";
          break;
        }
        if (input === "2") {
          target = "dance";
          break;
        }
        if (input === "3") {
          target = "combo";
          break;
        }
        console.log(ui.warning("Please enter 1, 2, or 3."));
      }
    } finally {
      rl.close();
    }
  }

  if (!target) {
    throw new Error("Switch target is required.");
  }

  if (target === "combo") {
    const combos = config.combos;
    if (combos.length === 0) {
      throw new Error("No saved combos yet. Create one with dot use ... or dot combo custom ...");
    }

    const comboIdFromFlag = readFlag(rest, "--id");
    const comboPositional = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
    let comboId = comboIdFromFlag ?? comboPositional;

    if (!comboId) {
      if (!isInteractiveTty()) {
        throw new Error("Usage: dot switch combo <combo-id> [--project /path]");
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const ask = async (prompt: string) => (await rl.question(prompt)).trim();
        const choices: RefChoice[] = combos.map((combo) => ({
          id: combo.id,
          ref: null,
          label: `${combo.name} (${combo.id.slice(0, 8)})`,
          meta: `${combo.talRef ? "tal" : "no-tal"} / ${combo.danceRef ? "dance" : "no-dance"}`,
          aliases: [combo.id]
        }));
        const selected = await selectRefChoiceByNumber({ ask, title: "Combo", choices });
        comboId = selected.id;
      } finally {
        rl.close();
      }
    }

    const result = await setActiveComboById({ projectDir, comboId });
    if (!result) throw new Error(`Combo not found: ${comboId}`);
    const activeCombo = result.config.combos.find((item) => item.id === comboId) ?? null;
    console.log(
      JSON.stringify(
        {
          message: "Active combo switched.",
          projectDir: result.projectDir,
          configPath: result.configPath,
          activeCombo
        },
        null,
        2
      )
    );
    return;
  }

  const activeCombo = config.activeComboId ? config.combos.find((item) => item.id === config.activeComboId) ?? null : null;
  const preserveOther = !hasFlag(rest, "--solo");
  const selector = target === "tal" ? buildTalRefChoices(config) : buildDanceRefChoices(config);

  const slugFlag = readFlag(rest, "--slug");
  const positional = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
  const rawSelection = (slugFlag ?? positional)?.trim();

  let selectedChoice: RefChoice | undefined;
  if (rawSelection) {
    const normalized = rawSelection.toLowerCase();
    selectedChoice = selector.find((choice) => {
      const aliases = [choice.id, ...(choice.aliases ?? [])].map((value) => value.toLowerCase());
      return aliases.includes(normalized);
    });
    if (!selectedChoice) {
      throw new Error(`${target} not found: ${rawSelection}`);
    }
  } else if (isInteractiveTty()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ask = async (prompt: string) => (await rl.question(prompt)).trim();
      selectedChoice = await selectRefChoiceByNumber({ ask, title: target === "tal" ? "Tal" : "Dance", choices: selector });
    } finally {
      rl.close();
    }
  } else {
    throw new Error(`Usage: dot switch ${target} <slug|custom-id|none> [--solo] [--project /path]`);
  }

  const selectedRef = selectedChoice?.ref ?? null;
  const talRef = target === "tal" ? (selectedRef as DotTalRef | null) : preserveOther ? activeCombo?.talRef ?? null : null;
  const danceRef = target === "dance" ? (selectedRef as DotDanceRef | null) : preserveOther ? activeCombo?.danceRef ?? null : null;

  if (!talRef && !danceRef) {
    throw new Error("Switch result is empty. Keep one side or choose another target.");
  }

  const existing = config.combos.find((item) => refsEqual(item.talRef, talRef) && refsEqual(item.danceRef, danceRef));
  if (existing) {
    const switched = await setActiveComboById({ projectDir, comboId: existing.id });
    if (!switched) throw new Error(`Failed to activate existing combo: ${existing.id}`);
    console.log(
      JSON.stringify(
        {
          message: "Switched to existing combo.",
          projectDir: switched.projectDir,
          configPath: switched.configPath,
          activeCombo: existing
        },
        null,
        2
      )
    );
    return;
  }

  const name =
    readFlag(rest, "--name") ??
    `${talRef ? describeTalRef(config, talRef) : "No Tal"} x ${danceRef ? describeDanceRef(config, danceRef) : "No Dance"}`;

  const created = await createComboFromRefs({
    projectDir,
    name,
    talRef,
    danceRef,
    activate: true
  });

  const newActiveCombo = created.config.combos.find((item) => item.id === created.config.activeComboId) ?? null;
  console.log(
    JSON.stringify(
      {
        message: "New switched combo created and activated.",
        projectDir: created.projectDir,
        configPath: created.configPath,
        activeCombo: newActiveCombo
      },
      null,
      2
    )
  );
}

async function runCurrent(args: string[]) {
  const projectDir = readProjectArg(args);
  const resolved = await getResolvedActiveCombo(projectDir);
  const { configPath } = getConfigPaths(projectDir);

  if (!resolved) {
    console.log(
      JSON.stringify(
        {
          message: "No active combo in this project. Run: dot use ... or dot combo custom ...",
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

async function runClear(args: string[]) {
  const projectDir = readProjectArg(args);
  const result = await clearActiveCombo(projectDir);
  console.log(
    JSON.stringify(
      {
        message: "Active combo cleared.",
        projectDir: result.projectDir,
        configPath: result.configPath,
        activeComboId: result.config.activeComboId
      },
      null,
      2
    )
  );
}

async function runInit(args: string[]) {
  let projectDir = readProjectArg(args);
  let talSlug = readFlag(args, "--tal");
  let danceSlug = readFlag(args, "--dance");
  let comboName = readFlag(args, "--name");
  let targetHost: InitTargetHost = resolveTargetHost(readFlag(args, "--target"));
  let sourceType: InitWizardSourceType = "preset";
  let customTalName: string | undefined;
  let customDanceName: string | undefined;
  let customSources: CustomSource[] | undefined;
  const skipInteractive = hasFlag(args, "--no-interactive");
  const shouldRunWizard = !talSlug && !danceSlug && !skipInteractive && isInteractiveTty();

  if (shouldRunWizard) {
    const wizard = await runInitWizard({ defaultProjectDir: projectDir, defaultComboName: comboName });
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
    talSlug = wizard.talSlug;
    danceSlug = wizard.danceSlug;
    targetHost = wizard.targetHost;
    sourceType = wizard.sourceType;
    customTalName = wizard.customTalName;
    customDanceName = wizard.customDanceName;
    customSources = wizard.customSources;
    comboName = comboName ?? wizard.comboName;
  }

  const created = await initProjectConfig(projectDir);
  const nextSteps: string[] = [];
  let activeCombo: unknown = null;
  let customTal: Tal | null = null;
  let customDance: Dance | null = null;

  if (sourceType === "custom" && customSources && customSources.length > 0) {
    const buildTal = shouldRunWizard ? Boolean(customTalName) : Boolean(talSlug);
    const buildDance = shouldRunWizard ? Boolean(customDanceName) : Boolean(danceSlug);

    const talResult = buildTal
      ? await buildCustomTal({
          name: customTalName ?? `${comboName ?? "Custom"} Tal`,
          sources: customSources
        })
      : null;

    const danceResult = buildDance
      ? await buildCustomDance({
          name: customDanceName ?? `${comboName ?? "Custom"} Dance`,
          sources: customSources
        })
      : null;

    customTal = talResult?.tal ?? null;
    customDance = danceResult?.dance ?? null;

    const stored = await createCustomCombo({
      projectDir,
      name: comboName ?? "Custom Init Combo",
      tal: customTal ?? undefined,
      dance: customDance ?? undefined,
      activate: true
    });
    activeCombo = stored.config.combos.find((item) => item.id === stored.config.activeComboId) ?? null;
  } else if (talSlug || danceSlug) {
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
    nextSteps.push("dot use --tal <tal-slug> [--dance <dance-slug>] --name \"My Combo\"");
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

async function runPrompt(args: string[]) {
  const modeRaw = readFlag(args, "--mode") ?? "combined";
  if (!isMode(modeRaw)) {
    throw new Error("--mode must be one of: thinking, output, combined");
  }

  const projectDir = readProjectArg(args);
  const resolved = await getResolvedActiveCombo(projectDir);
  if (!resolved) {
    throw new Error("No active combo in project config. Run: dot use ... or dot combo custom ...");
  }

  console.log(buildPromptFromSelection({ tal: resolved.tal, dance: resolved.dance, mode: modeRaw }));
}

async function runRun(args: string[]) {
  const task = readFlag(args, "--task") ?? "Describe your task here.";
  const projectDir = readProjectArg(args);
  const resolved = await getResolvedActiveCombo(projectDir);
  if (!resolved) {
    throw new Error("No active combo in this project. Run: dot use ... or dot combo custom ...");
  }

  console.log(buildRunPackageFromSelection({ tal: resolved.tal, dance: resolved.dance, task }));
}

async function runCombo(args: string[]) {
  const sub = args[0];
  const rest = args.slice(1);
  const projectDir = readProjectArg(rest);

  if (sub === "list") {
    const config = await readProjectConfig(projectDir);
    console.log(
      JSON.stringify(
        {
          projectDir,
          activeComboId: config?.activeComboId ?? null,
          items: config?.combos ?? []
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "show") {
    const comboId = rest[0];
    if (!comboId) throw new Error("Usage: dot combo show <combo-id> [--project /path]");

    const result = await getComboById({ projectDir, comboId });
    if (!result.combo) throw new Error(`Combo not found: ${comboId}`);

    const tal = resolveTal(result.config, result.combo.talRef);
    const dance = resolveDance(result.config, result.combo.danceRef);

    console.log(
      JSON.stringify(
        {
          combo: result.combo,
          tal,
          dance,
          mode: tal && dance ? "combo" : tal ? "tal-only" : dance ? "dance-only" : "empty"
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "use") {
    const comboId = rest[0];
    if (!comboId) throw new Error("Usage: dot combo use <combo-id> [--project /path]");

    const result = await setActiveComboById({ projectDir, comboId });
    if (!result) throw new Error(`Combo not found: ${comboId}`);

    const combo = result.config.combos.find((item) => item.id === comboId) ?? null;

    console.log(
      JSON.stringify(
        {
          message: "Active combo switched.",
          projectDir: result.projectDir,
          configPath: result.configPath,
          activeCombo: combo
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "rename") {
    const comboId = rest[0];
    const name = readFlag(rest, "--name");
    if (!comboId || !name) {
      throw new Error("Usage: dot combo rename <combo-id> --name \"New Combo Name\" [--project /path]");
    }

    const result = await renameCombo({ projectDir, comboId, name });
    if (!result) throw new Error(`Combo not found: ${comboId}`);

    const combo = result.config.combos.find((item) => item.id === comboId) ?? null;
    console.log(JSON.stringify({ message: "Combo renamed.", combo }, null, 2));
    return;
  }

  if (sub === "custom") {
    const comboName = readFlag(rest, "--name");
    if (!comboName) {
      throw new Error("Usage: dot combo custom --name \"Founder Combo\" --text \"...\" [--file ...] [--url ...]");
    }

    const talOnly = hasFlag(rest, "--tal-only");
    const danceOnly = hasFlag(rest, "--dance-only");
    if (talOnly && danceOnly) {
      throw new Error("--tal-only and --dance-only cannot be used together");
    }

    const buildTal = !danceOnly;
    const buildDance = !talOnly;

    const talName = readFlag(rest, "--tal-name") ?? `${comboName} Tal`;
    const danceName = readFlag(rest, "--dance-name") ?? `${comboName} Dance`;
    const goal = readFlag(rest, "--goal");
    const talCategory = readFlag(rest, "--tal-category");
    const danceCategory = readFlag(rest, "--dance-category");
    const tags = parseCsv(readFlag(rest, "--tags"));
    const sources = buildSourcesFromArgs(rest);

    if (sources.length === 0) {
      throw new Error("At least one source is required: --text, --file, or --url");
    }

    const talResult = buildTal
      ? await buildCustomTal({
          name: talName,
          category: talCategory,
          tags,
          goal,
          sources
        })
      : null;

    const danceResult = buildDance
      ? await buildCustomDance({
          name: danceName,
          category: danceCategory,
          tags,
          goal,
          sources
        })
      : null;

    const stored = await createCustomCombo({
      projectDir,
      name: comboName,
      tal: talResult?.tal,
      dance: danceResult?.dance,
      activate: true
    });

    const activeCombo = stored.config.combos.find((item) => item.id === stored.config.activeComboId) ?? null;

    console.log(
      JSON.stringify(
        {
          message: "Custom combo created and activated.",
          projectDir: stored.projectDir,
          configPath: stored.configPath,
          activeCombo,
          mode: talResult && danceResult ? "combo" : talResult ? "tal-only" : "dance-only",
          customTal: talResult?.tal ?? null,
          customDance: danceResult?.dance ?? null,
          talSourceDigest: talResult?.sourceDigest ?? null,
          danceSourceDigest: danceResult?.sourceDigest ?? null
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error("Usage: dot combo list|show|use|rename|custom ...");
}

async function runConfig(args: string[]) {
  const sub = args[0];
  const projectDir = readProjectArg(args.slice(1));
  const paths = getConfigPaths(projectDir);

  if (sub === "path") {
    console.log(paths.configPath);
    return;
  }

  if (sub === "show") {
    const config = await readProjectConfig(projectDir);
    console.log(JSON.stringify({ projectDir, configPath: paths.configPath, config }, null, 2));
    return;
  }

  throw new Error("Usage: dot config path|show [--project /path]");
}

async function runDoctor(args: string[]) {
  const projectDir = readProjectArg(args);
  const targetHost = resolveTargetHost(readFlag(args, "--target"));
  const { configPath } = getConfigPaths(projectDir);
  const checks: DoctorCheck[] = [];
  const runtimeFilePath = fileURLToPath(import.meta.url);
  const runtimeCliDir = path.dirname(runtimeFilePath);

  const nodeMajor = Number(process.versions.node.split(".")[0] ?? "0");
  if (Number.isFinite(nodeMajor) && nodeMajor >= 18) {
    checks.push({
      id: "node-version",
      status: "pass",
      message: `Node.js ${process.versions.node} is supported`
    });
  } else {
    checks.push({
      id: "node-version",
      status: "fail",
      message: `Node.js ${process.versions.node} is too old`,
      details: "Use Node.js 18+"
    });
  }

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
      message: "Project config not found",
      details: "Run: dot init"
    });
  }

  const activeCombo = config?.activeComboId ? config.combos.find((item) => item.id === config.activeComboId) ?? null : null;
  if (activeCombo) {
    checks.push({
      id: "active-combo",
      status: "pass",
      message: `Active combo is set: ${activeCombo.name}`,
      details: activeCombo.id
    });
  } else {
    checks.push({
      id: "active-combo",
      status: "warn",
      message: "No active combo set",
      details: "Run: dot use --tal <slug> [--dance <slug>]"
    });
  }

  const candidateServerPaths = [
    path.resolve(runtimeCliDir, "../server/index.js"),
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

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "list") {
    await runList(args);
    return;
  }

  if (command === "show") {
    await runShow(args);
    return;
  }

  if (command === "use") {
    await runUse(args);
    return;
  }

  if (command === "switch") {
    await runSwitch(args);
    return;
  }

  if (command === "run") {
    await runRun(args);
    return;
  }

  if (command === "prompt") {
    await runPrompt(args);
    return;
  }

  if (command === "current") {
    await runCurrent(args);
    return;
  }

  if (command === "clear") {
    await runClear(args);
    return;
  }

  if (command === "init") {
    await runInit(args);
    return;
  }

  if (command === "setup") {
    await runInit(args);
    return;
  }

  if (command === "combo") {
    await runCombo(args);
    return;
  }

  if (command === "config") {
    await runConfig(args);
    return;
  }

  if (command === "doctor") {
    await runDoctor(args);
    return;
  }

  console.error(ui.error(`[dot] Unknown command: ${command}`));
  printUsage();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(ui.error(`[dot] ${message}`));
  process.exit(1);
});
