import { ui } from "../utils/ui.js";

export const handleTutorialCommand = async () => {
    console.log(ui.title("Welcome to Dance of Tal!"));
    console.log("");
    console.log("This interactive tutorial will guide you through the core concepts:");
    console.log("  1. Tal (Mind/Soul) - How your AI thinks and reasons.");
    console.log("  2. Dance (Body/Choreography) - How your AI articulates and formats outputs.");
    console.log("  3. Act (Process/Scene) - Step-by-step sequences for specific tasks.");
    console.log("");
    console.log("Together, they form a Combo that enforces robust operational behavior.");
    console.log("");
    console.log(ui.step("To get started in your own project, try:"));
    console.log(`  ${ui.command("dot init")}`);
    console.log("");
    console.log(ui.dim("Interactive tutorial steps coming soon!"));
};
