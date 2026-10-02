# desktop-question-followup — Design

2026-10-02 · bkit PDCA · 원천: [PRD DC-13·§8](../../PRD.md), [ARCHITECTURE §6-12](../../ARCHITECTURE.md), [ADR-083](../../ADR.md)

## 1. 개요
목표·제외 범위·성공 조건은 [plan](../../01-plan/features/desktop-question-followup.plan.md)을 따른다. 기존 권한과 데이터 경계를 유지하는 renderer 연결 작업이다.

## 2. 구조·데이터 흐름·실패
`HistoryTab → preload.questions.list → E08 → my_question_history` → 선택 `answer.get → E07/현재 인용 검사` → `App(답+질문 메모리)` → `AskTab(명시적 부모)` → `ask.send → OutboxService → E06/startAsk/ask_question` → 기존 답 폴링.
목록 실패는 재시도, 상세 실패는 기록 화면 유지, 전송 403/429는 초안/부모 유지, 네트워크 보관 성공은 입력/부모 초기화 후 안내. 탭 이탈 시 세대 만료·폴링 취소. 로그아웃은 SessionApp 재마운트.

## 3. 데이터
새 테이블/마이그레이션 없음. `Questions.questions[].{id,question,status,created_at,parent_id}`, 기존 cursor `{before,before_id}`, `Answer` 재사용. App에 선택한 질문 문자열을 답과 함께 보관. AskTab의 `{id,question}|null` 부모는 메모리 한정. 기존 암호화 outbox의 parentId를 변경하지 않는다.

## 4. API/IPC 비교 목록
E06 POST `/api/companion/ask`: 기존 `{question,parent_id}`; 새 질문은 null. E07 GET `/api/companion/answers/:id`: 선택 때 매번 호출. E08 GET `/api/companion/questions`: 기존 cursor/20건 페이지. `ask:send`, `answer:get`, `questions:list` allowlist·응답 검증 유지. 새 endpoint/job 없음.

## 5. 화면·상태 체크리스트
U1 기록 진입 자동 새 조회, 불러오는 중/빈 상태/오류 재시도·한국어 상태. 이전 진입 캐시를 표시하지 않는다.
U2 더 보기 잠금·ID 중복 제거, 답 재조회 중 중복 선택 잠금. 완료 후에만 질문 화면으로 이동.
U3 다시 연 질문 표시, done/refused 답에 ‘이어 묻기’, 선택 시 원 질문과 연결 안내·textarea 포커스.
U4 ‘새 질문으로 시작’은 부모/이전 답/폴링을 초기화하고 초안은 보존. 전송 중에는 전환 금지.
U5 전송 잠금은 ref로 즉시 집행. 실패 시 초안/부모 유지, 성공/보관 시 초기화. 기존 pending/실패/거절/인용 렌더 계약 유지.
U6 이력/상세/폴링 cleanup으로 이전 탭/세션 콜백 무시. 로그아웃 시 모든 질문 상태 초기화.

## 6. 오류 처리
목록 최초 실패는 빈 이력으로 오인하지 않는 오류 상태·재시도. 페이지 실패는 현재 목록과 cursor 보존. 상세 403/404 때 오래된 답을 열지 않는다. parent 403을 null로 자동 재시도하지 않는다. 인용 없는 답 본문은 기존 Evidence 정책대로 렌더하지 않는다.

## 7. 보안
S1 기존 Bearer/SQL 본인·부서·현재 권한·하루 한도 재사용. S2 로그/영구 파일에 이력·초안 추가 저장 금지. S3 outbox 후속 질문 parent 보존·4xx 미보관. S4 세션 종료·탭 이탈 늦은 응답 무시. 서비스 역할이나 LLM 경로 변경 없음.

## 8. 검증
합성 HTTP Auth/API + 실제 Electron main/preload/renderer E2E로 U1~U6와 IPC payload를 검증한다. 합성 질문·완료/거절 답·2페이지·403/503·지연 응답 fixture를 쓴다. outbox unit으로 부모 보존/권한 거부를 검증한다. 기존 서버 ASK/답 테스트와 질문 체인 SQL 하니스, desktop/root lint/build/unit을 실행한다. 운영 메일/실제 외부 모델 검증으로 보고하지 않는다.

## 9. 의존 관계
변경: `desktop/src/renderer/src/App.tsx`, `components/AskTab.tsx`, `components/HistoryTab.tsx`. 기존 preload/main/서버/SQL은 재사용하며 회귀 테스트만 추가한다. Graft 실패 시 해당 도구 공백과 수동 import 대조를 기록한다. Archify로 이력→질문 연결 흐름을 검토한다.

## 10. 규약
기존 React/TypeScript·한국어 UI·공유 contracts를 유지한다. 신규 lib 모듈 없음. 테스트는 실제 사용자 동작·보안 경계를 검증한다. 비밀값·실사용 질문 로그 없음.

## 11. 구현·분석 가이드
phase 44 step0: 테스트 시나리오 작성/실패 확인 후 renderer 구현. step1: 회귀·권한 하니스·도구 검증, 독립 gap 분석과 보고. 분석 비교 항목은 U1~U6/S1~S4(10개)와 plan SC1~SC6이다. 정적 일치와 실제 실행 통과를 따로 보고한다. 운영 설치 파일 배포는 개발 완료와 구분한다.
