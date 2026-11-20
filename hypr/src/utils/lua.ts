/**
 * The Lua expressions Hyprland 0.56 takes for `hyprctl dispatch` and
 * `hyprctl eval`. Pure string building, so every command the panels send is
 * asserted in the tests against the syntax this compositor accepted.
 */

/** Escapes backslashes and quotes for use inside a Lua string literal. */
export function escapeLuaString(value: string) {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

/** Hyprland addresses a window by its hex address. */
function windowSelector(address: string) {
  return `address:${escapeLuaString(address)}`;
}

export function closeWindowCommand(address: string) {
  return `hl.dsp.window.close({ window = "${windowSelector(address)}" })`;
}

export function floatWindowCommand(address: string) {
  return `hl.dsp.window.float({ action = "toggle", window = "${windowSelector(address)}" })`;
}

export function pinWindowCommand(address: string) {
  return `hl.dsp.window.pin({ action = "toggle", window = "${windowSelector(address)}" })`;
}

export function fullscreenWindowCommand(address: string) {
  return `hl.dsp.window.fullscreen({ action = "toggle", window = "${windowSelector(address)}" })`;
}

export function centerWindowCommand(address: string) {
  return `hl.dsp.window.center({ window = "${windowSelector(address)}" })`;
}

/** `silent` is spelled `follow = false`: the window moves, the view stays. */
export function moveWindowToWorkspaceCommand(
  address: string,
  workspace: number
) {
  return `hl.dsp.window.move({ workspace = "${workspace}", follow = false, window = "${windowSelector(address)}" })`;
}

/** What a layer rule can change about a namespace; the compositor's own set. */
export type LayerEffect =
  | 'blur'
  | 'xray'
  | 'dim_around'
  | 'no_anim'
  | 'no_screen_share';

/** Names the rule for the namespace and effect it was made for, so clearing finds it. */
export function layerRuleName(namespace: string, effect: LayerEffect) {
  return `vicinae-layer-${effect}-${namespace}`;
}

/**
 * Sets one effect on a namespace. Hyprland keeps the rule for the session, so
 * the opposite value is how you undo it; `clearLayerRuleCommands` disables it
 * and lets the config win again.
 */
export function layerRuleCommand(
  namespace: string,
  effect: LayerEffect,
  enabled: boolean
) {
  const name = escapeLuaString(layerRuleName(namespace, effect));
  return `hl.layer_rule({ name = "${name}", match = { namespace = "${escapeLuaString(namespace)}" }, ${effect} = ${enabled} })`;
}

/** Turns a rule off, which puts the config's own value back in force. */
export function clearLayerRuleCommand(namespace: string, effect: LayerEffect) {
  const name = escapeLuaString(layerRuleName(namespace, effect));
  return `hl.layer_rule({ name = "${name}", enabled = false })`;
}

/** One expression per effect, since `eval` takes a single expression. */
export function clearLayerRuleCommands(
  namespace: string,
  effects: readonly LayerEffect[]
) {
  return effects.map((effect) => clearLayerRuleCommand(namespace, effect));
}
