export const readFlag = (args: string[], flag: string) => {
    const idx = args.findIndex((item) => item === flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
};

export const hasFlag = (args: string[], flag: string) => args.includes(flag);

export const parseCsv = (value?: string) => {
    if (!value) return undefined;
    const items = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length > 0 ? items : undefined;
};

export const readFlags = (args: string[], flag: string) => {
    const values: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
    }
    return values;
};

export const parseMetadataFlags = (args: string[]) => {
    const entries = readFlags(args, "--meta");
    const metadata: Record<string, string> = {};
    for (const entry of entries) {
        const [keyRaw, ...valueParts] = entry.split("=");
        const key = keyRaw?.trim();
        const value = valueParts.join("=").trim();
        if (!key || !value) continue;
        metadata[key] = value;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
};

export const readExamplesFromFlags = (args: string[]) =>
    readFlags(args, "--example")
        .map((item) => item.trim())
        .filter(Boolean);

export const buildInputsFromArgs = (args: string[]) => {
    const unifiedInputs = readFlags(args, "--input");
    const legacyText = readFlags(args, "--text");
    const legacyFile = readFlags(args, "--file");
    const legacyUrl = readFlags(args, "--url");
    return [...unifiedInputs, ...legacyText, ...legacyFile, ...legacyUrl];
};

export const isMode = (value: string): value is "thinking" | "output" | "combined" => {
    return value === "thinking" || value === "output" || value === "combined";
};

export const isInteractiveTty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);
