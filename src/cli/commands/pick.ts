import { ui, printUsage } from "../utils/ui.js";
import { readFlag, hasFlag } from "./index.js";
import { resolveProjectDir } from "../dot-config.js";

export const handlePickCommand = async (args: string[]) => {
  console.log(ui.section("Pick Tool"));
  console.log("Future logic for picking a Tal or Dance");
};
