import { createHash } from "node:crypto";
export type RetentionRecord = {
  id: string;
  source_id: string;
  external_ref: string | null;
  content_version: number;
  content: string;
  author: string | null;
  spoken_at: string | null;
  created_at: string;
  visibility: string;
};
export function retentionRisk(
  settings: {
    plan: string;
    expires_at: string | null;
    retention_days: number | null;
  },
  now = new Date(),
): { state: "unknown" | "soon" | "check"; message: string } {
  if (
    settings.expires_at &&
    new Date(settings.expires_at).getTime() - now.getTime() <= 14 * 86400000
  )
    return {
      state: "soon",
      message:
        "요금제 변경 예정일이 가깝거나 지났습니다. 접근 가능한 기록을 확인해 주세요.",
    };
  if (settings.plan === "unknown" || settings.retention_days === null)
    return {
      state: "unknown",
      message: "실제 Slack 요금제와 보존 설정을 먼저 확인해 주세요.",
    };
  return {
    state: "check",
    message: "수집되지 않은 구간과 첨부를 확인한 뒤 필요한 기록을 보관하세요.",
  };
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function buildRetentionBundle(
  input: {
    sourceId: string;
    title: string;
    from: string;
    to: string;
    records: RetentionRecord[];
  },
  now = new Date(),
) {
  if (input.records.length > 5000) throw new Error("export_too_large");
  const records = input.records.map((r) => ({ ...r }));
  const markdown = [
    `# ${input.title} · 업무 기록 검토본`,
    `기간: ${input.from} 이상 ~ ${input.to} 미만`,
    `생성: ${now.toISOString()}`,
    "",
    "수집된 기록만 포함합니다. 전체 Slack 대화·스레드의 완전성을 검증하지 않았으며 첨부 파일 실물은 포함하지 않습니다.",
    "AI가 결정이나 담당자를 추론하지 않은 원문 기반 검토 자료입니다.",
    "",
    ...records.flatMap((r) => [
      `## ${r.spoken_at ?? r.created_at} · ${r.author ?? "작성자 정보 없음"}`,
      `출처: ${r.source_id} / ${r.external_ref ?? r.id} · 버전 ${r.content_version} · 범위 ${r.visibility}`,
      "",
      r.content,
      "",
      `근거 ID: ${r.id}`,
      "",
    ]),
  ].join("\n");
  const recordsJsonl = records.map((r) => JSON.stringify(r)).join("\n");
  return {
    manifest: {
      format: "sasu-records-v1",
      source_id: input.sourceId,
      created_at: now.toISOString(),
      from: input.from,
      to: input.to,
      count: records.length,
      coverage: "collected_records_only",
      attachments_included: false,
      unverified: ["missing_history", "thread_completeness", "attachments"],
      sha256: { records: digest(recordsJsonl), markdown: digest(markdown) },
    },
    records,
    markdown,
  };
}
export function verifyRetentionBundle(
  bundle: ReturnType<typeof buildRetentionBundle>,
): boolean {
  return (
    digest(bundle.records.map((r) => JSON.stringify(r)).join("\n")) ===
      bundle.manifest.sha256.records &&
    digest(bundle.markdown) === bundle.manifest.sha256.markdown &&
    bundle.records.length === bundle.manifest.count
  );
}
