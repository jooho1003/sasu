// Design Ref: desktop-companion §2·§7 — hardened Electron main owns every token, network, and OS capability.
import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";
import { ApiClient } from "./api/client";
import { AuthService, createDesktopSupabase } from "./auth/supabase";
import { registerIpc } from "./ipc";
import { logError, logInfo } from "./logger";
import { OutboxService } from "./outbox-service";
import { EncryptedFile, EncryptedKeyValueStorage } from "./storage/encrypted-file";

const CSP = "default-src 'self'; connect-src 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'";
const APP_USER_MODEL_ID = "team.sasu.companion";
const OUTBOX_FLUSH_MS = 30_000;

let mainWindow: BrowserWindow | null = null;
let flushTimer: NodeJS.Timeout | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 480,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => window.show());
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return window;
}

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

  const sessionStorage = new EncryptedKeyValueStorage(sessionFile);
  const supabase = createDesktopSupabase(sessionStorage);
  let clearUnauthorized = async (): Promise<void> => undefined;
  const api = new ApiClient(SASU_APP_URL, supabase, () => clearUnauthorized());
  const auth = new AuthService(supabase, api, sessionStorage, [outboxFile, settingsFile]);
  clearUnauthorized = async () => {
    await auth.clearLocalState();
    mainWindow?.webContents.send("signed-out");
  };
  const outbox = new OutboxService(outboxFile, api);

  registerIpc({ api, auth, outbox, supabase, settingsFile });
  installBrowserGuards();
  mainWindow = createWindow();
  flushTimer = setInterval(() => {
    void outbox.flush().catch((cause: unknown) => {
      logError("outbox_flush_failed", { code: cause instanceof Error ? cause.name : "unknown" });
    });
  }, OUTBOX_FLUSH_MS);
  logInfo("app_ready");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch((cause: unknown) => {
    logError("app_start_failed", { code: cause instanceof Error ? cause.message : "unknown" });
    app.quit();
  });
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (flushTimer) clearInterval(flushTimer);
});
