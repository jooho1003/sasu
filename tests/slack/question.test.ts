import { describe, expect, it } from "vitest";
import { prepareSlackQuestion } from "@/lib/slack/question";

const departments = [{ id: "dept-a", name: "영업팀", consented: true }, { id: "dept-b", name: "개발팀", consented: true }];
describe("Slack 질문 준비", () => {
  it("단일 소속은 자동 선택하고 멘션 제거·마스킹한다", () => {
    const result = prepareSlackQuestion("<@U123> qa@example.com에 답할까요?", departments.slice(0, 1));
    expect(result).toMatchObject({ status: "ready", deptId: "dept-a", truncated: false });
    expect(JSON.stringify(result)).not.toContain("qa@example.com");
  });
  it("복수 소속은 부서 선택을 요구하고 질문을 반환하지 않는다", () => {
    expect(prepareSlackQuestion("어떻게 결정하면 좋을까요?", departments)).toEqual({ status: "choose_department" });
  });
  it("이름 또는 ID로 소속 부서를 선택한다", () => {
    for (const prefix of ["개발팀", "dept-b"])
      expect(prepareSlackQuestion(`${prefix}: 오늘 배포해도 될까요?`, departments)).toMatchObject({ status: "ready", deptId: "dept-b", question: "오늘 배포해도 될까요?" });
  });
  it("중복 이름·외부 부서는 자동 선택하지 않는다", () => {
    expect(prepareSlackQuestion("외부팀: 오늘 배포할까요?", departments)).toEqual({ status: "choose_department" });
    expect(prepareSlackQuestion("영업팀: 오늘 배포할까요?", departments.map(d => ({ ...d, name: "영업팀" })))).toEqual({ status: "choose_department" });
  });
  it("미동의·미연결은 질문 원문을 반환하지 않는다", () => {
    expect(prepareSlackQuestion("비밀 원문 질문", [])).toEqual({ status: "not_connected" });
    expect(prepareSlackQuestion("비밀 원문 질문", [{ ...departments[0], consented: false }])).toEqual({ status: "consent_required" });
  });
  it("짧은 질문을 차단하고 긴 질문의 잘림을 알린다", () => {
    expect(prepareSlackQuestion("<@U123> 네", departments.slice(0, 1))).toEqual({ status: "too_short" });
    expect(prepareSlackQuestion("가".repeat(1001), departments.slice(0, 1))).toMatchObject({ status: "ready", question: "가".repeat(1000), truncated: true });
  });
});
