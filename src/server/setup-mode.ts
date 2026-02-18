export const SOURCE_TYPES = ["text", "file", "url"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type SetupMode = "preset" | "custom" | "hybrid";
export type SetupModeIntent = "auto" | SetupMode;

export type SetupModeAdvice = {
  suggestedMode: SetupMode;
  confidence: "high" | "medium";
  reasons: string[];
  questions: string[];
  nextAction: string;
};

const containsAny = (value: string, patterns: string[]) => patterns.some((pattern) => value.includes(pattern));

export const buildSetupModeAdvice = ({
  goal,
  mode = "auto",
  hasUserSources = false,
  sourceTypes = [],
  userNote
}: {
  goal: string;
  mode?: SetupModeIntent;
  hasUserSources?: boolean;
  sourceTypes?: SourceType[];
  userNote?: string;
}): SetupModeAdvice => {
  const normalized = [goal, userNote ?? ""].join(" ").toLowerCase();
  const customSignals = [
    "custom",
    "customize",
    "my style",
    "based on",
    "from docs",
    "from file",
    "from url",
    "link",
    "transcript",
    "company voice",
    "brand voice",
    "커스텀",
    "맞춤",
    "내 자료",
    "문서",
    "링크",
    "웹서치"
  ];
  const presetSignals = [
    "preset",
    "recommended",
    "best combo",
    "public figure",
    "elon",
    "sam altman",
    "founder style",
    "프리셋",
    "추천"
  ];
  const hybridSignals = ["tweak preset", "customize preset", "preset + custom", "preset and customize", "혼합", "튜닝", "조정"];

  if (mode && mode !== "auto") {
    const reasons = [`User requested ${mode} mode explicitly.`];
    const questions =
      mode === "preset"
        ? ["Which category should I prioritize first?", "Use one preset combo now and refine later?"]
        : mode === "custom"
          ? ["What source should I use first: text, file, or URL?", "Build custom Tal, Dance, or both?"]
          : ["Pick a base preset first?", "Which layer should be customized first: Tal, Dance, or both?"];

    return {
      suggestedMode: mode,
      confidence: "high",
      reasons,
      questions,
      nextAction: mode === "preset" ? "Call initialize_styling_session and choose a preset combo." : "Collect source direction, then build custom Tal/Dance."
    };
  }

  const customScore = (hasUserSources ? 2 : 0) + (sourceTypes.length > 0 ? 1 : 0) + (containsAny(normalized, customSignals) ? 2 : 0);
  const presetScore = (containsAny(normalized, presetSignals) ? 2 : 0) + (containsAny(normalized, ["style", "처럼", "같은"]) ? 1 : 0);
  const hybridScore = (containsAny(normalized, hybridSignals) ? 2 : 0) + (customScore > 0 && presetScore > 0 ? 2 : 0);

  if (hybridScore >= customScore && hybridScore >= presetScore && hybridScore > 0) {
    return {
      suggestedMode: "hybrid",
      confidence: hybridScore >= 3 ? "high" : "medium",
      reasons: ["Both preset and customization signals detected.", "Best path is quick preset start with targeted tuning."],
      questions: ["Start from a preset combo, then customize?", "What should be customized first: thinking, output pattern, or both?"],
      nextAction: "Recommend 3 preset combos, lock one, then collect custom inputs for refinement."
    };
  }

  if (customScore > presetScore) {
    return {
      suggestedMode: "custom",
      confidence: customScore >= 3 ? "high" : "medium",
      reasons: [
        hasUserSources || sourceTypes.length > 0 ? "User-provided source signals detected." : "Custom-style intent detected from goal wording."
      ],
      questions: ["Please share your source direction (text/file/url).", "Should I build custom Tal, custom Dance, or both?"],
      nextAction: "Collect minimal source inputs and build custom Tal/Dance before activation."
    };
  }

  return {
    suggestedMode: "preset",
    confidence: presetScore >= 2 ? "high" : "medium",
    reasons: ["Preset-oriented intent detected or custom signal is weak.", "Fastest path is selecting a preset combo first."],
    questions: ["Which domain/category should I prioritize?", "Apply one preset combo now?"],
    nextAction: "Call initialize_styling_session and choose from recommended preset combos."
  };
};
