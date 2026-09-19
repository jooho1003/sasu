import type { RetroActivity } from "@/lib/contracts";

export const RETRO_PRESETS = [
  "development",
  "planning",
  "design",
  "sales",
  "cs",
  "marketing",
  "hr",
  "general",
] as const;
export type RetroPreset = (typeof RETRO_PRESETS)[number];
export type RetroPresetCopy = {
  label: string;
  hint: string;
  kinds: readonly string[];
  sections: Record<"did" | "learned" | "decided" | "next", string>;
};

const COPY: Record<RetroPreset, Omit<RetroPresetCopy, "sections">> = {
  development: {
    label: "개발",
    hint: "무엇을 만들고 고쳤는지, 다음에 확인할 것을 적습니다.",
    kinds: [
      "git_commit",
      "github_pr",
      "github_review",
      "jira_transition",
      "linear_change",
    ],
  },
  planning: {
    label: "기획",
    hint: "무엇을 정리하고 결정했는지, 아직 정하지 못한 것을 적습니다.",
    kinds: ["notion_edit", "notion_comment", "gdrive_edit", "sasu_decision"],
  },
  design: {
    label: "디자인",
    hint: "화면을 어떻게 바꾸고 의견을 반영했는지 적습니다.",
    kinds: ["figma_version", "figma_comment", "notion_comment"],
  },
  sales: {
    label: "영업",
    hint: "어떤 고객 일을 처리했는지와 다음 약속을 적습니다.",
    kinds: ["crm_call", "crm_meeting", "crm_deal", "calendar_event"],
  },
  cs: {
    label: "고객 지원",
    hint: "어떤 문의를 처리했는지와 남은 일을 적습니다.",
    kinds: ["ticket_handled", "ticket_closed", "crm_note"],
  },
  marketing: {
    label: "마케팅",
    hint: "무엇을 올리고 어떤 수치를 확인했는지 적습니다.",
    kinds: ["social_post", "video_publish", "metric_snapshot"],
  },
  hr: {
    label: "인사",
    hint: "채용과 면접에서 처리한 일을 적습니다.",
    kinds: ["ats_stage", "ats_interview", "calendar_event"],
  },
  general: {
    label: "일반",
    hint: "오늘 한 일과 다음에 할 일을 적습니다.",
    kinds: [],
  },
};
const SECTIONS: Record<RetroPreset, string[]> = {
  general: ["한 일", "배운 것", "내린 결정", "다음에 할 일"],
  development: ["만든 것·고친 것", "배운 것", "내린 결정", "다음에 할 일"],
  planning: ["고친 문서", "논의·조사", "결정·합의", "다음에 할 일·미결"],
  design: ["바꾼 것", "받은 의견", "정한 방향", "다음에 할 일"],
  sales: ["통화·미팅·메일", "들은 것", "진행·막힘·결정", "다음 약속"],
  cs: ["처리한 상담", "반복된 문제", "도움 요청·결정", "다음에 할 일"],
  marketing: ["실행한 것", "살펴본 지표", "내린 결정", "다음에 할 일"],
  hr: ["진행한 채용·면접", "배운 것", "내린 결정", "다음에 할 일"],
};
export const RETRO_PRESET_COPY = Object.fromEntries(
  RETRO_PRESETS.map((key) => {
    const [did, learned, decided, next] = SECTIONS[key];
    return [key, { ...COPY[key], sections: { did, learned, decided, next } }];
  }),
) as Record<RetroPreset, RetroPresetCopy>;

export function retroPresetCopy(
  value: string | null | undefined,
): RetroPresetCopy {
  return RETRO_PRESET_COPY[
    RETRO_PRESETS.includes(value as RetroPreset)
      ? (value as RetroPreset)
      : "general"
  ];
}

const RECOMMENDED: Record<RetroPreset, readonly string[]> = {
  development: ["github", "jira", "linear"],
  planning: ["notion", "confluence", "google_calendar"],
  design: ["figma", "notion"],
  sales: ["hubspot", "pipedrive", "salesmap", "google_calendar"],
  cs: ["intercom", "zendesk"],
  marketing: ["youtube", "ga4", "mailchimp", "stibee"],
  hr: ["google_calendar", "wanted"],
  general: ["google_calendar"],
};
export function recommendedConnectors(value: string): readonly string[] {
  return RECOMMENDED[
    RETRO_PRESETS.includes(value as RetroPreset)
      ? (value as RetroPreset)
      : "general"
  ];
}

export function isDeptContext(
  kind: string,
  meta: Record<string, unknown>,
): boolean {
  return (
    kind === "notion_page_changed" ||
    kind === "department_snapshot" ||
    meta.dept_context === true
  );
}

export function isMetricSnapshot(kind: string): boolean {
  return kind === "metric_snapshot";
}

export type ConnectorActivityKind = Exclude<
  RetroActivity["kind"],
  | "git_commit"
  | "claude_session"
  | "claude_prompt"
  | "codex_session"
  | "memory_change"
  | "doc_change"
  | "web_visit"
  | "web_search"
  | "sasu_decision"
  | "sasu_answer"
  | "sasu_card"
  | "sasu_review"
>;
