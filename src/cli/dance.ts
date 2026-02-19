#!/usr/bin/env node
import { buildCustomDance, resolveUnifiedSources } from "../lib/customize.js";
import { findDance, listDances } from "../lib/persona.js";

function printUsage() {
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

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    printUsage();
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
    const result = await buildCustomDance({ name, category, tags, goal, sources });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printUsage();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[dance] ${message}`);
  process.exit(1);
});
