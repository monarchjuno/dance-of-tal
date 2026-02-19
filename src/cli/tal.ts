#!/usr/bin/env node
import path from "node:path";
import { buildCustomDance, buildCustomTal, resolveUnifiedSources } from "../lib/customize.js";
import { buildPrompt, findDance, findTal, listDances, listTals, quickApply } from "../lib/persona.js";

function printTalUsage() {
  console.log(`tal CLI

Usage:
  tal list
  tal show <tal-slug>
  tal run <tal-slug> --dance <dance-slug> [--task "..."]
  tal custom --name "<name>" --input "..." [--input "..."] [--goal "..."] [--category "..."] [--tags "a,b,c"]
`);
}

function printDanceUsage() {
  console.log(`dance CLI

Usage:
  dance list
  dance show <dance-slug>
  dance custom --name "<name>" --input "..." [--input "..."] [--goal "..."] [--category "..."] [--tags "a,b,c"]
`);
}

function readFlag(args: string[], flag: string) {
  const idx = args.findIndex((item) => item === flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function readFlags(args: string[], flag: string) {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function buildInputsFromArgs(args: string[]) {
  const unifiedInputs = readFlags(args, "--input");
  const legacyText = readFlags(args, "--text");
  const legacyFile = readFlags(args, "--file");
  const legacyUrl = readFlags(args, "--url");
  return [...unifiedInputs, ...legacyText, ...legacyFile, ...legacyUrl];
}

async function runTal(command: string | undefined, args: string[]) {
  if (!command) {
    printTalUsage();
    return;
  }

  if (command === "list") {
    console.log(JSON.stringify(listTals({}), null, 2));
    return;
  }

  if (command === "show") {
    const slug = args[0];
    if (!slug) throw new Error("tal slug is required: tal show <tal-slug>");
    const tal = findTal(slug);
    if (!tal) throw new Error(`Tal not found: ${slug}`);
    console.log(JSON.stringify(tal, null, 2));
    return;
  }

  if (command === "run") {
    const talSlug = args[0];
    if (!talSlug) throw new Error("tal slug is required: tal run <tal-slug> --dance <dance-slug>");

    const danceSlug = readFlag(args, "--dance");
    if (!danceSlug) throw new Error("--dance is required: tal run <tal-slug> --dance <dance-slug>");

    const task = readFlag(args, "--task") ?? "Describe your task here.";
    const output = quickApply({ talSlug, danceSlug, task });

    if (!output) throw new Error("Tal or Dance not found");
    console.log(output);
    return;
  }

  if (command === "custom") {
    const name = readFlag(args, "--name");
    if (!name) throw new Error("--name is required: tal custom --name \"...\"");
    const inputs = buildInputsFromArgs(args);
    const sources = await resolveUnifiedSources({ inputs });
    const goal = readFlag(args, "--goal");
    const category = readFlag(args, "--category");
    const tags = (readFlag(args, "--tags") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const tal = await buildCustomTal({
      name,
      category,
      tags,
      goal,
      sources
    });
    console.log(JSON.stringify(tal, null, 2));
    return;
  }

  printTalUsage();
}

async function runDance(command: string | undefined, args: string[]) {
  if (!command) {
    printDanceUsage();
    return;
  }

  if (command === "list") {
    console.log(JSON.stringify(listDances({}), null, 2));
    return;
  }

  if (command === "show") {
    const slug = args[0];
    if (!slug) throw new Error("dance slug is required: dance show <dance-slug>");
    const dance = findDance(slug);
    if (!dance) throw new Error(`Dance not found: ${slug}`);
    console.log(JSON.stringify(dance, null, 2));
    return;
  }

  if (command === "custom") {
    const name = readFlag(args, "--name");
    if (!name) throw new Error("--name is required: dance custom --name \"...\"");
    const inputs = buildInputsFromArgs(args);
    const sources = await resolveUnifiedSources({ inputs });
    const goal = readFlag(args, "--goal");
    const category = readFlag(args, "--category");
    const tags = (readFlag(args, "--tags") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const dance = await buildCustomDance({
      name,
      category,
      tags,
      goal,
      sources
    });
    console.log(JSON.stringify(dance, null, 2));
    return;
  }

  printDanceUsage();
}

async function main() {
  const cliName = path.basename(process.argv[1], path.extname(process.argv[1]));
  const [, , command, ...args] = process.argv;

  if (cliName === "dance") {
    await runDance(command, args);
    return;
  }

  await runTal(command, args);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cli] ${message}`);
  process.exit(1);
});
