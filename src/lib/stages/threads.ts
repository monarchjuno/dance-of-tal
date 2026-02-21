export type ThreadsReplyControl = "everyone" | "accounts_you_follow" | "mentioned_only";

export type PublishThreadsTextInput = {
  accessToken: string;
  userId: string;
  text: string;
  replyControl?: ThreadsReplyControl;
  baseUrl?: string;
  apiVersion?: string;
};

export type PublishThreadsTextResult = {
  containerId: string;
  publishedId: string;
  raw: {
    create: unknown;
    publish: unknown;
  };
};

export type FetchThreadsRecentTextsInput = {
  accessToken: string;
  userId: string;
  limit?: number;
  baseUrl?: string;
  apiVersion?: string;
};

const normalizeBaseUrl = (value?: string) => {
  const base = (value ?? "https://graph.threads.net").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    throw new Error(`Invalid Threads base URL: ${base}`);
  }
  return base;
};

const normalizeApiVersion = (value?: string) => {
  const normalized = (value ?? "v1.0").trim().replace(/^\/+/, "");
  if (!/^v\d+\.\d+$/i.test(normalized)) {
    throw new Error(`Invalid Threads API version: ${normalized}`);
  }
  return normalized;
};

const buildApiUrl = ({
  baseUrl,
  apiVersion,
  userId,
  action
}: {
  baseUrl?: string;
  apiVersion?: string;
  userId: string;
  action: "threads" | "threads_publish";
}) => {
  const base = normalizeBaseUrl(baseUrl);
  const version = normalizeApiVersion(apiVersion);
  return `${base}/${version}/${encodeURIComponent(userId)}/${action}`;
};

const assertOk = async (response: Response) => {
  if (response.ok) return;
  const text = await response.text().catch(() => "");
  throw new Error(`Threads API request failed (${response.status}): ${text || response.statusText}`);
};

const extractContainerId = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Threads create container response is invalid.");
  }
  const maybeId = (payload as { id?: unknown }).id;
  if (typeof maybeId !== "string" || maybeId.trim().length === 0) {
    throw new Error("Threads create container response did not include an id.");
  }
  return maybeId;
};

const extractPublishedId = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Threads publish response is invalid.");
  }
  const maybeId = (payload as { id?: unknown }).id;
  if (typeof maybeId !== "string" || maybeId.trim().length === 0) {
    throw new Error("Threads publish response did not include an id.");
  }
  return maybeId;
};

export const publishThreadsText = async (input: PublishThreadsTextInput): Promise<PublishThreadsTextResult> => {
  const accessToken = input.accessToken.trim();
  const userId = input.userId.trim();
  const text = input.text.trim();

  if (!accessToken) throw new Error("Threads access token is required.");
  if (!userId) throw new Error("Threads user id is required.");
  if (!text) throw new Error("Threads text is required.");
  if (text.length > 500) throw new Error("Threads text is too long. Keep it within 500 characters.");

  const createUrl = buildApiUrl({
    baseUrl: input.baseUrl,
    apiVersion: input.apiVersion,
    userId,
    action: "threads"
  });

  const createBody = new URLSearchParams();
  createBody.set("media_type", "TEXT");
  createBody.set("text", text);
  createBody.set("access_token", accessToken);
  if (input.replyControl) {
    createBody.set("reply_control", input.replyControl);
  }

  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody.toString()
  });
  await assertOk(createResponse);
  const createPayload = (await createResponse.json()) as unknown;
  const containerId = extractContainerId(createPayload);

  const publishUrl = buildApiUrl({
    baseUrl: input.baseUrl,
    apiVersion: input.apiVersion,
    userId,
    action: "threads_publish"
  });

  const publishBody = new URLSearchParams();
  publishBody.set("creation_id", containerId);
  publishBody.set("access_token", accessToken);

  const publishResponse = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishBody.toString()
  });
  await assertOk(publishResponse);
  const publishPayload = (await publishResponse.json()) as unknown;
  const publishedId = extractPublishedId(publishPayload);

  return {
    containerId,
    publishedId,
    raw: {
      create: createPayload,
      publish: publishPayload
    }
  };
};

export const fetchThreadsRecentTexts = async (input: FetchThreadsRecentTextsInput): Promise<string[]> => {
  const accessToken = input.accessToken.trim();
  const userId = input.userId.trim();
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);

  if (!accessToken) throw new Error("Threads access token is required.");
  if (!userId) throw new Error("Threads user id is required.");

  const base = normalizeBaseUrl(input.baseUrl);
  const version = normalizeApiVersion(input.apiVersion);
  const url = new URL(`${base}/${version}/${encodeURIComponent(userId)}/threads`);
  url.searchParams.set("fields", "text");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), { method: "GET" });
  await assertOk(response);
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => (item && typeof item === "object" ? ((item as { text?: unknown }).text ?? "") : ""))
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
};
