// Design Ref: desktop-companion §5.3·§7 S8 — packaged builds only check the dedicated release repository.
import { app } from "electron";
import updaterPackage from "electron-updater";
import { logError, logInfo } from "./logger";

// electron-updater is CommonJS. Use its default export so Electron's ESM main
// bundle can load the packaged app on Windows.
const { autoUpdater } = updaterPackage;
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1_000;

export type UpdateState =
  | { status: "unavailable" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "downloading"; percent: number }
  | { status: "ready" }
  | { status: "failed" };

type Listener = (state: UpdateState) => void;

export class DesktopUpdater {
  #state: UpdateState = { status: "unavailable" };
  #listeners = new Set<Listener>();
  #timer: NodeJS.Timeout | null = null;

  getState = (): UpdateState => this.#state;
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #set(state: UpdateState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }
  start(): void {
    if (!app.isPackaged && process.env.SASU_DISABLE_UPDATER) return;
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => this.#set({ status: "checking" }));
    autoUpdater.on("update-not-available", () => this.#set({ status: "current" }));
    autoUpdater.on("download-progress", ({ percent }) => this.#set({ status: "downloading", percent: Math.round(percent) }));
    autoUpdater.on("update-downloaded", () => this.#set({ status: "ready" }));
    autoUpdater.on("error", (cause) => {
      logError("update_failed", { code: cause instanceof Error ? cause.name : "unknown" });
      this.#set({ status: "failed" });
    });
    const check = (): void => void autoUpdater.checkForUpdates().catch((cause: unknown) => {
      logError("update_check_failed", { code: cause instanceof Error ? cause.name : "unknown" });
      this.#set({ status: "failed" });
    });
    check();
    this.#timer = setInterval(check, UPDATE_CHECK_MS);
    logInfo("update_check_started");
  }
  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
