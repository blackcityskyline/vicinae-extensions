import { setTimeout as delay } from 'node:timers/promises';
import { closeMainWindow, PopToRootType } from '@vicinae/api';
import type { HyprWorkspace, Layout } from '../types';
import {
  ensureHyprRuntimeAvailable,
  getHyprctlJson,
  handleError,
  runHyprctlCommand,
} from './hyprctl';
import {
  clearLayerRuleCommands,
  escapeLuaString,
  layerRuleCommand,
  type LayerEffect,
} from './lua';

/**
 * Runs one window dispatcher. The launcher can stay open: every command names
 * its window by address, so Hyprland does not need it focused.
 */
export async function dispatchWindowCommand(command: string) {
  try {
    await ensureHyprRuntimeAvailable();
    await runHyprctlCommand(['dispatch', command]);
    return true;
  } catch (error) {
    handleError('Window action failed', error);
    return false;
  }
}

/** Applies one layer rule effect to every surface of a namespace. */
export async function setLayerRule(
  namespace: string,
  effect: LayerEffect,
  enabled: boolean
) {
  try {
    await ensureHyprRuntimeAvailable();
    await runHyprctlCommand(['eval', layerRuleCommand(namespace, effect, enabled)]);
    return true;
  } catch (error) {
    handleError('Layer rule failed', error);
    return false;
  }
}

/** Disables the rules this extension made for a namespace, one call each. */
export async function clearLayerRules(
  namespace: string,
  effects: readonly LayerEffect[]
) {
  try {
    await ensureHyprRuntimeAvailable();
    for (const command of clearLayerRuleCommands(namespace, effects)) {
      await runHyprctlCommand(['eval', command]);
    }
    return true;
  } catch (error) {
    handleError('Layer rules were not cleared', error);
    return false;
  }
}

/**
 * Switches the active workspace to the requested layout.
 */
export async function switchToLayout(layout: Layout) {
  try {
    const activeWorkspace =
      await getHyprctlJson<HyprWorkspace>('activeworkspace');
    await runHyprctlCommand(getSwitchLayoutArgs(activeWorkspace.id, layout));
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Layout switch failed', error);
    return false;
  }
}

type HyprFocusTarget = 'window' | 'monitor' | 'workspace';

/**
 * Focuses a window, monitor, or workspace using the available Hyprland API.
 */
export async function focusHyprTarget(target: HyprFocusTarget, value: string) {
  try {
    await ensureHyprRuntimeAvailable();
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    // Vicinae schedules closing after 50ms. Let the launcher release keyboard
    // focus before dispatching, or closing it can undo same-workspace focus.
    await delay(100);

    try {
      await runHyprctlCommand(getLegacyHyprFocusArgs(target, value));
    } catch {
      await runHyprctlCommand(getLuaHyprFocusArgs(target, value));
    }

    return true;
  } catch (error) {
    handleError('Focus failed', error);
    return false;
  }
}

/**
 * Builds the hyprctl arguments for changing a workspace layout.
 */
function getSwitchLayoutArgs(activeWorkspaceId: number, layout: Layout) {
  return [
    'eval',
    `hl.workspace_rule({ workspace = "${activeWorkspaceId}", layout = "${layout}" })`,
  ];
}

/**
 * Builds legacy hyprctl dispatch arguments for focusing a target.
 */
function getLegacyHyprFocusArgs(target: HyprFocusTarget, value: string) {
  if (target === 'window') {
    return ['dispatch', 'focuswindow', `address:${value}`];
  }

  if (target === 'monitor') {
    return ['dispatch', 'focusmonitor', value];
  }

  return ['dispatch', 'workspace', value];
}

/**
 * Builds Lua-based hyprctl dispatch arguments for focusing a target.
 */
function getLuaHyprFocusArgs(target: HyprFocusTarget, value: string) {
  const luaValue = escapeLuaString(value);

  if (target === 'window') {
    return ['dispatch', `hl.dsp.focus({window="address:${luaValue}"})`];
  }

  if (target === 'monitor') {
    return ['dispatch', `hl.dsp.focus({monitor="${luaValue}"})`];
  }

  return ['dispatch', `hl.dsp.focus({workspace="${luaValue}"})`];
}
