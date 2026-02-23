import { clearActiveCombo } from "../dot-config.js";
import { readProjectArg } from "../utils/resolvers.js";

export async function runClear(args: string[]) {
    const projectDir = readProjectArg(args);
    const result = await clearActiveCombo(projectDir);
    console.log(
        JSON.stringify(
            {
                message: "Active combo cleared.",
                projectDir: result.projectDir,
                configPath: result.configPath,
                activeComboId: result.config.activeComboId
            },
            null,
            2
        )
    );
}
