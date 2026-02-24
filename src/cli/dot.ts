#!/usr/bin/env node
import { ui } from "./utils/ui.js";

import { handleTutorialCommand } from "./commands/tutorial.js";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runConfig } from "./commands/config.js";
import { runList, runShow } from "./commands/catalog.js";
import { runDeploy } from "./commands/deploy.js";
import { runPrompt, runRun, runCurrent } from "./commands/core.js";
import { runClear } from "./commands/clear.js";
import { runSwitch, runLock, runCombo, runUse } from "./commands/combo.js";
import { runChannel } from "./commands/channel.js";

function printUsage() {
  const commandRows: Array<[string, string]> = [
    ["dot pick tal|dance [filters]", "Pick a Tal or Dance from presets/custom items"],
    ["dot lock --tal <slug> [--dance <slug>]", "Lock active Tal/Dance into current project"],
    ["dot deploy --stage gpts|mcp|openclaw|threads|my-aws-server", "Build channel-ready package from active Tal/Dance"],
    ["dot init [--project ...]", "Step-by-step setup wizard for .dance-of-tal config"],
    ["dot init --tal ... [--dance ...] [--name ...] [--target ...]", "Non-interactive init + optional starting combo"],
    ["dot setup ...", "Alias of dot init"],
    ["dot list tal|dance [filters]", "Browse preset data (add --include-custom to include saved custom items)"],
    ["dot show tal|dance <slug>", "Inspect one Tal or Dance"],
    ["dot switch tal|dance|combo", "Switch active Tal/Dance/Combo with selection UX"],
    ["dot doctor [--project ...] [--target ...]", "Run host-connection diagnostics and setup hints"],
    ["dot current", "Show active mode and combo details"],
    ["dot prompt --mode combined|thinking|output", "Print active prompt block"],
    ["dot run --task \"...\"", "Build task-ready SYSTEM + USER package from active mode"],
    ["dot combo list|show|use|rename", "Manage saved combos in this project"],
    ["dot combo custom --name ...", "Generate custom Tal/Dance and save as combo"],
    ["dot channel list|show|connect|disconnect", "Manage per-project channel credentials in .dance-of-tal/channels.json"],
    ["dot clear", "Clear active combo"],
    ["dot config show|path", "Inspect config file location/content"],
    ["dot tutorial", "Interactive onboarding for core concepts"]
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
      `  1) ${ui.command("dot pick tal --query founder")}`,
      `  2) ${ui.command('dot lock --tal elon-musk-case-tal --dance boardroom-brief --name "Founder Combo"')}`,
      `  3) ${ui.command('dot deploy --stage mcp --task "Draft weekly board update"')}`,
      "",
      ui.section("Modes"),
      ...comboRows.map(([left, right]) => `  ${pad(left)}${right}`),
      "",
      ui.section("Flow"),
      "  Pick -> Lock -> Deploy",
      "",
      ui.section("Commands"),
      ...commandRows.map(([left, right]) => `  ${ui.command(pad(left))}${right}`),
      "",
      ui.section("Examples"),
      `  ${ui.command('dot init --tal elon-musk-case-tal --name "Thinking Start"')}`,
      `  ${ui.command('dot init --tal elon-musk-case-tal --dance boardroom-brief --target openclaw --no-interactive')}`,
      `  ${ui.command("dot doctor --target windsurf")}`,
      `  ${ui.command('dot lock --dance boardroom-brief --name "Output Only"')}`,
      `  ${ui.command("dot switch tal")}`,
      `  ${ui.command('dot combo custom --name "My Custom" --tal-only --input "first principles and constraints"')}`,
      `  ${ui.command('dot combo custom --name "Threads Voice" --dance-only --stage threads --example "Input => Output"')}`,
      `  ${ui.command('dot channel connect threads --token "<TOKEN>" --meta userId="<THREADS_USER_ID>"')}`,
      `  ${ui.command("dot channel connect threads   # token can come from .dance-of-tal/.env")}`,
      `  ${ui.command('dot deploy --stage threads --publish --text "Launching private beta now."')}`,
      `  ${ui.command("dot list dance --category Executive --query concise")}`,
      "",
      ui.section("Project Config"),
      "  Stored at: .dance-of-tal/config.json",
      "  Channel secrets: .dance-of-tal/channels.json",
      "  Init targets: windsurf | claude | openclaw | cursor | gpts | other",
      ""
    ].join("\n")
  );
}

async function runPick(args: string[]) {
  const target = args[0];
  if (!target) {
    throw new Error("Usage: dot pick tal|dance [filters] | dot pick combo");
  }
  if (target === "tal" || target === "dance") {
    await runList(args);
    return;
  }
  if (target === "combo") {
    await runCombo(["list", ...args.slice(1)]);
    return;
  }
  throw new Error("Usage: dot pick tal|dance [filters] | dot pick combo");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command) {
    printUsage();
    return;
  }

  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        printUsage();
        return;
      case "list":
        await runList(commandArgs);
        return;
      case "show":
        await runShow(commandArgs);
        return;
      case "init":
      case "setup":
        await runInit(commandArgs);
        return;
      case "lock":
        await runLock(commandArgs);
        return;
      case "switch":
        await runSwitch(commandArgs);
        return;
      case "current":
        await runCurrent(commandArgs);
        return;
      case "run":
        await runRun(commandArgs);
        return;
      case "prompt":
        await runPrompt(commandArgs);
        return;
      case "deploy":
        await runDeploy(commandArgs);
        return;
      case "combo":
        await runCombo(commandArgs);
        return;
      case "clear":
        await runClear(commandArgs);
        return;
      case "doctor":
        await runDoctor(commandArgs);
        return;
      case "tutorial":
        await handleTutorialCommand();
        return;
      case "config":
        await runConfig(commandArgs);
        return;
      case "channel":
        await runChannel(commandArgs);
        return;
      case "pick":
        await runPick(commandArgs);
        return;
      default:
        console.error(ui.error(`Unknown command: ${command}`));
        console.error(ui.dim("Run 'dot help' for usage info.\n"));
        process.exit(1);
    }
  } catch (error) {
    console.error(ui.error(String(error instanceof Error ? error.message : error)));
    process.exit(1);
  }
}

main();
