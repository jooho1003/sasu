import { randomUUID } from "node:crypto";
import { registerHandler } from "@/lib/jobs";
import { metadataBase } from "@/lib/site";
import { openDirectMessage, postMessage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ReminderDelivery = { busy?: boolean; requestId: string; deptId: string; slackUserId: string; kind: string };

export async function scheduleCardReminders(): Promise<void> {
  const result = await createServiceSupabaseClient().rpc("schedule_card_reminders");
  if (result.error) throw new Error("Reminder scheduling failed");
}

export async function sendCardReminder(reminderId: string, generation: number): Promise<void> {
  const client = createServiceSupabaseClient();
  const lease = randomUUID();
  const args = { p_id: reminderId, p_generation: generation, p_lease: lease };
  const claimed = await client.rpc("claim_card_reminder", args);
  if (claimed.error) throw new Error("Reminder claim failed");
  const delivery = claimed.data as ReminderDelivery | null;
  if (!delivery) return;
  if (delivery.busy) throw Object.assign(new Error("Reminder lease busy"), { error_code: "rate_limited", retryAfterSeconds: 30 });
  try {
    const dm = await openDirectMessage(delivery.slackUserId);
    const href = new URL(`/d/${encodeURIComponent(delivery.deptId)}/cards/${encodeURIComponent(delivery.requestId)}`, metadataBase()).href;
    const text = delivery.kind === "deadline" ? "마감이 지난 결정이 있습니다. 결정 카드를 확인해 주세요." : "다시 확인할 결정이 있습니다. 결정 카드를 확인해 주세요.";
    await postMessage({ channel: dm.id, text, blocks: [
      { type: "section", text: { type: "plain_text", text, emoji: false } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "결정 카드 보기", emoji: false }, url: href, action_id: "reminder_open_card" }] },
    ], mrkdwn: false, parse: "none", unfurl_links: false, unfurl_media: false });
    const completed = await client.rpc("finish_card_reminder", { ...args, p_sent: true, p_error: null });
    if (completed.error || completed.data !== true) throw new Error("Reminder completion failed");
  } catch (error) {
    const released = await client.rpc("finish_card_reminder", { ...args, p_sent: false, p_error: "slack_delivery_failed" });
    if (released.error) throw new Error("Reminder release failed");
    throw error;
  }
}

export function registerReminderHandler(): void {
  registerHandler("send_reminder", async (payload: unknown) => {
    if (!payload || typeof payload !== "object") throw new Error("Invalid reminder job");
    const id = Reflect.get(payload, "reminderId"), generation = Reflect.get(payload, "generation");
    if (typeof id !== "string" || typeof generation !== "number" || !Number.isSafeInteger(generation) || generation < 1) throw new Error("Invalid reminder job");
    await sendCardReminder(id, generation);
  });
}
