import { Action, ActionPanel, Color, Icon, List, Keyboard } from '@vicinae/api';
import { useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprLayersResponse } from './types';
import { clearLayerRules, setLayerRule } from './utils/dispatch';
import { flattenLayers, formatRect } from './utils/layers';
import type { LayerEffect } from './utils/lua';

const LAYER_COLORS = [
  Color.SecondaryText,
  Color.Green,
  Color.Blue,
  Color.Purple,
];

/**
 * The effects a layer rule can set on a namespace, in the order they are
 * offered. Hyprland has no dispatcher for a layer surface itself: no raise,
 * no hide, no focus. These rules are the only runtime control it exposes.
 */
const LAYER_EFFECTS: { effect: LayerEffect; title: string }[] = [
  { effect: 'blur', title: 'Blur' },
  { effect: 'xray', title: 'Xray' },
  { effect: 'dim_around', title: 'Dim Around' },
  { effect: 'no_anim', title: 'Animations Off' },
  { effect: 'no_screen_share', title: 'Hide From Screen Share' },
];

const EFFECTS = LAYER_EFFECTS.map((item) => item.effect);

export default function Layers() {
  const [layersResponse, isLoading] = useHyprctlData<HyprLayersResponse>(
    'layers',
    {},
    'Failed to load layers'
  );
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const layers = flattenLayers(layersResponse);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search layers..."
    >
      {layers.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Layers Found"
          description="No Hyprland layer surfaces were returned by hyprctl."
        />
      ) : (
        <List.Section title="Layers" subtitle={layers.length.toString()}>
          {layers.map((layer) => (
            <List.Item
              key={`${layer.monitor}-${layer.level}-${layer.address}`}
              title={layer.namespace}
              subtitle={
                isShowingDetail
                  ? undefined
                  : `${layer.monitor} - ${formatRect(layer)}`
              }
              icon={Icon.AppWindow}
              keywords={[
                layer.namespace,
                layer.monitor,
                layer.layer,
                layer.pid.toString(),
              ]}
              accessories={
                isShowingDetail
                  ? []
                  : [
                      {
                        tag: {
                          value: layer.layer,
                          color:
                            LAYER_COLORS[layer.level] ?? Color.SecondaryText,
                        },
                      },
                      { tag: `PID ${layer.pid}` },
                    ]
              }
              actions={
                <ActionPanel>
                  <Action
                    title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                    icon={Icon.AppWindowSidebarRight}
                    shortcut={{ modifiers: ['cmd'], key: 'd' }}
                    onAction={() => setIsShowingDetail((visible) => !visible)}
                  />
                  <ActionPanel.Section title="Layer Rules">
                    <ActionPanel.Submenu
                      title="Set Effect"
                      icon={Icon.Brush}
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'r' }}
                    >
                      {LAYER_EFFECTS.flatMap(({ effect, title }) =>
                        [true, false].map((enabled) => (
                          <Action
                            key={`${effect}-${enabled}`}
                            title={`${title}: ${enabled ? 'On' : 'Off'}`}
                            icon={enabled ? Icon.Check : Icon.Xmark}
                            onAction={() =>
                              setLayerRule(layer.namespace, effect, enabled)
                            }
                          />
                        ))
                      )}
                    </ActionPanel.Submenu>
                    <Action
                      title="Clear This Layer's Rules"
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'x' }}
                      icon={Icon.Undo}
                      onAction={() => clearLayerRules(layer.namespace, EFFECTS)}
                    />
                  </ActionPanel.Section>
                  <Action.CopyToClipboard
                    title="Copy Namespace"
                    shortcut={Keyboard.Shortcut.Common.Copy}
                    content={layer.namespace}
                  />
                  <Action.CopyToClipboard
                    title="Copy Monitor"
                    shortcut={{ modifiers: ['ctrl', 'shift'], key: 'm' }}
                    content={layer.monitor}
                  />
                  <Action.CopyToClipboard
                    title="Copy Address"
                    shortcut={{ modifiers: ['ctrl', 'shift'], key: 'a' }}
                    content={layer.address}
                  />
                  <Action.CopyToClipboard
                    title="Copy PID"
                    shortcut={{ modifiers: ['ctrl', 'shift'], key: 'i' }}
                    content={layer.pid.toString()}
                  />
                  <Action.CopyToClipboard
                    title="Copy JSON"
                    shortcut={{ modifiers: ['ctrl', 'shift'], key: 'j' }}
                    content={JSON.stringify(layer, null, 2)}
                  />
                </ActionPanel>
              }
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Namespace"
                        text={layer.namespace || '-'}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Monitor"
                        text={layer.monitor}
                      />
                      <List.Item.Detail.Metadata.TagList title="Layer">
                        <List.Item.Detail.Metadata.TagList.Item
                          text={`${layer.layer} (${layer.level})`}
                          color={
                            LAYER_COLORS[layer.level] ?? Color.SecondaryText
                          }
                        />
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Label
                        title="Size"
                        text={`${layer.w} × ${layer.h}`}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Position (X, Y)"
                        text={`${layer.x}, ${layer.y}`}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="PID"
                        text={layer.pid.toString()}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Address"
                        text={layer.address}
                      />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
