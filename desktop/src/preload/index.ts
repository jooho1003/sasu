// Design Ref: desktop-companion §2·§7 S5 — named IPC functions are the renderer's complete capability set.
import { contextBridge, ipcRenderer } from "electron";
import type {
  CompanionContextResponse,
  CompanionDepartmentsResponse,
  CompanionInbox,
  CompanionLinkResponse,
  SalesReviewSourceSelection,
} from "@sasu/contracts";
import type {
  Answer,
  AskStart,
  Card,
  CardDecision,
  DesktopSettings,
  CompanionMembers,
  Questions,
  ReviewUploadRequest,
  SalesSources,
  SalesStatus,
  TranscriptResult,
} from "../shared/contracts";

const invoke = <T>(channel: string, input?: unknown): Promise<T> =>
  ipcRenderer.invoke(channel, input) as Promise<T>;

const bridge = {
  auth: {
    requestCode: (email: string) =>
      invoke<{ sent: true }>("auth:requestCode", { email }),
    verifyCode: (email: string, code: string) =>
      invoke<{ authenticated: true }>("auth:verifyCode", { email, code }),
    signOut: () => invoke<void>("auth:signOut"),
    onSignedOut: (callback: () => void) => {
      const listener = (): void => callback();
      ipcRenderer.on("signed-out", listener);
      return () => {
        ipcRenderer.removeListener("signed-out", listener);
      };
    },
  },
  link: {
    departments: () => invoke<CompanionDepartmentsResponse>("link:departments"),
    create: (input: { dept_id: string; device_name: string }) =>
      invoke<CompanionLinkResponse>("link:create", input),
    get: () => invoke<CompanionContextResponse>("link:get"),
  },
  inbox: {
    get: () =>
      invoke<{ inbox: CompanionInbox; outbox_count: number }>("inbox:get"),
  },
  ask: {
    send: (question: string, parent_id: string | null = null) =>
      invoke<AskStart | { queued: true; outbox_id: string }>("ask:send", {
        question,
        parent_id,
      }),
  },
  answer: { get: (id: string) => invoke<Answer>("answer:get", { id }) },
  questions: {
    list: (cursor: { before: string; before_id: string } | null = null) =>
      invoke<Questions>("questions:list", { cursor }),
  },
  card: {
    get: (id: string) => invoke<Card>("card:get", { id }),
    decide: (input: {
      id: string;
      status: "decided" | "deferred" | "rejected" | "open";
      outcome: string;
      rationale: string;
    }) => invoke<CardDecision>("card:decide", input),
  },
  upload: {
    transcript: (input: {
      name: string;
      title: string;
      visibility: "dept" | "leads_only";
      bytes: Uint8Array;
    }) => invoke<TranscriptResult>("upload:transcript", input),
    review: (input: ReviewUploadRequest) =>
      invoke<{ id: string; job_ids: string[] }>("upload:review", input),
    onReviewProgress: (
      callback: (progress: { stage: "original" | "part"; current?: number; total?: number }) => void,
    ) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: { stage: "original" | "part"; current?: number; total?: number }): void => callback(progress);
      ipcRenderer.on("review-upload-progress", listener);
      return () => {
        ipcRenderer.removeListener("review-upload-progress", listener);
      };
    },
  },
  members: { list: () => invoke<CompanionMembers>("members:list") },
  sales: {
    sources: () => invoke<SalesSources>("sales:sources"),
    start: (input: SalesReviewSourceSelection & { request_id: string }) =>
      invoke<{ task_id: string }>("sales:start", input),
    status: (task_id: string) =>
      invoke<SalesStatus>("sales:status", { task_id }),
  },
  settings: {
    get: () => invoke<DesktopSettings>("settings:get"),
    set: (input: Partial<DesktopSettings>) =>
      invoke<DesktopSettings>("settings:set", input),
  },
  update: {
    get: () => invoke<{ status: string; percent?: number }>("update:get"),
    onStatus: (callback: (status: { status: string; percent?: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: { status: string; percent?: number }): void => callback(status);
      ipcRenderer.on("update-status", listener);
      return () => {
        ipcRenderer.removeListener("update-status", listener);
      };
    },
  },
  app: {
    openWeb: (path: string) =>
      invoke<{ opened: true }>("app:openWeb", { path }),
    info: () => invoke<{ version: string; device_name: string }>("app:info"),
  },
  window: {
    togglePanel: () => ipcRenderer.send("pet-toggle-panel"),
    onShortcutStatus: (callback: (registered: boolean) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        registered: boolean,
      ): void => callback(registered);
      ipcRenderer.on("shortcut-status", listener);
      return () => {
        ipcRenderer.removeListener("shortcut-status", listener);
      };
    },
    onFocusQuestion: (callback: () => void) => {
      const listener = (): void => callback();
      ipcRenderer.on("focus-question", listener);
      return () => {
        ipcRenderer.removeListener("focus-question", listener);
      };
    },
    onPetState: (callback: (state: string) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: string,
      ): void => callback(state);
      ipcRenderer.on("pet-state", listener);
      return () => {
        ipcRenderer.removeListener("pet-state", listener);
      };
    },
    onPetSettings: (callback: (settings: DesktopSettings) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        settings: DesktopSettings,
      ): void => callback(settings);
      ipcRenderer.on("pet-settings", listener);
      return () => {
        ipcRenderer.removeListener("pet-settings", listener);
      };
    },
    movePet: (position: { x: number; y: number }) =>
      invoke<void>("window:movePet", position),
    onE2ENotification: (callback: (at: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, at: number): void => callback(at);
      ipcRenderer.on("desktop-e2e-notification", listener);
      return () => ipcRenderer.removeListener("desktop-e2e-notification", listener);
    },
  },
};

contextBridge.exposeInMainWorld("sasu", bridge);

export type SasuBridge = typeof bridge;
