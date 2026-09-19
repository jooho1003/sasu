import type { RetroActivity } from "@/lib/contracts";

export const RETRO_PRESETS = ["development", "planning", "design", "sales", "cs", "marketing", "hr", "general"] as const;
export type RetroPreset = (typeof RETRO_PRESETS)[number];
export type RetroPresetCopy = { label: string; hint: string; kinds: readonly string[] };

export const RETRO_PRESET_COPY: Record<RetroPreset, RetroPresetCopy> = {
  development: { label: "개발", hint: "무엇을 만들고 고쳤는지, 다음에 확인할 것을 적습니다.", kinds: ["git_commit", "github_pr", "github_review", "jira_transition"] },
  planning: { label: "기획", hint: "무엇을 정리하고 결정했는지, 아직 정하지 못한 것을 적습니다.", kinds: ["notion_edit", "notion_comment", "gdrive_edit", "sasu_decision"] },
  design: { label: "디자인", hint: "화면을 어떻게 바꾸고 의견을 반영했는지 적습니다.", kinds: ["figma_version", "figma_comment", "notion_comment"] },
  sales: { label: "영업", hint: "어떤 고객 일을 처리했는지와 다음 약속을 적습니다.", kinds: ["crm_call", "crm_meeting", "crm_deal", "calendar_event"] },
  cs: { label: "고객 지원", hint: "어떤 문의를 처리했는지와 남은 일을 적습니다.", kinds: ["ticket_handled", "ticket_closed", "crm_note"] },
  marketing: { label: "마케팅", hint: "무엇을 올리고 어떤 수치를 확인했는지 적습니다.", kinds: ["social_post", "video_publish", "metric_snapshot"] },
  hr: { label: "인사", hint: "채용과 면접에서 처리한 일을 적습니다.", kinds: ["ats_stage", "ats_interview", "calendar_event"] },
  general: { label: "일반", hint: "오늘 한 일과 다음에 할 일을 적습니다.", kinds: [] },
};

export function retroPresetCopy(value: string | null | undefined): RetroPresetCopy {
  return RETRO_PRESET_COPY[(value as RetroPreset) in RETRO_PRESET_COPY ? (value as RetroPreset) : "general"];
}

export function isDeptContext(kind: string, meta: Record<string, unknown>): boolean {
  return kind === "notion_page_changed" || meta.dept_context === true;
}

export function isMetricSnapshot(kind: string): boolean {
  return kind === "metric_snapshot";
}

export type ConnectorActivityKind = Exclude<RetroActivity["kind"], "git_commit" | "claude_session" | "claude_prompt" | "codex_session" | "memory_change" | "doc_change" | "web_visit" | "web_search" | "sasu_decision" | "sasu_answer" | "sasu_card" | "sasu_review">;
