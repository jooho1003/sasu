import { mask } from "@/lib/mask";

export type SlackQuestionDepartment = { id: string; name: string; consented: boolean };
export function prepareSlackQuestion(text: string, departments: SlackQuestionDepartment[]):
  | { status: "ready"; deptId: string; question: string; truncated: boolean }
  | { status: "not_connected" | "choose_department" | "consent_required" | "too_short" } {
  if (!departments.length) return { status: "not_connected" };
  let question = text.replace(/<@[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
  const colon = question.indexOf(":");
  const prefix = colon >= 0 ? question.slice(0, colon).trim() : "";
  const matches = departments.filter(d => d.id === prefix || d.name === prefix);
  const department = matches.length === 1 ? matches[0] : departments.length === 1 ? departments[0] : null;
  if (!department) return { status: "choose_department" };
  if (!department.consented) return { status: "consent_required" };
  if (matches.length === 1) question = question.slice(colon + 1).trim();
  if (question.length < 5) return { status: "too_short" };
  const masked = mask(question);
  return { status: "ready", deptId: department.id, question: masked.slice(0, 1000), truncated: masked.length > 1000 };
}
