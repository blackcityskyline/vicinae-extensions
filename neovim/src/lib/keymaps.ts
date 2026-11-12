/**
 * The keymap dump. Measured on nvim 0.12.6: `--headless -S` loads the whole
 * config, `print()` lands on stderr, and that stream carries the JSON and nothing
 * else. So the parse is "the last non-empty line", not a bracket scanner.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type Keymap = {
  lhs: string;
  rhs: string;
  description: string;
};

/** Leader and local leader are replaced by their names so the list reads ` fs`, not `\ fs`. */
const DUMP = `
local leader = vim.g.mapleader or " "
local localleader = vim.g.maplocalleader or " "

local function resolve(lhs)
  if leader ~= "" and lhs:sub(1, #leader) == leader then
    return "<leader>" .. lhs:sub(#leader + 1)
  end
  if localleader ~= "" and localleader ~= leader and lhs:sub(1, #localleader) == localleader then
    return "<localleader>" .. lhs:sub(#localleader + 1)
  end
  return lhs
end

-- Normal mode only: the same key in visual mode is a different binding, and
-- mixing them doubles the list with rows nobody searches for.
local result = {}
for _, map in ipairs(vim.api.nvim_get_keymap("n")) do
  local lhs = map.lhs or ""
  if lhs ~= "" and not lhs:match("^<Plug>") then
    table.insert(result, { lhs = resolve(lhs), rhs = map.rhs or "", desc = map.desc or "" })
  end
end

print(vim.json.encode(result))
vim.cmd("qall!")
`;

/**
 * Measured as one line; a config that prints a `[...]` notice still cannot win,
 * because only a line that parses as an array of maps is accepted, latest first.
 */
export function parseKeymaps(stream: string): Keymap[] {
  const candidates = stream
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("["))
    .reverse();

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      return parsed.map((entry: Record<string, string>) => ({
        lhs: entry.lhs ?? "",
        rhs: entry.rhs ?? "",
        description: entry.desc || entry.rhs || "",
      }));
    } catch {
      // Not the payload; keep looking at earlier lines.
    }
  }

  throw new Error("Neovim printed no keymap table.");
}

/** The dump itself lives in a temp file because Lua is easier to read than an argv string. */
export async function readKeymaps(nvim: string): Promise<Keymap[]> {
  const script = path.join(os.tmpdir(), `vicinae-nvim-keymaps-${process.pid}.lua`);
  fs.writeFileSync(script, DUMP);

  try {
    // print() goes to stderr here, so both streams are read and the JSON line picked out.
    const { stdout, stderr } = await execFileAsync(nvim, ["--headless", "-S", script], { timeout: 20_000 });
    return parseKeymaps(`${stderr}\n${stdout}`);
  } finally {
    fs.rmSync(script, { force: true });
  }
}
