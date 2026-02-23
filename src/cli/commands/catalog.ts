import { findDance, findTal, listDances, listTals } from "../../lib/persona.js";
import { summarizeDanceRule } from "../../lib/dance-schema.js";
import { readProjectConfig } from "../dot-config.js";
import { hasFlag, parseCsv, readFlag } from "../commands/index.js";
import { readProjectArg } from "../utils/resolvers.js";

export async function runList(args: string[]) {
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
            .map((item) => {
                const rules = summarizeDanceRule(item.dance);
                return {
                    slug: item.dance.slug,
                    name: item.dance.name,
                    description: item.dance.description,
                    category: item.dance.category,
                    tone: rules.tone,
                    structure: rules.structure,
                    source: "custom" as const,
                    customId: item.id
                };
            })
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

export async function runShow(args: string[]) {
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
