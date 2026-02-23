import { readProjectArg } from "../utils/resolvers.js";
import { readFlag, parseMetadataFlags } from "../utils/flags.js";
import { getProjectChannel, listProjectChannels, removeProjectChannel, upsertProjectChannel } from "../dot-channel-config.js";

export async function runChannel(args: string[]) {
  const sub = args[0];

  if (sub === "list") {
    const projectDir = readProjectArg(args.slice(1));
    const result = await listProjectChannels(projectDir);
    console.log(
      JSON.stringify(
        {
          projectDir: result.projectDir,
          channelsPath: result.channelsPath,
          count: result.items.length,
          items: result.items.map((item) => ({
            name: item.name,
            enabled: item.enabled,
            connectedAt: item.connectedAt,
            updatedAt: item.updatedAt,
            hasToken: Boolean(item.auth.token),
            hasApiKey: Boolean(item.auth.apiKey),
            metadataKeys: Object.keys(item.metadata ?? {})
          }))
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "show") {
    const name = args[1];
    if (!name || name.startsWith("--")) {
      throw new Error("Usage: dot channel show <channel-name> [--project /path]");
    }
    const projectDir = readProjectArg(args.slice(2));
    const result = await getProjectChannel({ projectDir, name });
    if (!result.channel) {
      throw new Error(`Channel not configured: ${name}`);
    }

    console.log(
      JSON.stringify(
        {
          projectDir: result.projectDir,
          channel: {
            ...result.channel,
            auth: {
              hasToken: Boolean(result.channel.auth.token),
              hasApiKey: Boolean(result.channel.auth.apiKey)
            }
          }
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "connect") {
    const name = args[1];
    if (!name || name.startsWith("--")) {
      throw new Error("Usage: dot channel connect <channel-name> [--token ...] [--api-key ...] [--meta key=value] [--project /path]");
    }
    const rest = args.slice(2);
    const projectDir = readProjectArg(rest);
    const token = readFlag(rest, "--token");
    const apiKey = readFlag(rest, "--api-key");
    const metadata = parseMetadataFlags(rest);

    const result = await upsertProjectChannel({
      projectDir,
      name,
      token,
      apiKey,
      metadata
    });

    console.log(
      JSON.stringify(
        {
          message: "Channel connected/updated.",
          projectDir: result.projectDir,
          channelName: name
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "disconnect") {
    const name = args[1];
    if (!name || name.startsWith("--")) {
      throw new Error("Usage: dot channel disconnect <channel-name> [--project /path]");
    }
    const projectDir = readProjectArg(args.slice(2));
    const result = await removeProjectChannel({ projectDir, name });
    console.log(
      JSON.stringify(
        {
          message: "Channel disconnected/removed.",
          projectDir: result.projectDir,
          channelName: name
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error("Usage: dot channel list|show|connect|disconnect ...");
}
