// Design Ref: desktop-companion §5.1 — tray labels never contain work content.
import { Menu, Tray, nativeImage } from "electron";
import type { DesktopWindows } from "./windows";

export function createTray(windows: DesktopWindows, onSignOut: () => void, iconPath: string): Tray {
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) throw new Error("tray_icon_missing");
  const tray = new Tray(icon);
  const refresh = (): void => tray.setContextMenu(Menu.buildFromTemplate([
    { label: "열기", click: () => windows.togglePanel() },
    { label: windows.isPetVisible() ? "펫 숨기기" : "펫 보이기", click: () => { windows.setPetVisible(!windows.isPetVisible()); refresh(); } },
    { type: "separator" },
    { label: "연결 해제", click: onSignOut },
    { label: "종료", click: () => process.emit("sasu-quit") },
  ]));
  refresh();
  tray.on("click", () => windows.togglePanel());
  return tray;
}
