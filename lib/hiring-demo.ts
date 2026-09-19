import { HiringFile, type HiringMission, type HiringSubmission } from "@/lib/contracts";

export function validateHiringFile(file: { name: string; size: number }): string | null {
  if (!HiringFile.safeParse(file).success) return "첨부는 비어 있지 않은 2MB 이하 파일이어야 합니다.";
  if (/[\\/\u0000-\u001f]/u.test(file.name) || !/\.(txt|md|json|js|ts|tsx|css|html|svg|pdf|png|jpg|jpeg|webp|zip)$/iu.test(file.name))
    return "허용된 문서·코드·이미지·ZIP 파일을 선택해 주세요. 파일은 실행하지 않습니다.";
  return null;
}

export function validateHiringSubmission(mission: HiringMission, input: HiringSubmission): string[] {
  const errors: string[] = [];
  if (input.approach.trim().length < 30 || input.approach.length > 6000) errors.push("판단 근거를 30~6,000자로 작성해 주세요.");
  if ((!input.file && input.artifact.trim().length < 30) || input.artifact.length > 40000) errors.push("산출물을 30~40,000자로 작성하거나 파일을 첨부해 주세요.");
  if (input.file) { const error = validateHiringFile(input.file); if (error) errors.push(error); }
  if (!input.factIds.length || input.factIds.some(id => !mission.facts.some(f => f.id === id))) errors.push("이 미션의 참고자료를 하나 이상 선택해 주세요.");
  if (input.checkpoints.length !== mission.stages.length || mission.stages.some(stage => input.checkpoints.filter(c => c.stageId === stage.id && c.note.trim().length >= 10 && c.note.length <= 2000).length !== 1)) errors.push("세 작업 단계의 기록을 모두 남겨 주세요.");
  return errors;
}
