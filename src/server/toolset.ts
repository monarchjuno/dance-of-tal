export const ALL_TOOLS = [
  "workflow_overview",
  "advise_setup_mode",
  "initialize_styling_session",
  "next_combo",
  "set_active_combo",
  "get_session",
  "list_sessions",
  "run_active_combo",
  "clear_session",
  "list_tals",
  "get_tal",
  "list_dances",
  "get_dance",
  "list_dance_categories",
  "recommend_dance_categories",
  "get_data_summary",
  "get_recommended_combos",
  "build_prompt",
  "quick_apply",
  "build_openclaw_profile",
  "build_custom_tal",
  "build_custom_dance",
  "build_custom_tal_dance",
  "abstract_tal_dance",
  "get_gpts_bootstrap",
  "list_gpts_tals",
  "list_gpts_dances",
  "recommend_gpts"
] as const;

export const CORE_TOOLS = [
  "workflow_overview",
  "advise_setup_mode",
  "initialize_styling_session",
  "next_combo",
  "set_active_combo",
  "get_session",
  "run_active_combo",
  "clear_session",
  "list_tals",
  "get_tal",
  "list_dances",
  "get_dance",
  "build_prompt",
  "quick_apply",
  "recommend_gpts"
] as const;

export const STANDARD_TOOLS = [
  ...CORE_TOOLS,
  "list_sessions",
  "list_dance_categories",
  "recommend_dance_categories",
  "get_recommended_combos",
  "build_openclaw_profile",
  "build_custom_tal",
  "build_custom_dance",
  "build_custom_tal_dance",
  "abstract_tal_dance"
] as const;

export type ToolName = (typeof ALL_TOOLS)[number];

const normalizeToolName = (value: string) => value.toLowerCase().trim().replace(/\s+/g, "_");
const ALL_TOOL_SET = new Set<string>(ALL_TOOLS);

export const resolveToolSet = () => {
  const raw = (process.env.DANCE_OF_TAL_TOOLS ?? "standard").trim();
  const mode = raw.toLowerCase();

  if (mode === "all") return new Set<string>(ALL_TOOLS);
  if (mode === "standard" || mode === "default") return new Set<string>(STANDARD_TOOLS);
  if (mode === "core" || mode === "lean") return new Set<string>(CORE_TOOLS);

  const requested = raw
    .split(",")
    .map((token) => normalizeToolName(token))
    .filter(Boolean);

  if (requested.length === 0) {
    return new Set<string>(STANDARD_TOOLS);
  }

  const unknown = requested.filter((tool) => !ALL_TOOL_SET.has(tool));
  if (unknown.length > 0) {
    console.error(`[dance-of-tal] Ignoring unknown tools in DANCE_OF_TAL_TOOLS: ${unknown.join(", ")}`);
  }

  const resolved = requested.filter((tool) => ALL_TOOL_SET.has(tool));
  if (resolved.length === 0) {
    return new Set<string>(STANDARD_TOOLS);
  }

  return new Set<string>(resolved);
};
