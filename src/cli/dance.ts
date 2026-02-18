#!/usr/bin/env node
import { buildCustomDance, CustomSource } from "../lib/customize.js";
import { findDance, listDances } from "../lib/persona.js";

function printUsage() {
  console.log(`dance CLI

Usage:
  dance list
  dance show <dance-slug>
  dance custom --name "<name>" [--text "..."] [--file ./notes.md] [--url https://example.com] [--goal "..."] [--category "..."] [--tags "a,b,c"]
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

function buildSourcesFromArgs(args: string[]): CustomSource[] {
  const textSources = readFlags(args, "--text").map((value) => ({ type: "text" as const, value }));
  const fileSources = readFlags(args, "--file").map((value) => ({ type: "file" as const, value }));
  const urlSources = readFlags(args, "--url").map((value) => ({ type: "url" as const, value }));
  return [...textSources, ...fileSources, ...urlSources];
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
    const sources = buildSourcesFromArgs(args);
    if (sources.length === 0) throw new Error("At least one source is required: --text, --file, or --url");
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
