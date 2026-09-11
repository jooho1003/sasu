import { describe, expect, it } from "vitest";

import { classifyByRules, classifyNonDecisionByRules } from "@/lib/rules";

describe("classifyByRules", () => {
  const spokenAt = new Date("2026-09-08T01:00:00.000Z"); // 화요일 10:00 KST

  it('"이 견적 받아도 돼요?"를 결정 후보로 잡는다', () => {
    expect(
      classifyByRules({ content: "이 견적 받아도 돼요?", spokenAt }),
    ).toEqual({
      isDecisionCandidate: true,
      reasons: ["question_request"],
      deadlineHint: null,
    });
  });

  it('"점심 뭐 먹지"를 결정 후보로 잡지 않는다', () => {
    expect(classifyByRules({ content: "점심 뭐 먹지", spokenAt })).toEqual({
      isDecisionCandidate: false,
      reasons: [],
      deadlineHint: null,
    });
  });

  it.each(["같이 진행할까요", "이 방식으로 해도 될까요", "확인 부탁드립니다", "검토 부탁드립니다"])(
    "문장부호가 없어도 명시적인 요청 표현을 잡는다: %s",
    (content) => {
      expect(
        classifyByRules({ content, spokenAt }).reasons,
      ).toContain("question_request");
    },
  );

  it("물음표만 있는 일반 질문은 2인칭 요청으로 잡지 않는다", () => {
    expect(
      classifyByRules({ content: "점심 뭐 먹지?", spokenAt }).reasons,
    ).not.toContain("question_request");
  });

  it.each([
    "오늘까지 회신해 주세요",
    "내일까지 정해야 합니다",
    "금요일까지 마무리",
    "이번 주까지 검토",
    "2026-09-15에 확정",
    "9/15까지 확정",
    "9월 15일까지 확정",
  ])("마감 표현을 결정 후보로 잡는다: %s", (content) => {
    const result = classifyByRules({ content, spokenAt });

    expect(result.isDecisionCandidate).toBe(true);
    expect(result.reasons).toContain("deadline");
  });

  it('회의 정리의 "보류" 태그를 결정 후보로 잡는다', () => {
    expect(
      classifyByRules({ content: "[보류] 외주사 선정", spokenAt }),
    ).toEqual({
      isDecisionCandidate: true,
      reasons: ["deferred"],
      deadlineHint: null,
    });
  });

  it("단독 보류 태그도 결정 후보로 잡는다", () => {
    expect(
      classifyByRules({ content: "보류", spokenAt }).reasons,
    ).toContain("deferred");
  });

  it("12시간 안에 답글이 없는 질문을 결정 후보로 잡는다", () => {
    expect(
      classifyByRules({
        content: "외주사 B 견적은 어떻게 처리하나요?",
        spokenAt,
        hasReplyWithin12h: false,
      }),
    ).toEqual({
      isDecisionCandidate: true,
      reasons: ["unanswered_question_12h"],
      deadlineHint: null,
    });
  });

  it("답글 여부가 false여도 질문이 아니면 무응답 신호로 잡지 않는다", () => {
    expect(
      classifyByRules({
        content: "외주사 B 견적을 공유합니다.",
        spokenAt,
        hasReplyWithin12h: false,
      }).isDecisionCandidate,
    ).toBe(false);
  });

  it('deadlineHint는 "금요일까지"를 spokenAt 이후 가장 가까운 금요일 KST로 해석한다', () => {
    const result = classifyByRules({ content: "금요일까지 결정", spokenAt });

    expect(result.deadlineHint?.toISOString()).toBe(
      "2026-09-11T14:59:59.999Z",
    );
  });

  it("오늘·내일·이번 주 마감을 KST 날짜의 끝으로 해석한다", () => {
    expect(
      classifyByRules({ content: "오늘까지", spokenAt }).deadlineHint?.toISOString(),
    ).toBe("2026-09-08T14:59:59.999Z");
    expect(
      classifyByRules({ content: "내일까지", spokenAt }).deadlineHint?.toISOString(),
    ).toBe("2026-09-09T14:59:59.999Z");
    expect(
      classifyByRules({ content: "이번 주까지", spokenAt }).deadlineHint?.toISOString(),
    ).toBe("2026-09-13T14:59:59.999Z");
  });

  it("명시적 날짜를 KST 마감 시각으로 해석한다", () => {
    expect(
      classifyByRules({ content: "2026-09-15까지", spokenAt }).deadlineHint?.toISOString(),
    ).toBe("2026-09-15T14:59:59.999Z");
    expect(
      classifyByRules({ content: "9월 15일까지", spokenAt }).deadlineHint?.toISOString(),
    ).toBe("2026-09-15T14:59:59.999Z");
  });

  it("해석 불가한 표현에 deadlineHint null을 준다", () => {
    expect(
      classifyByRules({ content: "다음 스프린트에 정리", spokenAt }).deadlineHint,
    ).toBeNull();
  });
});

describe("classifyNonDecisionByRules", () => {
  it("실행 요청을 action으로 분류한다", () => {
    expect(
      classifyNonDecisionByRules("다음 주 월요일까지 QA 업체 세 곳의 견적을 받아 주세요."),
    ).toMatchObject({ label: "action" });
  });

  it("업무 현황 공유를 info로 분류한다", () => {
    expect(
      classifyNonDecisionByRules("이번 분기 릴리스 창구는 매주 수요일 오후 2시입니다."),
    ).toMatchObject({ label: "info" });
  });

  it("일상 대화를 chatter로 분류한다", () => {
    expect(classifyNonDecisionByRules("오늘 점심은 김치찌개 어때요?")).toMatchObject({
      label: "chatter",
    });
  });
});
