import { LABELS } from "@/lib/labels";
import Link from "next/link";
import type { TrailerGateReport, TrailerScenario } from "@/lib/contracts";
import { trailerApprovalItems } from "@/lib/trailer-gate";

export const trailerPanel = "min-w-0 rounded-2xl border border-ink/10 bg-surface p-5 sm:p-6";
export const trailerNotice = "자동 검사는 수치·전략이 가상화됐는지 판단하지 못합니다. 항목마다 직접 확인한 뒤 승인하세요.";
export const trailerStatus: Record<string,string> = LABELS.trailerStatus;
export const trailerReason: Record<string, string> = { invalid_scenario: "가상화 초안을 만들지 못했습니다", timeout: "시간이 초과됐습니다", trailer_decisions_invalid: "선택한 결정을 쓸 수 없습니다" };
export const ruleLabels = { overlap: "원문 20자 겹침", proper_noun: "고유명사", mask: "개인정보 형식", schema: "형식 오류" };
export type TrailerOriginal = { id: string; title: string | null; outcome: string; rationale: string };
export function TrailerOriginals({ originals, principles }: { originals: TrailerOriginal[]; principles: string[] }) {
  return <section className={trailerPanel}><h2 className="mt-0 text-xl">원문</h2><div className="grid gap-5">{originals.map((original) => <article key={original.id} className="border-b border-ink/10 pb-4"><h3>{original.title ?? "결정 기록의 결정"}</h3><p className="whitespace-pre-wrap break-words">{original.outcome}</p><p className="whitespace-pre-wrap break-words text-sm text-muted">{original.rationale}</p></article>)}<div><h3>원칙 문서</h3><p className="text-sm">원칙 문서 {principles.length}개가 입력에 쓰였습니다.</p><ul className="pl-5 text-sm">{principles.map((title, i) => <li key={i}>{title}</li>)}</ul></div></div></section>;
}
export function TrailerReadOnly({ scenarios, report, approvedCount, slug }: { scenarios: TrailerScenario[]; report: TrailerGateReport | null; approvedCount: number; slug: string | null }) {
  const items = trailerApprovalItems(scenarios);
  return <section className={`${trailerPanel} grid gap-4`}><h2 className="m-0 text-xl">가상화본</h2><p className="m-0 text-sm">{trailerNotice}</p><p className="m-0 text-sm">{report ? Object.entries(ruleLabels).map(([rule, label]) => `${label} ${report.violations.filter((v) => v.rule === rule).length}`).join(" · ") : "검사 결과 없음"}</p><p className="m-0">공개 승인 {approvedCount} / {items.length}</p>{items.map((item) => <p key={item.id} className="m-0 whitespace-pre-wrap rounded-xl bg-ink/5 p-3 text-sm">{item.text}</p>)}{slug ? <Link href={`/t/${slug}`} className="font-bold text-accent">체험하기 →</Link> : null}</section>;
}
