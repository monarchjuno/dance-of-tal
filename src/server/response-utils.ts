import type { ActComboOption, ActRecommendation } from "../lib/act.js";

export const SYSTEM_INSTRUCTION_HEADER = [
  "System Instruction:",
  "You are an AI assistant.",
  "Follow the reasoning rules first, then produce output using the response style rules.",
  "Keep reasoning disciplined and produce outputs and behavior that match the required tone, format, and operating constraints."
].join("\n");

const summarizeComboOption = (combo: ActComboOption) => ({
  talSlug: combo.talSlug,
  talName: combo.talName,
  danceSlug: combo.danceSlug,
  danceName: combo.danceName,
  reason: combo.reason
});

export const summarizeRecommendation = (recommendation: ActRecommendation, limit = 5) => ({
  matchedHintIds: recommendation.matchedHintIds,
  nextBestCombo: recommendation.nextBestCombo ? summarizeComboOption(recommendation.nextBestCombo) : null,
  comboOptions: recommendation.comboOptions.slice(0, limit).map(summarizeComboOption)
});

export const textResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }]
});
