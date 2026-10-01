import { describe, expect, it } from "vitest";
import {
  parseAnswer,
  parseAskStart,
  parseCard,
  parseQuestions,
  parseReviewCreated,
  parseReviewPartQueued,
  parseSalesSources,
  parseSalesStart,
  parseSalesStatus,
  parseTranscriptResult,
  parseCompanionContext,
  parseCompanionDepartments,
  parseCompanionInbox,
  parseCompanionLink,
  parseCompanionMembers,
} from "../contracts";

const deptId = "11111111-1111-4111-8111-111111111111";
const linkId = "22222222-2222-4222-8222-222222222222";

describe("companion response parsers", () => {
  it("parses the shared department, link, context, and inbox contracts", () => {
    expect(
      parseCompanionDepartments({
        departments: [{ id: deptId, name: "영업팀", role: "lead", consented: true }],
      }).departments,
    ).toHaveLength(1);
    expect(parseCompanionLink({ link_id: linkId, dept: { id: deptId, name: "영업팀" }, role: "lead" }).link_id).toBe(linkId);
    expect(
      parseCompanionContext({
        link_id: linkId,
        dept: { id: deptId, name: "영업팀" },
        role: "lead",
        display_name: "합성 팀장",
      }).display_name,
    ).toBe("합성 팀장");
    expect(parseCompanionInbox({ server_time: "2026-10-02T00:00:00+09:00", cards: [], answers: [], reviews: [], sales: [] }).cards).toEqual([]);
    expect(
      parseCompanionMembers({
        members: [
          {
            user_id: deptId,
            display_name: "합성 팀원",
            consented_at: "2026-10-02T00:00:00+09:00",
          },
        ],
      }).members,
    ).toHaveLength(1);
  });

  it("rejects fields that are not in the strict server contract", () => {
    expect(() =>
      parseCompanionInbox({
        server_time: "2026-10-02T00:00:00+09:00",
        cards: [],
        answers: [],
        reviews: [],
        sales: [],
        access_token: "must-not-cross-ipc",
      }),
    ).toThrow();
    expect(() =>
      parseCompanionMembers({
        members: [
          { user_id: deptId, display_name: "팀원", consented_at: null },
        ],
      }),
    ).toThrow();
  });

  it("parses task responses without allowing credentials to leak", () => {
    const answerId = "33333333-3333-4333-8333-333333333333";
    const jobId = "44444444-4444-4444-8444-444444444444";
    const itemId = "55555555-5555-4555-8555-555555555555";
    const taskId = "66666666-6666-4666-8666-666666666666";
    const meetingId = "77777777-7777-4777-8777-777777777777";

    expect(parseAskStart({ answer_id: answerId, job_id: jobId, truncated: false }).answer_id).toBe(answerId);
    expect(parseAnswer({ id: answerId, status: "pending", answer: null, refused: false, citations: [] }).status).toBe("pending");
    expect(parseQuestions({ questions: [], next: null }).next).toBeNull();
    expect(parseReviewCreated({ id: itemId }).id).toBe(itemId);
    expect(parseReviewPartQueued({ job_id: jobId }).job_id).toBe(jobId);
    expect(
      parseTranscriptResult({
        job_ids: [jobId],
        meeting_id: meetingId,
        summary_job_id: jobId,
        accepted: 1,
        skipped: 0,
      }).accepted,
    ).toBe(1);
    expect(parseSalesSources({ candidates: [] }).candidates).toEqual([]);
    expect(parseSalesStart({ task_id: taskId }).task_id).toBe(taskId);
    expect(parseSalesStatus({ status: "ready", web_path: `/d/${deptId}/sales-review?task_id=${taskId}` }).status).toBe("ready");
  });

  it("parses a card response with only verified display fields", () => {
    const cardId = "88888888-8888-4888-8888-888888888888";
    expect(
      parseCard({
        card: {
          id: cardId,
          dept_id: deptId,
          title: "결정할 일",
          background: "배경",
          recommendation: null,
          deadline: null,
          assignee_id: null,
          status: "open",
          visibility: "dept",
        },
        citations: [],
        conflicts: [],
        decisions: [],
      }).card.id,
    ).toBe(cardId);
  });
});
