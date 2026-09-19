import { describe, expect, it } from "vitest";
import { hiringMissions } from "@/fixtures/hiring/missions";
import { validateHiringSubmission, validateHiringFile } from "@/lib/hiring-demo";

describe("5개 부서 합성 채용 미션", () => {
  it("각 직무의 자료·단계·산출물·예시를 독립적으로 제공한다", () => {
    expect(hiringMissions.map(m => m.team)).toEqual(["기획팀", "인사팀", "프론트개발팀", "백엔드개발팀", "디자인팀"]);
    expect(new Set(hiringMissions.map(m => m.deptId)).size).toBe(5);
    for (const mission of hiringMissions) {
      expect(mission.facts.length).toBeGreaterThanOrEqual(3);
      expect(mission.stages).toHaveLength(3);
      expect(mission.deliverables.length).toBeGreaterThanOrEqual(3);
      expect(mission.sample.artifact.length).toBeGreaterThan(100);
      expect(new Set(mission.facts.map(f => f.id)).size).toBe(mission.facts.length);
    }
  });
  for (const mission of hiringMissions) {
    const valid = () => ({ approach: mission.sample.approach, artifact: mission.sample.artifact, factIds: mission.facts.map(f => f.id), checkpoints: mission.stages.map(stage => ({ stageId: stage.id, note: `${stage.label}: 참고자료를 비교하고 판단 근거를 정리했습니다.` })), file: null });
    it(`${mission.team}: 근거·3단계·산출물을 갖춘 제출만 허용한다`, () => {
      expect(validateHiringSubmission(mission, valid())).toEqual([]);
      expect(validateHiringSubmission(mission, { ...valid(), checkpoints: [] })).toContain("세 작업 단계의 기록을 모두 남겨 주세요.");
      expect(validateHiringSubmission(mission, { ...valid(), factIds: ["another-team-fact"] })).toContain("이 미션의 참고자료를 하나 이상 선택해 주세요.");
      expect(validateHiringSubmission(mission, { ...valid(), approach: " ", artifact: "" }).length).toBeGreaterThanOrEqual(2);
      expect(validateHiringSubmission(mission, { ...valid(), checkpoints: [valid().checkpoints[0], valid().checkpoints[0], valid().checkpoints[0]] })).not.toEqual([]);
      expect(validateHiringSubmission(mission, { ...valid(), artifact: "a".repeat(40001) })).not.toEqual([]);
    });
  }
  it("첨부는 허용 확장자·크기로 검사하고 경로·실행 파일·빈 파일은 거부한다", () => {
    expect(validateHiringFile({ name: "answer.ts", size: 100 })).toBeNull();
    expect(validateHiringFile({ name: "wireframe.png", size: 100 })).toBeNull();
    for (const file of [{ name: "run.exe", size: 10 }, { name: "../secret.txt", size: 10 }, { name: "large.pdf", size: 2 * 1024 * 1024 + 1 }, { name: "empty.md", size: 0 }]) expect(validateHiringFile(file)).toBeTruthy();
  });
});
