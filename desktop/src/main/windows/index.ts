// Design Ref: desktop-companion §5.1 — privileged window behavior stays outside the renderer.
import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

export type DesktopWindows = {
  pet: BrowserWindow;
  panel: BrowserWindow;
  togglePanel(): void;
  focusQuestion(): void;
  movePet(x: number, y: number): void;
  setPanelPinned(pinned: boolean): void;
  setPetVisible(visible: boolean): void;
  isPetVisible(): boolean;
  destroy(): void;
};

const panelOptions = {
  width: 380,
  height: 560,
  minWidth: 380,
  minHeight: 560,
  maxWidth: 380,
  maxHeight: 560,
  frame: false,
  resizable: false,
  show: false,
  webPreferences: {
    preload: join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
  },
} as const;

function petPosition(): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - 152, y: area.y + area.height - 152 };
}

function clampPet(window: BrowserWindow): void {
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height);
  if (x !== bounds.x || y !== bounds.y) window.setPosition(x, y);
}

async function load(window: BrowserWindow, view: "pet" | "panel"): Promise<void> {
  const suffix = `#${view}`;
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${suffix}`);
  else await window.loadFile(join(__dirname, "../renderer/index.html"), { hash: view });
}

function restoredPetPosition(position: { x: number; y: number } | null | undefined): { x: number; y: number } {
  if (!position) return petPosition();
  const valid = screen.getAllDisplays().some(({ workArea }) =>
    position.x >= workArea.x && position.x <= workArea.x + workArea.width - 128 &&
    position.y >= workArea.y && position.y <= workArea.y + workArea.height - 128,
  );
  return valid ? position : petPosition();
}

export async function createDesktopWindows(savedPosition?: { x: number; y: number } | null): Promise<DesktopWindows> {
  const position = restoredPetPosition(savedPosition);
  const pet = new BrowserWindow({
    ...panelOptions,
    width: 128, height: 128, minWidth: 128, minHeight: 128, maxWidth: 128, maxHeight: 128,
    x: position.x, y: position.y, transparent: true, skipTaskbar: true, alwaysOnTop: true,
  });
  pet.setAlwaysOnTop(true, "floating");
  const panel = new BrowserWindow(panelOptions);
  [pet, panel].forEach((window) => {
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
  let panelPinned = false;
  let panelOpening = false;
  panel.on("blur", () => {
    if (!panelPinned && !panelOpening) panel.hide();
  });
  pet.on("move", () => clampPet(pet));
  await Promise.all([load(pet, "pet"), load(panel, "panel")]);
  pet.showInactive();

  const togglePanel = (): void => {
    if (panel.isVisible() && panel.isFocused()) { panel.hide(); return; }
    const bounds = pet.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const x = Math.min(Math.max(bounds.x - 252, area.x), area.x + area.width - 380);
    const y = Math.min(Math.max(bounds.y - 432, area.y), area.y + area.height - 560);
    panel.setPosition(x, y);
    panelOpening = true;
    panel.showInactive();
    setTimeout(() => { panelOpening = false; }, 200);
    panel.webContents.send("panel-opened");
  };
  return {
    pet, panel, togglePanel,
    focusQuestion: () => {
      if (!panel.isVisible()) togglePanel();
      panel.focus();
      panel.webContents.send("focus-question");
    },
    movePet: (x, y) => {
      pet.setPosition(Math.round(x), Math.round(y));
      clampPet(pet);
    },
    setPanelPinned: (pinned) => { panelPinned = pinned; },
    setPetVisible: (visible) => visible ? pet.showInactive() : pet.hide(),
    isPetVisible: () => pet.isVisible(),
    destroy: () => { pet.destroy(); panel.destroy(); },
  };
}
