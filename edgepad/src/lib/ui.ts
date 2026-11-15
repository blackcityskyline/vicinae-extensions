import { Icon } from "@vicinae/api";

import { actionText, sliderCommands, type Direction, type Gesture, type Slider, type Zone } from "./toml";

export function zoneLabel(zone: Zone): string {
  switch (zone) {
    case "left":
      return "Left edge";
    case "right":
      return "Right edge";
    case "top":
      return "Top edge";
    case "bottom":
      return "Bottom edge";
    case "pad":
      return "Whole pad";
  }
}

export function directionLabel(direction: Direction): string {
  switch (direction) {
    case "up":
      return "Up";
    case "down":
      return "Down";
    case "left":
      return "Left";
    case "right":
      return "Right";
    case "tap":
      return "Tap";
    case "double-tap":
      return "Double tap";
  }
}

export function directionIcon(direction: Direction): Icon {
  switch (direction) {
    case "up":
      return Icon.ArrowUp;
    case "down":
      return Icon.ArrowDown;
    case "left":
      return Icon.ArrowLeft;
    case "right":
      return Icon.ArrowRight;
    case "tap":
      return Icon.CircleFilled;
    case "double-tap":
      return Icon.Repeat;
  }
}

export function gestureSubtitle(gesture: Gesture): string {
  return actionText(gesture.action);
}

export function fingersTag(gesture: Gesture): string {
  if (gesture.fingers === undefined) return "any fingers";
  return `${gesture.fingers} finger${gesture.fingers === 1 ? "" : "s"}`;
}

export function sliderSubtitle(slider: Slider): string {
  return sliderCommands(slider)
    .map((command) => `${command.label} ${command.argv.join(" ")}`)
    .join(" · ");
}
