import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Dance, Tal } from "../data/types.js";

export type SourceKind = "text" | "file" | "url";

export type CustomSource = {
  type: SourceKind;
  value: string;
  label?: string;
};

export type SourceDigestItem = {
  type: SourceKind;
  label: string;
  length: number;
};

export type BuildCustomTalInput = {
  name: string;
  category?: string;
  tags?: string[];
  description?: string;
  goal?: string;
  sources: CustomSource[];
};

export type BuildCustomDanceInput = {
  name: string;
  category?: string;
  tags?: string[];
  description?: string;
  goal?: string;
  sources: CustomSource[];
};

const MAX_SOURCE_BYTES = 500_000;
const MAX_MERGED_CHARS = 45_000;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "have",
  "will",
  "your",
  "about",
  "into",
  "their",
  "they",
  "them",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "is",
  "are",
  "be",
  "as",
  "by",
  "at",
  "or",
  "if",
  "not",
  "do",
  "dont",
  "can",
  "just",
  "than",
  "then",
  "also",
  "you",
  "we",
  "it",
  "our",
  "us"
]);

const KEYWORD_TO_CATEGORY: Array<{ category: string; keywords: string[] }> = [
  { category: "Strategy", keywords: ["strategy", "roadmap", "priority", "tradeoff", "risk", "decision"] },
  { category: "Product", keywords: ["product", "feature", "onboarding", "ux", "mvp", "requirements"] },
  { category: "Growth", keywords: ["growth", "funnel", "retention", "activation", "experiment", "acquisition"] },
  { category: "Research", keywords: ["research", "source", "evidence", "insight", "validation", "interview"] },
  { category: "Brand", keywords: ["brand", "positioning", "message", "narrative", "campaign"] },
  { category: "Developer", keywords: ["api", "code", "architecture", "repository", "sdk", "mcp"] },
  { category: "Operations", keywords: ["incident", "operations", "sla", "runbook", "process", "escalation"] },
  { category: "Education", keywords: ["teach", "lesson", "learning", "curriculum", "coach", "exam"] },
  { category: "Creator", keywords: ["content", "script", "creator", "youtube", "audience", "viral"] },
  { category: "Analytics", keywords: ["kpi", "metric", "dashboard", "cohort", "forecast", "attribution"] },
  { category: "Writing", keywords: ["writing", "copy", "headline", "email", "article", "edit"] },
  { category: "Public Case", keywords: ["public", "founder", "ceo", "influencer", "case", "persona"] },
  { category: "Executive", keywords: ["executive", "board", "investor", "brief", "memo"] }
];

const EXT_ALLOWLIST = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".xml",
  ".html",
  ".htm",
  ".log"
]);

const toBullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

const cleanText = (text: string) =>
  text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

const todayISO = () => new Date().toISOString().slice(0, 10);

const extractKeywords = (text: string, topN = 8) => {
  const counts = new Map<string, number>();
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
};

const inferCategory = (text: string, fallback: string) => {
  const lower = text.toLowerCase();
  let best = { category: fallback, score: 0 };
  for (const item of KEYWORD_TO_CATEGORY) {
    const score = item.keywords.reduce((acc, keyword) => acc + (lower.includes(keyword) ? 1 : 0), 0);
    if (score > best.score) {
      best = { category: item.category, score };
    }
  }
  return best.category;
};

const inferTone = (text: string) => {
  const lower = text.toLowerCase();
  const tone: string[] = [];
  if (/(board|investor|executive|brief|memo)/.test(lower)) tone.push("executive");
  if (/(urgent|asap|immediately|deadline|critical)/.test(lower)) tone.push("high-urgency");
  if (/(data|metric|kpi|analysis|evidence)/.test(lower)) tone.push("evidence-first");
  if (/(simple|clear|plain|easy)/.test(lower)) tone.push("clear");
  if (/(story|emotion|narrative|creative)/.test(lower)) tone.push("story-led");
  if (tone.length === 0) tone.push("practical", "clear");
  return Array.from(new Set(tone)).slice(0, 4);
};

const inferStructure = (text: string) => {
  const lower = text.toLowerCase();
  if (/(experiment|hypothesis|variant|result)/.test(lower)) return ["hypothesis", "test design", "result readout", "next iteration"];
  if (/(research|source|evidence|confidence)/.test(lower)) return ["question", "evidence", "insight", "confidence and limits"];
  if (/(investor|board|executive|decision)/.test(lower)) return ["context", "options", "recommendation", "owner and timeline"];
  if (/(lesson|learning|teach|tutorial)/.test(lower)) return ["objective", "concept", "example", "practice"];
  return ["context", "core point", "action steps", "next checkpoint"];
};

const inferFormatting = (text: string) => {
  const lower = text.toLowerCase();
  const items: string[] = ["short paragraphs", "bullet lists"];
  if (/(table|matrix)/.test(lower)) items.push("tables or matrix when needed");
  if (/(metric|kpi|number|data)/.test(lower)) items.push("highlight key metrics");
  if (/(owner|deadline|timeline)/.test(lower)) items.push("owner + timeline callout");
  return Array.from(new Set(items)).slice(0, 4);
};

const inferForbidden = (text: string) => {
  const lower = text.toLowerCase();
  const items = ["vague claims", "unstructured rambling"];
  if (/(data|metric|evidence)/.test(lower)) items.push("unsupported statements");
  if (/(urgent|critical|deadline)/.test(lower)) items.push("soft commitments without owners");
  return Array.from(new Set(items)).slice(0, 4);
};

const inferRhythm = (text: string) => {
  const lower = text.toLowerCase();
  if (/(urgent|critical|asap|war room)/.test(lower)) return "rapid and decisive";
  if (/(research|evidence|analysis)/.test(lower)) return "methodical and evidence-paced";
  if (/(story|creative|creator)/.test(lower)) return "hook -> insight -> payoff";
  return "clear and steady";
};

const normalizeTag = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const resolveFileText = async (value: string) => {
  const rawPath = value.trim();
  if (!rawPath) throw new Error("Empty file path");
  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  const ext = path.extname(resolvedPath).toLowerCase();
  if (ext && !EXT_ALLOWLIST.has(ext)) {
    throw new Error(`Unsupported file extension for text ingestion: ${ext}`);
  }

  const info = await stat(resolvedPath);
  if (info.size > MAX_SOURCE_BYTES) {
    throw new Error(`File is too large (${info.size} bytes). Max allowed is ${MAX_SOURCE_BYTES} bytes.`);
  }
  return readFile(resolvedPath, "utf8");
};

const resolveUrlText = async (value: string) => {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(parsed.toString(), { signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Failed to fetch URL (${response.status}): ${parsed.toString()}`);
    }
    const text = await response.text();
    return cleanText(text);
  } finally {
    clearTimeout(timeoutId);
  }
};

const mergeSources = async (sources: CustomSource[]) => {
  const merged: string[] = [];
  const digest: SourceDigestItem[] = [];

  for (const source of sources) {
    let content = "";
    if (source.type === "text") {
      content = source.value.trim();
    } else if (source.type === "file") {
      content = await resolveFileText(source.value);
    } else {
      content = await resolveUrlText(source.value);
    }

    const cleaned = cleanText(content);
    if (!cleaned) continue;
    merged.push(cleaned);
    digest.push({
      type: source.type,
      label: source.label?.trim() || source.value.slice(0, 120),
      length: cleaned.length
    });
  }

  const mergedText = merged.join("\n\n").slice(0, MAX_MERGED_CHARS);
  if (!mergedText.trim()) {
    throw new Error("No usable text could be extracted from the provided sources.");
  }
  return { mergedText, digest };
};

export const buildThinkingPromptFromTal = (tal: Tal) =>
  [
    "Reasoning Rules:",
    `Profile: ${tal.name}`,
    "Core principles:",
    toBullets(tal.thinking.principles),
    "Do:",
    toBullets(tal.thinking.do),
    "Do not:",
    toBullets(tal.thinking.dont),
    "Checklist:",
    toBullets(tal.thinking.checklist)
  ].join("\n");

export const buildOutputPromptFromDance = (dance: Dance) =>
  [
    "Response Style Rules:",
    `Style Profile: ${dance.name}`,
    "Tone:",
    toBullets(dance.tone),
    "Structure:",
    toBullets(dance.structure),
    "Formatting:",
    toBullets(dance.formatting),
    "Forbidden:",
    toBullets(dance.forbidden),
    dance.rhythm ? `Rhythm: ${dance.rhythm}` : ""
  ]
    .filter(Boolean)
    .join("\n");

export const buildCustomTal = async (input: BuildCustomTalInput) => {
  const { mergedText, digest } = await mergeSources(input.sources);
  const keywords = extractKeywords(mergedText, 10);
  const sentences = splitSentences(mergedText);
  const category = input.category?.trim() || inferCategory(mergedText, "Strategy");
  const name = input.name.trim();
  const slug = `${slugify(name)}-custom-tal`;
  const goal = input.goal?.trim();

  const principles = [
    goal ? `Optimize decisions for: ${goal}` : "Start from explicit objective and constraints.",
    keywords[0] ? `Treat "${keywords[0]}" as a first-class signal in decision making.` : "Prioritize highest-leverage drivers first.",
    keywords[1] ? `Use "${keywords[1]}" as a validation axis before finalizing output.` : "Separate assumptions from verified evidence."
  ];

  const doList = [
    "State assumptions and tradeoffs in plain language.",
    "Convert analysis into concrete next actions with owners.",
    keywords[2] ? `Reference source evidence around "${keywords[2]}".` : "Anchor conclusions to source evidence."
  ];

  const dontList = [
    "Do not produce vague recommendations without execution detail.",
    "Do not hide uncertainty or missing evidence."
  ];

  const checklist = [
    "Is the objective explicit and measurable?",
    "Are key assumptions and risks visible?",
    "Is there a concrete next step with ownership?"
  ];

  const tags = Array.from(
    new Set([...(input.tags ?? []).map(normalizeTag).filter(Boolean), ...keywords.slice(0, 4).map(normalizeTag), "custom", "user-derived"])
  ).slice(0, 8);

  const tal: Tal = {
    slug,
    name: name.endsWith("Tal") ? name : `${name} Tal`,
    description: input.description?.trim() || `Custom Tal generated from user-provided sources for ${category.toLowerCase()} workflows.`,
    category,
    tags,
    featuredScore: 110,
    createdAt: todayISO(),
    thinking: {
      principles,
      do: doList,
      dont: dontList,
      checklist
    }
  };

  return {
    tal,
    thinkingPrompt: buildThinkingPromptFromTal(tal),
    sourceDigest: digest,
    extraction: {
      topKeywords: keywords.slice(0, 8),
      sampleSentences: sentences.slice(0, 3)
    }
  };
};

export const buildCustomDance = async (input: BuildCustomDanceInput) => {
  const { mergedText, digest } = await mergeSources(input.sources);
  const keywords = extractKeywords(mergedText, 10);
  const category = input.category?.trim() || inferCategory(mergedText, "Executive");
  const name = input.name.trim();
  const slug = `${slugify(name)}-custom-dance`;
  const tone = inferTone(mergedText);
  const structure = inferStructure(mergedText);
  const formatting = inferFormatting(mergedText);
  const forbidden = inferForbidden(mergedText);
  const rhythm = inferRhythm(mergedText);

  const dance: Dance = {
    slug,
    name,
    description: input.description?.trim() || `Custom Dance generated from user-provided sources for ${category.toLowerCase()} outputs.`,
    category,
    tone,
    structure,
    formatting,
    forbidden,
    rhythm,
    examples: [
      {
        input: input.goal?.trim() || "Need a custom response style for this assistant.",
        output: `Return outputs using ${name} with concise structure and consistent delivery.`
      },
      {
        input: "Draft this in the configured custom style.",
        output: "Produce a practical, structured answer that follows the selected tone, formatting, and constraints."
      }
    ]
  };

  return {
    dance,
    outputPrompt: buildOutputPromptFromDance(dance),
    sourceDigest: digest,
    extraction: {
      topKeywords: keywords.slice(0, 8)
    }
  };
};

export const buildCustomTalDance = async (input: {
  name: string;
  talCategory?: string;
  danceCategory?: string;
  tags?: string[];
  goal?: string;
  sources: CustomSource[];
}) => {
  const [talResult, danceResult] = await Promise.all([
    buildCustomTal({
      name: input.name,
      category: input.talCategory,
      tags: input.tags,
      goal: input.goal,
      sources: input.sources
    }),
    buildCustomDance({
      name: input.name,
      category: input.danceCategory,
      tags: input.tags,
      goal: input.goal,
      sources: input.sources
    })
  ]);

  return {
    tal: talResult.tal,
    dance: danceResult.dance,
    thinkingPrompt: talResult.thinkingPrompt,
    outputPrompt: danceResult.outputPrompt,
    combinedPrompt: [talResult.thinkingPrompt, danceResult.outputPrompt].join("\n\n"),
    sourceDigest: talResult.sourceDigest
  };
};
