// Design Ref: desktop-companion §2·§7 — hardened Electron main owns every token, network, and OS capability.
import { app, ipcMain, session } from "electron";
import { z } from "zod";
import { join } from "node:path";
import { ApiClient } from "./api/client";
import { AuthService, createDesktopSupabase } from "./auth/supabase";
import { registerIpc } from "./ipc";
import { logError, logInfo } from "./logger";
import { OutboxService } from "./outbox-service";
import { EncryptedFile, EncryptedKeyValueStorage } from "./storage/encrypted-file";
import { SettingsService } from "./settings-service";
import { createDesktopWindows, type DesktopWindows } from "./windows";
import { createTray } from "./tray";
import { registerPanelShortcut, unregisterPanelShortcut } from "./shortcut";
import { computePetState } from "./core/pet-state";
import { nextInboxDelay } from "./core/poller";
import { inboxNotificationCounts } from "./core/inbox-notifications";
import { notify } from "./notify";
import { DesktopUpdater } from "./updater";
import { DEFAULT_DESKTOP_SETTINGS, parseCompanionInbox } from "../shared/contracts";

const CSP = "default-src 'self'; connect-src 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'";
const APP_USER_MODEL_ID = "team.sasu.companion";
const OUTBOX_FLUSH_MS = 30_000;

let windows: DesktopWindows | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let inboxTimer: NodeJS.Timeout | null = null;
let tray: ReturnType<typeof createTray> | null = null;
let updater: DesktopUpdater | null = null;

const PositionInput = z.strictObject({ x: z.number().int(), y: z.number().int() });

function installBrowserGuards(): void {
  const currentSession = session.defaultSession;
  currentSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  currentSession.setPermissionCheckHandler(() => false);
  currentSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
      },
    });
  });
}

async function start(): Promise<void> {
  if (!SASU_APP_URL) throw new Error("app_url_missing");
  const userData = app.getPath("userData");
  const sessionFile = new EncryptedFile(join(userData, "session.bin"));
  const outboxFile = new EncryptedFile(join(userData, "outbox.bin"));
  const settingsFile = new EncryptedFile(join(userData, "settings.bin"));
  sessionFile.assertAvailable();
  outboxFile.assertAvailable();
  settingsFile.assertAvailable();
  const settings = new SettingsService(settingsFile);

  const sessionStorage = new EncryptedKeyValueStorage(sessionFile);
  const supabase = createDesktopSupabase(sessionStorage);
  // Supabase restores the async encrypted storage lazily. Complete that
  // restoration before exposing OTP login, otherwise a late empty restore can
  // overwrite a newly verified session.
  const restoredSession = await supabase.auth.getSession();
  let clearUnauthorized = async (): Promise<void> => undefined;
  const api = new ApiClient(
    SASU_APP_URL,
    supabase,
    () => clearUnauthorized(),
    session.defaultSession.fetch.bind(session.defaultSession),
  );
  const outbox = new OutboxService(outboxFile, api);
  let deviceLinked = false;
  let deviceLinkPending = false;
  let sessionGeneration = 0;
  let previousInbox: ReturnType<typeof parseCompanionInbox> | null = null;
  const auth = new AuthService(supabase, api, sessionStorage, [outbox, settings], () => {
    sessionGeneration += 1;
    api.invalidateSession();
    outbox.invalidate();
    deviceLinked = false;
    deviceLinkPending = false;
    previousInbox = null;
    windows?.setPanelPinned(false);
    windows?.pet.webContents.send("pet-state", "idle");
    windows?.pet.webContents.send("pet-settings", DEFAULT_DESKTOP_SETTINGS);
    windows?.panel.webContents.send("signed-out");
  });
  clearUnauthorized = async () => {
    // ApiClient discards old generations. A current 401 is authoritative even
    // while the freshly verified user is choosing or linking a department.
    await auth.clearLocalState();
  };
  updater = new DesktopUpdater();

  registerIpc({
    api, auth, outbox, supabase, settings,
    getWindows: () => windows,
    getSessionGeneration: () => sessionGeneration,
    onSettingsChanged: (next) => {
      windows?.setPanelPinned(next.panelPinned);
      windows?.pet.webContents.send("pet-settings", next);
    },
    onDeviceAuthenticating: () => {
      sessionGeneration += 1;
      api.invalidateSession();
      deviceLinkPending = true;
    },
    onDeviceAuthenticated: () => { api.resumeSession(); deviceLinkPending = true; },
    onDeviceAuthenticationFailed: () => { deviceLinkPending = false; },
    onDeviceLinked: () => { deviceLinked = true; deviceLinkPending = false; },
    updater,
  });
  installBrowserGuards();
  const savedSettings = await settings.get();
  windows = await createDesktopWindows(savedSettings.petPosition);
  updater.subscribe((state) => windows?.panel.webContents.send("update-status", state));
  updater.start();
  windows.setPanelPinned(savedSettings.panelPinned);
  if (!restoredSession.data.session) windows.togglePanel();
  ipcMain.handle("window:movePet", async (event, value) => {
    if (event.sender !== windows?.pet.webContents) throw new Error("window_forbidden");
    const position = PositionInput.parse(value);
    windows.movePet(position.x, position.y);
    const bounds = windows.pet.getBounds();
    await settings.set({ petPosition: { x: bounds.x, y: bounds.y } });
    return { x: bounds.x, y: bounds.y };
  });
  ipcMain.on("pet-toggle-panel", (event) => {
    if (event.sender === windows?.pet.webContents) windows.togglePanel();
  });
  const shortcutRegistered = registerPanelShortcut(() => windows?.focusQuestion());
  windows.panel.webContents.send("shortcut-status", shortcutRegistered);
  const trayIconPath = app.isPackaged
    ? join(process.resourcesPath, "tray.png")
    : join(__dirname, "../../resources/tray.png");
  tray = createTray(windows, () => {
    void auth.signOut().catch(() => logError("tray_sign_out_failed", { code: "local_clear_failed" }));
  }, trayIconPath);
  flushTimer = setInterval(() => {
    void outbox.flush().catch((cause: unknown) => {
      logError("outbox_flush_failed", { code: cause instanceof Error ? cause.name : "unknown" });
    });
  }, OUTBOX_FLUSH_MS);
  let inboxDelay = 0;
  const pollInbox = async (): Promise<void> => {
    const generation = sessionGeneration;
    try {
      const session = await supabase.auth.getSession();
      if (generation !== sessionGeneration) return;
      if (!session.data.session) {
        inboxDelay = nextInboxDelay(inboxDelay, "ok");
        return;
      }
      if (!deviceLinked) {
        if (deviceLinkPending) {
          inboxDelay = nextInboxDelay(inboxDelay, "ok");
          return;
        }
        const context = await api.get("/api/companion/link", () => true).catch(() => false);
        if (!context) {
          inboxDelay = nextInboxDelay(inboxDelay, "ok");
          return;
        }
        if (generation !== sessionGeneration) return;
        deviceLinked = true;
      }
      const inbox = await api.get("/api/companion/inbox", parseCompanionInbox);
      const currentSettings = await settings.get();
      const state = computePetState(inbox, new Set(currentSettings.seen), await outbox.count());
      if (generation !== sessionGeneration) return;
      windows?.pet.webContents.send("pet-state", state);
      const changes = inboxNotificationCounts(previousInbox, inbox);
      if (changes.cards) {
        notify("cards", changes.cards, () => windows?.togglePanel());
        if (process.env.SASU_DESKTOP_E2E === "1") windows?.pet.webContents.send("desktop-e2e-notification", Date.now());
      }
      if (changes.answers) notify("answer", 0, () => windows?.focusQuestion());
      if (changes.work) notify("work", 0, () => windows?.togglePanel());
      if (changes.failed) notify("failed", 0, () => windows?.togglePanel());
      previousInbox = inbox;
      inboxDelay = nextInboxDelay(inboxDelay, "ok");
    } catch (cause) {
      inboxDelay = nextInboxDelay(inboxDelay, "error");
      logError("inbox_poll_failed", { code: cause instanceof Error ? cause.name : "unknown" });
    } finally {
      inboxTimer = setTimeout(() => void pollInbox(), inboxDelay);
    }
  };
  void pollInbox();
  logInfo("app_ready");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on("second-instance", () => {
    windows?.togglePanel();
  });
  app.whenReady().then(start).catch((cause: unknown) => {
    logError("app_start_failed", { code: cause instanceof Error ? cause.name : "unknown" });
    app.quit();
  });
}

process.on("sasu-quit", () => app.quit());
app.on("window-all-closed", () => undefined);
app.on("before-quit", () => {
  if (flushTimer) clearInterval(flushTimer);
  if (inboxTimer) clearTimeout(inboxTimer);
  tray?.destroy();
  updater?.stop();
  unregisterPanelShortcut();
});
