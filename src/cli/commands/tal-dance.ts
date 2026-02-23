import { ui } from "../utils/ui.js";

export const handlePickCommand = async (args: string[]) => {
  console.log(ui.section("Pick Tool"));
};

export const handleLockCommand = async (args: string[]) => {
  console.log(ui.section("Lock Tool"));
};

export const handleSwitchCommand = async (args: string[]) => {
  console.log(ui.section("Switch Tool"));
};
