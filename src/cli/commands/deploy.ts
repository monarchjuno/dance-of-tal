import { parseMetadataFlags } from "../utils/flags.js";
import { buildTargetSetup, isDeployStage, DeployStage } from "../utils/targets.js";
import { getResolvedActiveCombo, readProjectArg } from "../utils/resolvers.js";
import { buildRunPackageFromSelection } from "../utils/prompts.js";
import { readFlag } from "../utils/flags.js";
import { publishThreadsTextChain, splitThreadsText } from "../../lib/stages/threads.js";
import { loadProjectDotEnv, readFirstEnv } from "../project-env.js";

export async function runDeploy(args: string[]) {
    const stageRaw = readFlag(args, "--stage");
    if (!stageRaw || !isDeployStage(stageRaw)) {
        throw new Error("Usage: dot deploy --stage gpts|mcp|openclaw|threads|my-aws-server [--publish] ...");
    }

    const projectDir = readProjectArg(args);
    const resolved = await getResolvedActiveCombo(projectDir);
    const task = readFlag(args, "--task") ?? "Describe your task here.";
    const act = null; // To be implemented later, deploy ignores act for now
    const packageText = resolved
        ? buildRunPackageFromSelection({ tal: resolved.tal, dance: resolved.dance, act, task })
        : "No active combo.";

    const publishMode = args.includes("--publish");

    if (stageRaw === "threads") {
        const textOverride = readFlag(args, "--text");
        const threadContent = textOverride ? textOverride : packageText;

        if (!publishMode) {
            console.log(
                JSON.stringify(
                    {
                        stage: "threads",
                        action: "preview",
                        projectDir,
                        content: threadContent,
                        chunks: splitThreadsText(threadContent),
                        hint: "Add --publish to broadcast to Threads."
                    },
                    null,
                    2
                )
            );
            return;
        }

        try {
            const projectEnvResult = await loadProjectDotEnv(projectDir);
            const token = readFirstEnv({
                keys: [
                    "DANCE_OF_TAL_THREADS_TOKEN",
                    "THREADS_TOKEN",
                    "THREADS_ACCESS_TOKEN"
                ],
                projectEnv: projectEnvResult.values
            });

            const userIdFromEnv = readFirstEnv({
                keys: ["DANCE_OF_TAL_THREADS_USER_ID", "THREADS_USER_ID"],
                projectEnv: projectEnvResult.values
            });
            const metadataValue = parseMetadataFlags(args);
            const userIdFromFlag = typeof metadataValue?.userId === "string" ? metadataValue.userId : null;
            const finalUserId = userIdFromFlag || userIdFromEnv;

            const controlRaw = readFlag(args, "--reply-control");
            const replyControl =
                controlRaw === "everyone" || controlRaw === "accounts_you_follow" || controlRaw === "mentioned_only"
                    ? (controlRaw as "everyone" | "accounts_you_follow" | "mentioned_only")
                    : undefined;

            if (!token) throw new Error("Missing Threads Token in channel config or Env.");
            if (!finalUserId) throw new Error("Missing userId in channel meta or Env.");

            const result = await publishThreadsTextChain({
                text: threadContent,
                userId: finalUserId,
                accessToken: token,
                replyControl
            });

            console.log(
                JSON.stringify(
                    {
                        stage: "threads",
                        action: "published",
                        projectDir,
                        publishedIds: result
                    },
                    null,
                    2
                )
            );
        } catch (e: any) {
            console.log(
                JSON.stringify(
                    {
                        stage: "threads",
                        error: e.message
                    },
                    null,
                    2
                )
            );
        }
        return;
    }

    const targetSetup = buildTargetSetup(stageRaw as any);
    console.log(
        JSON.stringify(
            {
                stage: stageRaw,
                action: publishMode ? "published (no-op for this stage)" : "preview",
                projectDir,
                packageText,
                setup: targetSetup
            },
            null,
            2
        )
    );
}
