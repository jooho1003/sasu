// Design Ref: desktop-companion §5.1 — failed registration is explicit, never silently retried.
import { globalShortcut } from "electron";

export function registerPanelShortcut(open: () => void): boolean {
  return globalShortcut.register("CommandOrControl+Alt+S", open);
}

export function unregisterPanelShortcut(): void {
  globalShortcut.unregister("CommandOrControl+Alt+S");
}
