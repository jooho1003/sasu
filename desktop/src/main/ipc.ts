// Design Ref: desktop-companion §4·§7 — the renderer receives named, validated capabilities only.
import { app, ipcMain, shell } from "electron";
import {
  AskQuestionInput,
  CompanionLinkInput,
  CompanionQuestionCursor,
  CompanionTranscriptMeta,
  ReviewCreate,
  SalesSourceReviewRequest,
} from "@sasu/contracts";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, type ApiClient } from "./api/client";
import { uploadReview, type ReviewUploadInput } from "./api/storage-upload";
import type { AuthService } from "./auth/supabase";
import type { OutboxService } from "./outbox-service";
import type { EncryptedFile } from "./storage/encrypted-file";
import { logError } from "./logger";
import type { DesktopUpdater } from "./updater";
import {
  parseAnswer,
  parseCard,
  parseCardDecision,
  parseCompanionContext,
  parseCompanionDepartments,
  parseCompanionInbox,
  parseCompanionMembers,
  parseCompanionLink,
  parseQuestions,
  parseSalesSources,
  parseSalesStart,
  parseSalesStatus,
  parseTranscriptResult,
} from "../shared/contracts";

const EmailInput = z.strictObject({ email: z.email().max(320) });
const VerifyInput = EmailInput.extend({ code: z.string().trim().regex(/^\d{6,8}$/u) }).strict();
const LinkInput = CompanionLinkInput.omit({ app_version: true });
const IdInput = z.strictObject({ id: z.guid() });
const QuestionsInput = z.strictObject({ cursor: CompanionQuestionCursor.nullable().optional() });
const DecideInput = z.strictObject({
  id: z.guid(),
  status: z.enum(["decided", "deferred", "rejected", "open"]),
  outcome: z.string().max(300),
  rationale: z.string().max(1_000),
});
const TranscriptInput = CompanionTranscriptMeta.extend({
  name: z.string().trim().min(1).max(200),
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= 4 * 1024 * 1024),
}).strict();
const ReviewUploadEnvelope = z.strictObject({
  review: z.unknown(),
  contentType: z.string().max(120),
  original: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= 50 * 1024 * 1024),
  parts: z.array(z.strictObject({
    index: z.number().int().min(0).max(29),
    seconds: z.number().positive().max(61),
    bytes: z.instanceof(Uint8Array),
  })).max(30),
});
const SalesStatusInput = z.strictObject({ task_id: z.guid() });
const OpenWebInput = z.strictObject({ path: z.string().startsWith("/").max(2_000) });

const Settings = z.strictObject({
  seen: z.array(z.guid()).max(500),
  pet: z.enum(["green", "blue", "purple"]),
  reduceMotion: z.boolean(),
  panelPinned: z.boolean(),
});
const SettingsPatch = Settings.partial().strict();
type SettingsValue = z.infer<typeof Settings>;
const DEFAULT_SETTINGS: SettingsValue = {
  seen: [],
  pet: "green",
  reduceMotion: false,
  panelPinned: false,
};

type Dependencies = {
  api: ApiClient;
  auth: AuthService;
  outbox: OutboxService;
  supabase: SupabaseClient;
  settingsFile: EncryptedFile;
  onSettingsChanged?: (settings: SettingsValue) => void;
  onDeviceAuthenticated?: () => void;
  onDeviceLinked?: () => void;
  updater?: DesktopUpdater;
};

function register<I, O>(
  channel: string,
  parse: (value: unknown) => I,
  handler: (input: I, event: Electron.IpcMainInvokeEvent) => Promise<O>,
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    try {
      return await handler(parse(raw), event);
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : cause instanceof z.ZodError ? "invalid_input" : cause instanceof Error ? cause.message : "unknown";
      logError("ipc_failed", { code });
      if (cause instanceof ApiError) throw new Error(`${cause.code}:${cause.message}`, { cause });
      if (cause instanceof z.ZodError) throw new Error("invalid_input:입력값을 확인해 주세요.", { cause });
      throw new Error(`${code}:요청을 처리하지 못했습니다.`, { cause });
    }
  });
}

function noInput(): undefined {
  return undefined;
}

function parseReviewInput(value: unknown): ReviewUploadInput {
  const envelope = ReviewUploadEnvelope.parse(value);
  return {
    ...envelope,
    review: ReviewCreate.parse(envelope.review),
  };
}

function webTarget(path: string): string {
  if (!SASU_APP_URL) throw new Error("app_url_missing");
  const base = new URL(SASU_APP_URL);
  const target = new URL(path, base);
  if (base.protocol !== "https:" || target.protocol !== "https:" || target.origin !== base.origin) {
    throw new Error("web_url_forbidden");
  }
  return target.toString();
}

export function registerIpc(deps: Dependencies): void {
  register("auth:requestCode", (value) => EmailInput.parse(value), ({ email }) => deps.auth.requestCode(email));
  register("auth:verifyCode", (value) => VerifyInput.parse(value), async ({ email, code }) => {
    const verified = await deps.auth.verifyCode(email, code);
    deps.onDeviceAuthenticated?.();
    return verified;
  });
  register("auth:signOut", noInput, () => deps.auth.signOut());

  register("link:departments", noInput, () => deps.api.get("/api/companion/departments", parseCompanionDepartments));
  register("link:create", (value) => LinkInput.parse(value), async (input) => {
    const linked = await deps.api.postJson("/api/companion/link", { ...input, app_version: app.getVersion() }, parseCompanionLink);
    deps.onDeviceLinked?.();
    return linked;
  });
  register("link:get", noInput, () => deps.api.get("/api/companion/link", parseCompanionContext));
  register("inbox:get", noInput, async () => {
    const inbox = await deps.api.get("/api/companion/inbox", parseCompanionInbox);
    await deps.outbox.flush();
    return { inbox, outbox_count: await deps.outbox.count() };
  });

  register("ask:send", (value) => AskQuestionInput.parse(value), (input) => deps.outbox.send(input));
  register("answer:get", (value) => IdInput.parse(value), ({ id }) => deps.api.get(`/api/companion/answers/${encodeURIComponent(id)}`, parseAnswer));
  register("questions:list", (value) => QuestionsInput.parse(value ?? {}), ({ cursor }) => {
    const query = cursor ? `?before=${encodeURIComponent(cursor.before)}&before_id=${encodeURIComponent(cursor.before_id)}` : "";
    return deps.api.get(`/api/companion/questions${query}`, parseQuestions);
  });
  register("card:get", (value) => IdInput.parse(value), ({ id }) => deps.api.get(`/api/companion/cards/${encodeURIComponent(id)}`, parseCard));
  register("card:decide", (value) => DecideInput.parse(value), ({ id, ...body }) => deps.api.postJson(`/api/companion/cards/${encodeURIComponent(id)}/decide`, body, parseCardDecision));

  register("upload:transcript", (value) => TranscriptInput.parse(value), async ({ name, title, visibility, bytes }) => {
    const form = new FormData();
    const contentType = name.toLowerCase().endsWith(".vtt") ? "text/vtt" : "text/plain";
    form.set("file", new File([bytes], name, { type: contentType }));
    form.set("title", title);
    form.set("visibility", visibility);
    return deps.api.postForm("/api/companion/transcripts", form, parseTranscriptResult);
  });
  register("members:list", noInput, () => deps.api.get("/api/companion/members", parseCompanionMembers));
  register("upload:review", parseReviewInput, (input, event) => uploadReview(
    deps.supabase,
    deps.api,
    input,
    (progress) => event.sender.send("review-upload-progress", progress),
  ));

  register("sales:sources", noInput, () => deps.api.get("/api/companion/sales-review/sources", parseSalesSources));
  register("sales:start", (value) => SalesSourceReviewRequest.parse(value), (input) => deps.api.postJson("/api/companion/sales-review", input, parseSalesStart));
  register("sales:status", (value) => SalesStatusInput.parse(value), ({ task_id }) => deps.api.get(`/api/companion/sales-review/${encodeURIComponent(task_id)}`, parseSalesStatus));

  register("settings:get", noInput, async () => Settings.parse(await deps.settingsFile.read(DEFAULT_SETTINGS)));
  register("settings:set", (value) => SettingsPatch.parse(value), async (patch) => {
    const current = Settings.parse(await deps.settingsFile.read(DEFAULT_SETTINGS));
    const next = Settings.parse({ ...current, ...patch });
    await deps.settingsFile.write(next);
    deps.onSettingsChanged?.(next);
    return next;
  });
  register("update:get", noInput, () => Promise.resolve(deps.updater?.getState() ?? { status: "unavailable" }));
  register("app:openWeb", (value) => OpenWebInput.parse(value), async ({ path }) => {
    await shell.openExternal(webTarget(path));
    return { opened: true };
  });
}
