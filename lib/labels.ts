import type { z } from "zod";
import type { CardStatus, AnswerStatus, ItemLabel, Visibility, MemberRole, TrailerInviteStatus, TrailerStatus, InviteAttempt, ReviewStatus, JobStatus, NotionRootState, AnswerDeliveryState, RetroDayRow, RetroActivity } from "@/lib/contracts";

export const LABELS = {
  decisionAction:{decided:"결정하기",deferred:"미루기",rejected:"돌려보내기",open:"다시 열기"} satisfies Record<Extract<z.infer<typeof CardStatus>,"decided"|"deferred"|"rejected"|"open">,string>,
  cardStatus:{open:"아직 결정 안 함",decided:"결정함",deferred:"미룸",rejected:"돌려보냄",needs_review:"팀장 확인 필요",merged:"다른 카드에 합침"} satisfies Record<z.infer<typeof CardStatus>,string>,
  answerStatus:{pending:"찾는 중",done:"답변 완료",refused:"근거 없음",failed:"답을 만들지 못함"} satisfies Record<z.infer<typeof AnswerStatus>,string>,
  itemLabel:{decision:"결정 필요",action:"할 일",info:"정보",chatter:"잡담",unclassified:"아직 못 나눔"} satisfies Record<z.infer<typeof ItemLabel>,string>,
  visibility:{dept:"부서 전체",leads_only:"팀장만"} satisfies Record<z.infer<typeof Visibility>,string>,
  memberRole:{lead:"팀장",member:"팀원"} satisfies Record<z.infer<typeof MemberRole>,string>,
  trailerStatus:{generating:"만드는 중",checking:"확인 중",review:"확인 필요",published:"공개됨",unpublished:"거둠",failed:"만들지 못함"} satisfies Record<z.infer<typeof TrailerStatus>,string>,
  inviteStatus:{pending:"아직 안 봄",opened:"확인함",consented:"동의함",submitted:"제출함",scored:"점수 계산 완료",expired:"기한 지남",revoked:"거둠",withdrawn:"제출 취소",purged:"완전히 지움"} satisfies Record<z.infer<typeof TrailerInviteStatus>,string>,
  inviteAttempt:{scoring:"점수 매기는 중",scored:"점수 계산 완료",failed:"점수 매기지 못함"} satisfies Record<z.infer<typeof InviteAttempt>,string>,
  reviewStatus:{uploading:"올리는 중",processing:"글로 바꾸는 중",ready:"확인 가능",failed:"처리하지 못함",cancelled:"중단됨",deleted:"지웠음"} satisfies Record<z.infer<typeof ReviewStatus>,string>,
  jobStatus:{queued:"기다리는 중",running:"처리 중",done:"완료",failed:"처리하지 못함"} satisfies Record<z.infer<typeof JobStatus>,string>,
  notionRootState:{pending:"기다리는 중",discovering:"찾는 중",idle:"가져옴",paused_consent:"동의 확인 필요",paused_limit:"한도 확인 필요",failed:"가져오지 못함",disabled:"연결 끊김"} satisfies Record<z.infer<typeof NotionRootState>,string>,
  answerDelivery:{pending:"보내는 중",sent:"보냈음",failed:"다시 보내기 필요",cancelled:"보내기 중단됨"} satisfies Record<z.infer<typeof AnswerDeliveryState>,string>,
  retroStatus:{collecting:"모으는 중",drafting:"초안 만드는 중",draft:"초안",needs_review:"확인 필요",confirmed:"확정함",failed:"만들지 못함"} satisfies Record<z.infer<typeof RetroDayRow>["status"],string>,
  reminderState:{pending:"예약됨",queued:"보내기 대기",sending:"보내는 중",sent:"보냈음",failed:"다시 예약 필요",cancelled:"취소됨"},
  documentStatus:{processing:"정리 중",summary_failed:"확인 필요",summarized:"정리 완료"},
  ledgerStatus:{decided:"결정함",direct:"직접 기록"},
} as const;
export function label<K extends keyof typeof LABELS>(kind:K,value:keyof (typeof LABELS)[K]):string {
  return LABELS[kind][value] as string;
}
/** Untrusted/legacy responses never fall back to their raw wire value. */
export function labelFrom<K extends keyof typeof LABELS>(kind:K,value:unknown):string {
  if(value===null||value===undefined)return "—";
  return typeof value==="string"&&Object.hasOwn(LABELS[kind],value)?label(kind,value as keyof (typeof LABELS)[K]):"확인 필요";
}

export const UI_LABELS = {
  ledger: "결정 기록",
  reviews: "올린 자료",
  roles: "문서 점수표",
  retention: "기록 보관",
  settings: "설정",
  lead: "팀장",
  dept: "부서 공개",
  leadsOnly: "팀장만",
  self: "본인만",
  synthetic: "가상",
  masking: "가리기",
  sync: "새로 가져오기",
} as const;
export const RETRO_ACTIVITY_LABELS = {
  git_commit:"코드 변경",claude_session:"개발 대화",claude_prompt:"개발 질문",codex_session:"개발 대화",memory_change:"메모 변경",doc_change:"문서 변경",web_visit:"찾아본 문서",web_search:"검색",
  sasu_decision:"내린 결정",sasu_answer:"물어본 것",sasu_card:"처리한 카드",sasu_review:"확정한 자료",slack_message:"슬랙에 쓴 글",meeting_attended:"참석한 회의",notion_page_changed:"오늘 부서에서 바뀐 것",manual_note:"직접 쓴 한 줄",voice_note:"음성으로 남긴 한 줄",
  figma_version:"저장한 화면",figma_comment:"화면에 남긴 의견",notion_edit:"편집한 문서",notion_comment:"문서에 남긴 의견",gdrive_edit:"편집한 문서",gdrive_comment:"문서에 남긴 의견",gdrive_rename:"문서 이름 변경",confluence_edit:"편집한 문서",confluence_comment:"문서에 남긴 의견",
  github_pr:"코드 변경 제안",github_review:"코드 검토",github_push:"올린 코드",jira_transition:"업무 상태 변경",jira_worklog:"남긴 작업 기록",linear_change:"업무 내용 변경",crm_call:"기록한 통화",crm_meeting:"기록한 미팅",crm_email:"기록한 메일",crm_note:"상담 메모",crm_deal:"영업 진행",calendar_event:"등록된 일정",ticket_handled:"처리한 상담",ticket_closed:"마친 상담",ats_stage:"채용 진행",ats_interview:"진행한 면접",social_post:"게시한 글",video_publish:"게시한 영상",department_snapshot:"부서 현황",metric_snapshot:"확인한 지표",
} satisfies Record<RetroActivity["kind"],string>;
