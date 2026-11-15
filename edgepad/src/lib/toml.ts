/**
 * edgepad's config file, read and edited as text.
 *
 * The file is the user's: comments, ordering and keys this extension does not
 * know all stay where they are. Bindings are located as line ranges and only the
 * edited block is replaced, so a save never rewrites the whole document.
 *
 * The grammar this understands is the subset edgepad itself accepts: top-level
 * `key = value` lines, then `[[gestures]]` and `[[sliders]]` tables.
 */

export const ZONES = ["left", "right", "top", "bottom", "pad"] as const;
export type Zone = (typeof ZONES)[number];

export const EDGE_ZONES = ["left", "right", "top", "bottom"] as const;
export type EdgeZone = (typeof EDGE_ZONES)[number];

export const DIRECTIONS = ["up", "down", "left", "right", "tap", "double-tap"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type GestureAction = { kind: "command"; argv: string[] } | { kind: "log" };

export type Gesture = {
  zone: Zone;
  direction: Direction;
  /** Omitted means any finger count. */
  fingers?: number;
  action: GestureAction;
};

export type Slider = {
  zone: EdgeZone;
  step: number;
  up?: string[];
  down?: string[];
  left?: string[];
  right?: string[];
};

export type TomlValue = string | number | boolean | string[] | { log: true };

type Assign = { key: string; value: TomlValue | undefined; start: number; end: number };

type Block = {
  kind: "gestures" | "sliders" | "other";
  start: number;
  /** Exclusive: the line after the block's last assignment. */
  end: number;
  assigns: Assign[];
};

export type GestureBinding = { index: number; value: Gesture; block: Block };
export type SliderBinding = { index: number; value: Slider; block: Block };

export type ParsedConfig = {
  eol: "\n" | "\r\n";
  lines: string[];
  settings: Map<string, Assign>;
  blocks: Block[];
  gestures: GestureBinding[];
  sliders: SliderBinding[];
  /** Bindings edgepad would reject, described for the UI. */
  issues: string[];
};

function eolOf(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Removes `# comments`, leaving `#` inside strings alone. */
function stripComments(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      let out = "";
      let quote: string | null = null;
      let escaped = false;
      for (const ch of line) {
        if (escaped) {
          out += ch;
          escaped = false;
        } else if (quote === '"' && ch === "\\") {
          out += ch;
          escaped = true;
        } else if (quote) {
          out += ch;
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
          out += ch;
        } else if (ch === "#") {
          break;
        } else {
          out += ch;
        }
      }
      return out;
    })
    .join("\n");
}

function scan(raw: string): { square: number; curly: number; openQuote: boolean } {
  let square = 0;
  let curly = 0;
  let quote: string | null = null;
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      escaped = false;
    } else if (quote === '"' && ch === "\\") {
      escaped = true;
    } else if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[") {
      square++;
    } else if (ch === "]") {
      square--;
    } else if (ch === "{") {
      curly++;
    } else if (ch === "}") {
      curly--;
    }
  }
  return { square, curly, openQuote: quote !== null };
}

/** False while an array, inline table or string continues onto the next line. */
function valueComplete(raw: string): boolean {
  const s = raw.trim();
  if (s === "") return true;
  const { square, curly, openQuote } = scan(s);
  if (s.startsWith("[")) return square <= 0 && !openQuote;
  if (s.startsWith("{")) return curly <= 0 && !openQuote;
  return !openQuote;
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1);
  return s;
}

/** Splits on commas that are not inside a string or a nested bracket. */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  let depth = 0;
  for (const ch of inner) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (quote === '"' && ch === "\\") {
      current += ch;
      escaped = true;
    } else if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "[" || ch === "{") {
      depth++;
      current += ch;
    } else if (ch === "]" || ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "" || parts.length > 0) parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function parseArray(raw: string): string[] | undefined {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return undefined;
  return splitTopLevel(s.slice(1, -1)).map(unquote);
}

function parseValue(raw: string): TomlValue | undefined {
  const s = stripComments(raw).trim();
  if (s === "") return undefined;
  if (s.startsWith("[")) return parseArray(s);
  if (s.startsWith("{")) {
    return /\blog\s*=\s*true\b/.test(stripComments(s)) ? { log: true } : undefined;
  }
  if (s.startsWith('"') || s.startsWith("'")) return unquote(s);
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return undefined;
}

function parseBlockKind(name: string): Block["kind"] {
  if (name === "gestures" || name === "sliders") return name;
  return "other";
}

export function parseConfig(text: string): ParsedConfig {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const settings = new Map<string, Assign>();
  const blocks: Block[] = [];
  let current: Block | null = null;

  const close = () => {
    if (!current) return;
    const last = current.assigns[current.assigns.length - 1];
    current.end = last ? last.end + 1 : current.start + 1;
    blocks.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const arrayHeader = /^\[\[\s*([A-Za-z0-9_.-]+)\s*\]\]$/.exec(trimmed);
    if (arrayHeader) {
      close();
      current = { kind: parseBlockKind(arrayHeader[1] ?? ""), start: i, end: i + 1, assigns: [] };
      continue;
    }

    const tableHeader = /^\[([^\]]+)\]$/.exec(trimmed);
    if (tableHeader) {
      close();
      current = { kind: "other", start: i, end: i + 1, assigns: [] };
      continue;
    }

    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    let end = i;
    let raw = match[2] ?? "";
    while (!valueComplete(raw) && end + 1 < lines.length) {
      end++;
      raw += `\n${lines[end] ?? ""}`;
    }

    const assign: Assign = { key: match[1] ?? "", value: parseValue(raw), start: i, end };
    if (current) {
      (current as Block).assigns.push(assign);
    } else {
      settings.set(assign.key, assign);
    }
    i = end;
  }
  close();

  const gestures: GestureBinding[] = [];
  const sliders: SliderBinding[] = [];
  const issues: string[] = [];

  for (const block of blocks) {
    const get = (key: string) => block.assigns.find((assign) => assign.key === key)?.value;
    if (block.kind === "gestures") {
      const zone = get("zone");
      const direction = get("direction");
      const fingers = get("fingers");
      const action = get("action");
      const index = gestures.length;
      if (!ZONES.includes(zone as Zone) || !DIRECTIONS.includes(direction as Direction)) {
        issues.push(`gestures[${index}]: unknown zone or direction`);
        continue;
      }
      let parsedAction: GestureAction;
      if (Array.isArray(action) && action.length > 0) {
        parsedAction = { kind: "command", argv: action };
      } else if (typeof action === "object" && action !== null && !Array.isArray(action)) {
        parsedAction = { kind: "log" };
      } else {
        issues.push(`gestures[${index}]: action must be a command array or { log = true }`);
        continue;
      }
      gestures.push({
        index,
        value: {
          zone: zone as Zone,
          direction: direction as Direction,
          fingers: typeof fingers === "number" ? fingers : undefined,
          action: parsedAction,
        },
        block,
      });
      continue;
    }

    if (block.kind === "sliders") {
      const zone = get("zone");
      const step = get("step");
      const index = sliders.length;
      if (!EDGE_ZONES.includes(zone as EdgeZone)) {
        issues.push(`sliders[${index}]: zone must be left, right, top or bottom`);
        continue;
      }
      const commands: Pick<Slider, "up" | "down" | "left" | "right"> = {};
      for (const key of ["up", "down", "left", "right"] as const) {
        const value = get(key);
        if (Array.isArray(value)) commands[key] = value;
      }
      const vertical = zone === "left" || zone === "right";
      if (vertical ? !commands.up || !commands.down : !commands.left || !commands.right) {
        issues.push(`sliders[${index}]: ${vertical ? "up and down" : "left and right"} commands are required`);
        continue;
      }
      sliders.push({
        index,
        value: { zone: zone as EdgeZone, step: typeof step === "number" ? step : 0.04, ...commands },
        block,
      });
    }
  }

  return { eol, lines, settings, blocks, gestures, sliders, issues };
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function formatArray(argv: string[]): string {
  return `[${argv.map(quote).join(", ")}]`;
}

export function formatGesture(gesture: Gesture): string[] {
  const lines = ["[[gestures]]", `zone = ${quote(gesture.zone)}`, `direction = ${quote(gesture.direction)}`];
  if (gesture.fingers !== undefined) lines.push(`fingers = ${gesture.fingers}`);
  lines.push(
    gesture.action.kind === "log" ? "action = { log = true }" : `action = ${formatArray(gesture.action.argv)}`,
  );
  return lines;
}

export function formatSlider(slider: Slider): string[] {
  const lines = ["[[sliders]]", `zone = ${quote(slider.zone)}`, `step = ${slider.step}`];
  if (slider.zone === "left" || slider.zone === "right") {
    lines.push(`up = ${formatArray(slider.up ?? [])}`, `down = ${formatArray(slider.down ?? [])}`);
  } else {
    lines.push(`left = ${formatArray(slider.left ?? [])}`, `right = ${formatArray(slider.right ?? [])}`);
  }
  return lines;
}

function finish(lines: string[], eol: string): string {
  return lines.join(eol);
}

function appendBlock(text: string, block: string[]): string {
  const eol = eolOf(text);
  if (text.trim() === "") return block.join(eol) + eol;
  const base = text.endsWith("\n") ? text : text + eol;
  return base + eol + block.join(eol) + eol;
}

function replaceBlock(text: string, block: Block | undefined, replacement: string[]): string {
  const parsed = parseConfig(text);
  if (!block) throw new Error("binding not found");
  const lines = [...parsed.lines];
  lines.splice(block.start, block.end - block.start, ...replacement);
  return finish(lines, parsed.eol);
}

function removeBlock(text: string, block: Block | undefined): string {
  const parsed = parseConfig(text);
  if (!block) throw new Error("binding not found");
  const lines = [...parsed.lines];
  lines.splice(block.start, block.end - block.start);
  return finish(lines, parsed.eol);
}

export function appendGesture(text: string, gesture: Gesture): string {
  return appendBlock(text, formatGesture(gesture));
}

export function replaceGesture(text: string, index: number, gesture: Gesture): string {
  return replaceBlock(text, parseConfig(text).gestures[index]?.block, formatGesture(gesture));
}

export function deleteGesture(text: string, index: number): string {
  return removeBlock(text, parseConfig(text).gestures[index]?.block);
}

export function appendSlider(text: string, slider: Slider): string {
  return appendBlock(text, formatSlider(slider));
}

export function replaceSlider(text: string, index: number, slider: Slider): string {
  return replaceBlock(text, parseConfig(text).sliders[index]?.block, formatSlider(slider));
}

export function deleteSlider(text: string, index: number): string {
  return removeBlock(text, parseConfig(text).sliders[index]?.block);
}

function formatValue(value: TomlValue): string {
  if (Array.isArray(value)) return formatArray(value);
  if (typeof value === "object") return "{ log = true }";
  return typeof value === "string" ? quote(value) : String(value);
}

/** Writes one top-level key, or removes it when the value is `undefined`. */
export function setSetting(text: string, key: string, value: TomlValue | undefined): string {
  const parsed = parseConfig(text);
  const lines = [...parsed.lines];
  const existing = parsed.settings.get(key);

  if (existing) {
    if (value === undefined) {
      lines.splice(existing.start, existing.end - existing.start + 1);
    } else {
      lines.splice(existing.start, existing.end - existing.start + 1, `${key} = ${formatValue(value)}`);
    }
    return finish(lines, parsed.eol);
  }
  if (value === undefined) return text;

  const topLevel = [...parsed.settings.values()];
  const insertAt = topLevel.length
    ? Math.max(...topLevel.map((assign) => assign.end + 1))
    : parsed.blocks[0]?.start ?? lines.length;
  lines.splice(insertAt, 0, `${key} = ${formatValue(value)}`);
  return finish(lines, parsed.eol);
}

export function sameBinding(a: Gesture, b: Gesture): boolean {
  return a.zone === b.zone && a.direction === b.direction && a.fingers === b.fingers;
}

function bindingName(gesture: Gesture): string {
  const fingers = gesture.fingers === undefined ? "" : ` with ${gesture.fingers} finger${gesture.fingers === 1 ? "" : "s"}`;
  return `${gesture.zone}.${gesture.direction}${fingers}`;
}

/** Why edgepad would reject this gesture, or undefined when it is acceptable. */
export function validateGesture(doc: ParsedConfig, next: Gesture, ignoreIndex?: number): string | undefined {
  if (next.zone === "pad" && next.direction !== "tap" && next.direction !== "double-tap") {
    return "The whole pad only supports tap and double-tap; there is no edge to swipe along.";
  }
  if (next.fingers !== undefined && (next.fingers < 1 || next.fingers > 4)) {
    return "Fingers must be between 1 and 4.";
  }
  if (next.action.kind === "command" && next.action.argv.length === 0) {
    return "The command needs a program to run.";
  }
  const duplicate = doc.gestures.find((binding) => binding.index !== ignoreIndex && sameBinding(binding.value, next));
  if (duplicate) return `${bindingName(next)} is already bound.`;
  const slider = doc.sliders.find((binding) => binding.value.zone === next.zone);
  if (slider && next.direction !== "tap" && next.direction !== "double-tap") {
    return `${bindingName(next)} conflicts with the ${next.zone} slider; a slider edge only shares tap and double-tap.`;
  }
  return undefined;
}

/** Why edgepad would reject this slider, or undefined when it is acceptable. */
export function validateSlider(doc: ParsedConfig, next: Slider, ignoreIndex?: number): string | undefined {
  if (!EDGE_ZONES.includes(next.zone)) return "A slider needs an edge: left, right, top or bottom.";
  if (!(next.step > 0 && next.step <= 1)) return "Step must be greater than 0 and at most 1.";
  const duplicate = doc.sliders.find(
    (binding) => binding.index !== ignoreIndex && binding.value.zone === next.zone,
  );
  if (duplicate) return `The ${next.zone} edge already has a slider.`;
  const directional = doc.gestures.find(
    (binding) =>
      binding.value.zone === next.zone &&
      binding.value.direction !== "tap" &&
      binding.value.direction !== "double-tap",
  );
  if (directional) {
    return `The ${next.zone} edge has a ${directional.value.direction} swipe; a slider edge cannot also swipe.`;
  }
  const vertical = next.zone === "left" || next.zone === "right";
  if (vertical && (!next.up?.length || !next.down?.length)) return "Up and down commands are both required.";
  if (!vertical && (!next.left?.length || !next.right?.length)) return "Left and right commands are both required.";
  return undefined;
}

export function actionText(action: GestureAction): string {
  return action.kind === "log" ? "Log only (diagnostic)" : action.argv.join(" ");
}

export function sliderCommands(slider: Slider): { label: string; argv: string[] }[] {
  const out: { label: string; argv: string[] }[] = [];
  if (slider.up) out.push({ label: "Up", argv: slider.up });
  if (slider.down) out.push({ label: "Down", argv: slider.down });
  if (slider.left) out.push({ label: "Left", argv: slider.left });
  if (slider.right) out.push({ label: "Right", argv: slider.right });
  return out;
}
