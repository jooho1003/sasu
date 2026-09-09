import { describe, expect, it } from "vitest";

import {
  collectBackfillItems,
  type SlackMemberConsent,
} from "@/lib/adapters/slack";

describe("Slack 7일 백필", () => {
  it("동의한 사람의 수집 가능한 메시지만 마스킹해 변환한다", () => {
    const members = new Map<string, SlackMemberConsent>([
      ["U-consented", { displayName: "팀원", consented: true }],
      ["U-without-consent", { displayName: "미동의", consented: false }],
    ]);

    const items = collectBackfillItems(
      [
        {
          type: "message",
          user: "U-consented",
          ts: "1725000000.000100",
          text: "오늘까지 견적을 확인해도 될까요? 연락처 a@example.com",
        },
        {
          type: "message",
          user: "U-without-consent",
          ts: "1725000001.000100",
          text: "이 발언은 저장하면 안 됩니다.",
        },
        {
          type: "message",
          user: "U-consented",
          ts: "1725000002.000100",
          text: "👍",
        },
      ],
      {
        sourceId: "source-1",
        deptId: "dept-1",
        members,
      },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source_id: "source-1",
      author_ext_id: "U-consented",
      author: "팀원",
      content: "오늘까지 견적을 확인해도 될까요? 연락처 [이메일]",
    });
  });
});
