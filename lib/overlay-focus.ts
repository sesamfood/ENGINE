import type { DialogPopupProps } from "@base-ui/react/dialog";
import { isTouchDevice } from "./touch-device";

type InitialFocus = DialogPopupProps["initialFocus"];
type FocusResolver = Extract<InitialFocus, (...args: never[]) => unknown>;

export function resolveOverlayFocus(
  openType: Parameters<FocusResolver>[0],
  popup: HTMLElement | null,
  initialFocus: InitialFocus,
) {
  if (openType === "touch" || isTouchDevice()) return popup ?? false;
  if (typeof initialFocus === "function") return initialFocus(openType);
  if (typeof initialFocus === "object") return initialFocus.current;
  return initialFocus ?? true;
}
