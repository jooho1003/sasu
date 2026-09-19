import { randomUUID } from "node:crypto";
import { registerHandler } from "@/lib/jobs";
import { metadataBase } from "@/lib/site";
import { buildSlackAnswerMessage, type SlackAnswerCitation } from "@/lib/slack/answer";
import { getMessagePermalink, postMessage, updateMessage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Delivery = {
  answer_id: string; channel: string; thread_ts: string; message_ts: string | null;
  status: string; scope: "user" | "channel"; dept_id: string; answer: string | null;
  citations: Array<SlackAnswerCitation & { slackChannel?: string; slackTs?: string; decisionId?: string }>;
};
const OPTIONS = { mrkdwn: false, parse: "none", unfurl_links: false, unfurl_media: false } as const;
function failure() { return new Error("slack_delivery_database_failed"); }

/** The SQL claim is the authority for recipient, scope and every stored citation. */
export async function deliverSlackAnswer(answerId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const rpc = (name: string, args: Record<string, unknown>) => client.rpc(name, args).abortSignal(AbortSignal.timeout(10_000));
  const lease = randomUUID();
  const claim = await rpc("claim_slack_answer_delivery", { p_answer: answerId, p_lease: lease });
  if (claim.error) throw failure();
  if (!claim.data) return;
  if (claim.data.busy) throw Object.assign(failure(), { error_code: "slack_rate_limited", retryAfterSeconds: claim.data.retry_after_seconds ?? 120 });
  const row = claim.data as Delivery;
  let messageTs = row.message_ts;
  try {
    if (!messageTs) {
      // Only the fixed progress notice is posted. Evidence is sent by update,
      // after its timestamp is durably saved, so a lost POST response cannot
      // result in multiple independently posted answers.
      const posted = await postMessage({ channel: row.channel, thread_ts: row.thread_ts,
        text: "부서 기록을 찾아보고 있습니다. 최대 2분 정도 걸릴 수 있습니다. 결과가 늦으면 웹의 사수에게 묻기에서 확인해 주세요.", blocks: [], ...OPTIONS,
        client_msg_id: answerId });
      messageTs = posted.ts;
      if (posted.channel !== row.channel) throw failure();
      const stored = await rpc("record_slack_answer_message", { p_answer: answerId, p_lease: lease, p_message_ts: messageTs });
      if (stored.error || stored.data !== true) throw failure();
    }
    if (row.status !== "pending") {
      const citations = await Promise.all(row.citations.map(async citation => {
        const deptUrl = new URL(`/d/${encodeURIComponent(row.dept_id)}`, metadataBase()).href;
        const enriched: SlackAnswerCitation = { ...citation, href: citation.decisionId ? `${deptUrl}/ledger#decision-${encodeURIComponent(citation.decisionId)}` : deptUrl,
          linkLabel: citation.decisionId ? "결정 기록 보기" : "부서에서 보기" };
        if (citation.slackChannel && citation.slackTs) {
          try { enriched.href = await getMessagePermalink({ channel: citation.slackChannel, messageTs: citation.slackTs }); enriched.linkLabel = "원문 보기"; } catch { /* Quote remains valid without optional link. */ }
        }
        return enriched;
      }));
      const text = row.status === "failed"
        ? "답변을 완료하지 못했습니다. 웹의 사수에게 묻기에서 다시 질문해 주세요."
        : "이 질문에 답할 근거를 부서 기록에서 확인하지 못했습니다. 웹에서 기록과 연결 상태를 확인해 주세요.";
      const message = row.status === "done" && row.answer
        ? buildSlackAnswerMessage({ answer: row.answer, citations, scope: row.scope })
        : { text, blocks: [], ...OPTIONS };
      await updateMessage({ channel: row.channel, ts: messageTs, ...message });
    }
    const finished = await rpc("finish_slack_answer_delivery", {
      p_answer: answerId, p_lease: lease, p_message_ts: messageTs, p_sent: row.status !== "pending",
    });
    if (finished.error || finished.data !== true) throw failure();
  } catch (error) {
    const code = error && typeof error === "object" && "error_code" in error && typeof error.error_code === "string"
      ? error.error_code : "slack_api_failed";
    await rpc("release_slack_answer_delivery", { p_answer: answerId, p_lease: lease, p_error: code });
    throw error;
  }
}

export function registerSlackAnswerDeliveryHandler() {
  registerHandler("deliver_slack_answer", async (payload: unknown) => {
    if (!payload || typeof payload !== "object" || !("answerId" in payload) || typeof payload.answerId !== "string") throw failure();
    await deliverSlackAnswer(payload.answerId);
  });
}
