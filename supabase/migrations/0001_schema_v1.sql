create extension if not exists pgcrypto;

-- 조직·부서·사람
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false, -- 게스트 모드 판별은 이름이 아니라 이 플래그
  created_at timestamptz default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs not null,
  name text not null,
  template text not null default 'general', -- general (MVP 1종)
  created_at timestamptz default now()
);

create table members (
  user_id uuid references auth.users on delete cascade not null,
  dept_id uuid references departments not null,
  role text not null default 'member', -- lead|member
  display_name text not null, -- 원장·인용 표시용 스냅샷의 원본
  slack_user_id text unique, -- 이메일 일치로 세팅 시 매핑
  consented_at timestamptz,
  consent_version int, -- 동의문 개정 시 재동의 판별
  primary key (user_id, dept_id)
);

-- 입력 소스와 항목 (모든 채널의 공통 스키마)
create table sources (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid references departments not null,
  kind text not null, -- slack_channel|meeting|notion_page|document
  external_id text not null, -- 채널 ID / 회의 ID / 페이지 ID
  title text,
  visibility text not null default 'dept', -- dept|leads_only
  is_principles boolean not null default false, -- 부서 원칙 문서 (departments 배열 대신 여기 플래그)
  sync_cursor text, -- 노션 last_edited_time / 슬랙 마지막 ts (재시작 시 이어받기)
  last_synced_at timestamptz,
  last_error text, -- 세팅 화면 "마지막 동기화" 표시용
  active boolean default true,
  created_at timestamptz default now()
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources not null,
  dept_id uuid references departments not null,
  meeting_url text,
  status text not null default 'scheduled', -- scheduled|bot_joined|bot_failed|transcribed|summarized|summary_failed
  status_reason text,
  started_at timestamptz,
  summary jsonb, -- {decisions[], deferred[], actions[]} 각 항목에 item_id 인용
  created_at timestamptz default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources not null,
  dept_id uuid references departments not null,
  external_ref text, -- slack ts / 전사 구간 / notion block id
  author_ext_id text, -- 슬랙 user id / 전사 화자 라벨. 어댑터가 동의 여부를 판별하는 키(미동의면 저장 안 함)
  author text,
  spoken_at timestamptz,
  content text not null, -- author는 당시 표시명 스냅샷, content는 마스킹 후 본문
  embed_status text not null default 'pending', -- pending|done|failed (실패는 재시도 큐)
  deleted_at timestamptz, -- 원문 삭제·채널 제거 시 소프트 삭제 (인용 유지용)
  created_at timestamptz default now(),
  unique (source_id, external_ref) -- 슬랙 재전송·폴링 중복 방지
);

create table ingest_events (
  event_id text primary key, -- 슬랙 event_id 멱등 처리
  received_at timestamptz default now()
);

create table classifications (
  item_id uuid references items primary key,
  label text not null, -- decision|action|info|chatter|unclassified (LLM 실패 시)
  method text not null, -- rule|llm
  confidence numeric,
  deadline_hint timestamptz,
  assignee_hint text,
  reasoning text
);

-- 결정 요청 카드와 원장
create table decision_requests (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid references departments not null,
  title text not null,
  background text not null,
  recommendation text,
  deadline timestamptz,
  assignee_id uuid references auth.users,
  visibility text not null default 'dept', -- 인용된 소스 중 가장 좁은 visibility를 상속
  status text not null default 'open', -- open|decided|deferred|rejected|needs_review (인용 검증 2회 실패)
  origin_item_id uuid references items, -- 승격 원본. open 상태에서 같은 원본은 1건만
  opened_at timestamptz default now(),
  closed_at timestamptz
);

create unique index one_open_request_per_item
  on decision_requests (origin_item_id)
  where status = 'open';

create table decisions (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid references departments not null,
  request_id uuid references decision_requests unique, -- 직접 기록이면 null. 카드 1장 = 결정 1건 (더블클릭·동시 결정 방지)
  decided_by uuid references auth.users on delete set null, -- 탈퇴해도 원장은 남는다
  decided_by_name text not null, -- 결정 당시 표시명 스냅샷 (원장은 조직 기록)
  decided_at timestamptz default now(),
  outcome text not null,
  rationale text not null,
  supersedes_id uuid references decisions, -- 정정: 새 행이 옛 행을 가리킨다. 삭제·수정 없음
  lead_time_min int -- opened_at → decided_at (파생값. 지표는 뷰 decision_metrics에서 계산)
);

create table citations (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null, -- decision_request|decision|answer
  owner_id uuid not null,
  item_id uuid references items,
  decision_id uuid references decisions,
  quote text not null
);

create table conflicts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references decision_requests not null,
  prior_decision_id uuid references decisions not null,
  explanation text not null,
  confirmed boolean
);

-- Q&A와 감사
create table answers (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid references departments not null,
  asked_by uuid references auth.users on delete set null,
  question text not null,
  answer text,
  status text not null default 'pending', -- pending|done|refused|failed (failed는 error_code 필수)
  error_code text, -- llm_timeout|llm_refusal|schema_invalid|citation_invalid|rate_limited
  refused boolean default false,
  excluded_count int default 0, -- 권한 밖 제외 건수 (감사 로그 전용)
  verified boolean,
  created_at timestamptz default now()
);

-- 비동기 작업과 비용 (아키텍처 렌즈 반영)
create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null, -- classify|embed|summarize_meeting|make_card|answer|send_slack|notion_import|slack_backfill|sweep
  payload jsonb not null,
  status text not null default 'queued', -- queued|running|done|failed
  attempts int default 0,
  run_after timestamptz default now(),
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create index jobs_claim on jobs (run_after) where status = 'queued';

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid,
  job_id uuid references jobs,
  purpose text not null,
  model text not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  duration_ms int,
  created_at timestamptz default now() -- §4 비용 상한 $100을 측정할 유일한 근거
);
