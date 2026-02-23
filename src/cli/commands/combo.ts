import { createInterface } from "node:readline/promises";
import { findDance, findTal } from "../../lib/persona.js";
import { ui } from "../utils/ui.js";
import {
  createPresetCombo,
  createComboFromRefs,
  createCustomCombo,
  readProjectConfig,
  setActiveComboById,
  DotTalRef,
  DotDanceRef,
  renameCombo,
  getComboById
} from "../dot-config.js";
import { getResolvedActiveCombo, describeTalRef, describeDanceRef, readProjectArg, refsEqual, resolveTal, resolveDance } from "../utils/resolvers.js";
import { listTals, listDances } from "../../lib/persona.js";
import { readFlag, hasFlag, readExamplesFromFlags, parseCsv, buildInputsFromArgs } from "../utils/flags.js";
import { buildCustomTal, buildCustomDance, resolveUnifiedSources } from "../../lib/customize.js";
import { getProjectChannel } from "../dot-channel-config.js";
import { loadProjectDotEnv, readFirstEnv, readFirstEnvNumber, THREADS_ENV_KEYS } from "../project-env.js";

type RefChoice = {
  id: string;
  ref: DotTalRef | DotDanceRef | null;
  label: string;
  meta?: string;
  aliases?: string[];
};

const isInteractiveTty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

const readChannelMetadataValue = (metadata: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

export async function selectRefChoiceByNumber({
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

export async function runSwitch(args: string[]) {
  const first = args[0];
  const target: "tal" | "dance" | "combo" | undefined =
    first === "tal" || first === "dance" || first === "combo" ? (first as "tal" | "dance" | "combo") : undefined;
  const rest = target ? args.slice(1) : args;
  const projectDir = readProjectArg(rest);

  const config = await readProjectConfig(projectDir);
  if (!config) throw new Error("Project config missing. Run dot init.");

  if (target === "combo") {
    const combos = config.combos;
    if (combos.length === 0) throw new Error("No saved combos yet.");

    const comboIdFromFlag = readFlag(rest, "--id");
    const comboPositional = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
    let comboId = comboIdFromFlag ?? comboPositional;

    if (!comboId) {
      if (!isInteractiveTty()) throw new Error("Usage: dot switch combo <combo-id> [--project /path]");
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
    console.log(JSON.stringify({ message: "Active combo switched.", projectDir: result.projectDir, activeCombo }, null, 2));
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
    if (!selectedChoice) throw new Error(`${target} not found: ${rawSelection}`);
  } else if (isInteractiveTty() && target) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ask = async (prompt: string) => (await rl.question(prompt)).trim();
      selectedChoice = await selectRefChoiceByNumber({ ask, title: target === "tal" ? "Tal" : "Dance", choices: selector });
    } finally {
      rl.close();
    }
  } else {
    throw new Error(`Usage: dot switch ${target} <slug|custom-id|none> [--solo]`);
  }

  const selectedRef = selectedChoice?.ref ?? null;
  const talRef = target === "tal" ? (selectedRef as DotTalRef | null) : preserveOther ? activeCombo?.talRef ?? null : null;
  const danceRef = target === "dance" ? (selectedRef as DotDanceRef | null) : preserveOther ? activeCombo?.danceRef ?? null : null;

  if (!talRef && !danceRef) throw new Error("Switch result is empty.");

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
  console.log(JSON.stringify({ message: "Switched.", projectDir: created.projectDir, activeCombo: newActiveCombo }, null, 2));
}

export async function runUse(args: string[]) {
  const positionalTal = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  const talSlug = readFlag(args, "--tal") ?? positionalTal;
  const danceSlug = readFlag(args, "--dance");
  const comboName = readFlag(args, "--name");
  const projectDir = readProjectArg(args);

  if (!talSlug && !danceSlug) {
    throw new Error("Usage: dot lock <tal-slug> [--dance <dance-slug>] OR dot lock --tal <tal-slug> OR dot lock --dance <dance-slug>");
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

export async function runLock(args: string[]) {
  if (args[0] === "switch") {
    await runSwitch(args.slice(1));
    return;
  }
  await runUse(args);
}

export async function runCombo(args: string[]) {
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
      throw new Error(
        "Usage: dot combo custom --name \"Founder Combo\" --input \"...\" [--example \"Input => Output\"] [--stage threads]"
      );
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
    const stage = readFlag(rest, "--stage");
    const tags = parseCsv(readFlag(rest, "--tags"));
    const examples = readExamplesFromFlags(rest);
    const inputs = buildInputsFromArgs(rest);
    const sources = await resolveUnifiedSources({ inputs });
    let stageContext:
      | {
        threadsAccessToken?: string;
        threadsUserId?: string;
        threadsBaseUrl?: string;
        threadsApiVersion?: string;
        threadsFetchLimit?: number;
      }
      | undefined;

    if (stage?.trim().toLowerCase() === "threads") {
      const channel = await getProjectChannel({ projectDir, name: "threads" });
      const metadata = channel.channel?.metadata ?? {};
      const projectEnv = await loadProjectDotEnv(projectDir);
      const envToken = readFirstEnv({ keys: [...THREADS_ENV_KEYS.accessToken], projectEnv: projectEnv.values });
      const envUserId = readFirstEnv({ keys: [...THREADS_ENV_KEYS.userId], projectEnv: projectEnv.values });
      const envBaseUrl = readFirstEnv({ keys: [...THREADS_ENV_KEYS.baseUrl], projectEnv: projectEnv.values });
      const envApiVersion = readFirstEnv({ keys: [...THREADS_ENV_KEYS.apiVersion], projectEnv: projectEnv.values });
      const envFetchLimit = readFirstEnvNumber({
        keys: [...THREADS_ENV_KEYS.fetchLimit],
        projectEnv: projectEnv.values,
        min: 1,
        max: 20
      });
      const metaUserId = readChannelMetadataValue(metadata, ["userId", "user_id", "threadsUserId", "threads_user_id"]);
      const threadsUserId = readFlag(rest, "--threads-user-id") ?? readFlag(rest, "--user-id") ?? metaUserId ?? envUserId;
      const threadsAccessToken = readFlag(rest, "--threads-token") ?? channel.channel?.auth.token?.trim() ?? envToken;
      if (threadsAccessToken || threadsUserId) {
        stageContext = {
          threadsAccessToken: threadsAccessToken?.trim(),
          threadsUserId: threadsUserId?.trim(),
          threadsBaseUrl: readFlag(rest, "--threads-base-url") ?? metadata.threadsBaseUrl ?? envBaseUrl,
          threadsApiVersion: readFlag(rest, "--threads-api-version") ?? metadata.threadsApiVersion ?? envApiVersion,
          threadsFetchLimit: Number(readFlag(rest, "--threads-limit") ?? "0") || envFetchLimit
        };
      }
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
        sources,
        stage: stage as "generic" | "gpts" | "mcp" | "openclaw" | "threads" | undefined,
        examples,
        stageContext
      })
      : null;

    const stored = await createCustomCombo({
      projectDir,
      name: comboName,
      tal: talResult?.tal ?? undefined,
      dance: danceResult?.dance ?? undefined,
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
          talExtraction: talResult?.extraction ?? null,
          danceExtraction: danceResult?.extraction ?? null,
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
