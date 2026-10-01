---
template: plan-plus
version: 1.1
feature: desktop-companion
date: 2026-10-01
---

# desktop-companion Plan

원천: [PRD §3-8 DC-01~12·§4·§8-1·§11](../../PRD.md) → [ARCHITECTURE §6-11 불변식 45~49](../../ARCHITECTURE.md) → [ADR-081](../../ADR.md). bkit plan-plus 템플릿의 절을 사용하며 새 제품 결정은 원천 문서에만 둔다.

번호 메모: phase 41 작업(ADR-080·마이그레이션 0068·PRD 1.26·ARCHITECTURE §6-10·불변식 44)이 같은 날 다른 브랜치에서 진행 중이라 그다음 번호(ADR-081·phase 42·0069·PRD 1.27·§6-11·45~49)를 썼다. 병합 순서가 바뀌면 재번호한다.

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 사수에 묻고 결정하려면 브라우저 탭이나 슬랙을 열어야 하고, 새 결정 카드나 답 완료를 놓친다. |
| Solution | Windows에 설치하는 펫 앱(DC-01~12). 기기 전용 Supabase 세션을 Bearer로 보내 기존 RLS 경로를 그대로 탄다. |
| Function/UX Effect | 화면 위 캐릭터를 누르거나 단축키로 바로 묻고, 펫 상태와 Windows 알림으로 할 일을 보고, 그 자리에서 결정하고 파일을 맡긴다. |
| Core Value | 슬랙 없는 팀도 웹과 같은 권한·같은 인용 답을 받는다. 권한 판정은 여전히 `can_see()` 하나다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 브라우저·슬랙을 열지 않고 묻기·결정·일 맡기기 |
| WHO | 부서원 전체(결정·회의 기록 올리기는 기존 권한대로 lead) |
| RISK | 새 인증 경로(기기 세션·Bearer)로 권한이 새거나 해제가 늦음, 로컬에 원문이 남음, 서명 없는 설치 경고 |
| SUCCESS | 웹과 같은 답 · 알림 1분 안 · 펫에서 결정 · 설치·로그인 5분/해제 즉시 |
| SCOPE | Windows Electron 앱 + `/api/companion/*` + `device_links` + 웹 연결 기기 관리 |

## 1. User Intent Discovery

| 질문 | 답 |
|---|---|
| 핵심 목적 | 세 가지 모두: 웹·슬랙 없이 바로 질문 / 결정할 일 놓치지 않기 / 작업 맡기는 창구 |
| 대상 | 부서원 전체 |
| 첫 운영체제 | Windows 먼저 |
| 성공 기준 | 웹과 같은 답, 알림 1분 안, 펫에서 바로 결정, 설치·로그인 5분·해제 즉시 |

벤치마크(2026-10-01 조사):
- ChatGPT 데스크톱 펫 — 다른 창 위에 떠 있는 캐릭터. 상태 4종(Running·Needs input·Ready·Blocked), 클릭해 글·음성 빠른 질문, 전역 단축키(Windows `Win+Alt+P`), 사용자 정의 모양. 모양은 동작을 바꾸지 않는다. [learn.chatgpt.com/docs/pets](https://learn.chatgpt.com/docs/pets)
- OpenAI dots(2026-09-29) — 상시 개인 에이전트. ChatGPT 데스크톱·웹·모바일·Slack·Teams 어디서든 같은 맥락, 사용자 규칙으로 승인 필요 동작을 정함. [MacRumors](https://www.macrumors.com/2026/09/29/openai-launches-dots/) · [9to5Google](https://9to5google.com/2026/09/29/openai-dots-agent/)
- 가져오는 것: 화면 위 캐릭터·상태 4종·빠른 질문·단축키·여러 채널에서 같은 답. 가져오지 않는 것: 자율 작업·클라우드 컴퓨터·음성 통화(PRD §3-8 제외).

## 2. Alternatives Explored

| 안 | 내용 | 결과 |
|---|---|---|
| A | 웹 화면(`/companion`)을 띄우는 얇은 셸, 쿠키 세션 그대로 | 추천했으나 사용자가 B 선택 |
| **B** | 앱이 화면을 직접 그리고 기기 토큰으로 API 호출 | **선택**. 토큰은 자체 불투명 토큰이 아니라 기기 전용 Supabase 세션(ADR-081 결정 3) — 기능별 권한 함수 복제를 피한다 |
| C | 설치 없는 PWA + 웹 푸시 | 다른 창 위 펫 불가로 제외 |

B 안의 하위 선택: Electron vs Tauri → Electron(이 PC에 Rust·MSVC 없음, TS 단일 언어, DPAPI 내장). 자체 토큰 + service role + `*_as` RPC → 제외.

## 3. YAGNI Review

| 구분 | 항목 |
|---|---|
| 첫 버전 포함 | 상태 4종 · Windows 알림 · 전역 단축키 · 펫 모양 고르기 · 글 질문+인용 답 · 결정함 · 지난 질문 기록 · 회의 기록 올리기 · 자료 검토함 올리기 · 영업 검토 요청 · 자동 업데이트 · 끊김 때 질문 보관 · 웹 연결 기기 보기·해제(성공 기준) |
| 미룸 | 음성 질문 · 코드 서명 인증서 · 여러 부서 전환 · macOS |
| 만들지 않음 | 자율 작업 에이전트 · 새 실시간 채널(SSE/WebSocket) · 앱 전용 질문·결정 로직 · 영업 검토용 자유 텍스트 입력 경로 |

## 4. Scope

포함은 PRD DC-01~12와 그 검증(PRD §11 "데스크톱 동반 앱" 행)이다. 제외는 PRD §3-8 끝 문단과 §8-1의 데스크톱 행이다.

## 5. Requirements

| ID | 매핑 | 대조 |
|---|---|---|
| FR-01 | DC-01·02 | 투명·항상 위·드래그 펫 창, 상태 4종 모양, 동작 줄이기 설정, 모양 선택 로컬 저장 |
| FR-02 | DC-03 | 전역 단축키로 질문 입력, 트레이 열기·숨기기·연결 해제·종료 |
| FR-03 | DC-04·불변식 46 | 이메일 6자리 코드 로그인 → 부서 선택 → `device_links` 생성, 부서는 연결 행에서 결정 |
| FR-04 | DC-05·불변식 45·47 | `/api/companion/ask`·`answers/[id]`가 기존 `ask_question`·답변 job 사용, 하루 50회 공유 |
| FR-05 | DC-06 | 본인 질문 기록, 현재 인용 권한 없으면 숨김 |
| FR-06 | DC-07 | 내 담당 미결정 카드·결정/보류/반려, 기존 결정 경로·RLS·`request_id` 멱등 |
| FR-07 | DC-08·불변식 48 | 30초 상태 요약, 1분 안 펫 상태·Windows 알림 |
| FR-08 | DC-09 | 회의 기록(lead, 4MB)·자료 검토함 문서·음성 3단계 업로드, lead의 영업 원문 검토(AG-07) 요청·진행 표시(phase 41 병합 뒤) |
| FR-09 | DC-10 | 웹 연결 기기 목록·해제, 해제 뒤 다음 요청 401 |
| FR-10 | DC-11·불변식 49 | 질문만 암호화 보관(20건·24시간), 재연결 전송 후 삭제 |
| FR-11 | DC-12 | 자동 업데이트와 무결성 확인 |
| NFR-01 | 불변식 2·45 | `/api/companion/*` 요청 경로 service role 0(수집 어댑터 insert 예외만) |
| NFR-02 | 불변식 9·49 | 서버·앱 로그·로컬 파일에 질문 원문 평문 0 |
| NFR-03 | 불변식 47 | 기존 웹 경로는 Bearer를 받지 않음 |
| NFR-04 | 불변식 10·46 | 데모 부서·데모 계정은 기기 연결 불가(design §3.2) |

## 6. Success Criteria

- [ ] 웹·앱 같은 질문의 인용 가시성·거절 일치(lead·member 기기 각각).
- [ ] member 기기 `leads_only` 0건, 다른 부서 접근 403/404, 다른 사용자 `device_links` 0건.
- [ ] 새 카드 → 펫 상태·Windows 알림 1분 안(실측 시각).
- [ ] 앱 결정이 원장에 남고 연타해도 1건.
- [ ] 웹 해제 직후 다음 요청 401, 앱이 로그인 화면으로.
- [ ] 끊김 보관 → 재연결 전송 → 로컬 파일 삭제, 로컬·로그 원문 평문 0건.
- [ ] 깨끗한 Windows에서 설치→로그인→첫 답 5분 안(화면 녹화).
- [ ] 자동 업데이트 1회 실제 적용.
- [ ] 신규 `lib/companion/*` TDD, 보안 하니스(Bearer·연결·해제·교차 부서), lint·build·test, `/pdca analyze` 90% 이상.

## 7. Risks and Mitigation

| 위험 | 대응 |
|---|---|
| Supabase 세션 폐기 수단 불확실 — `auth.sessions` 삭제 권한이 없을 수 있고 access token은 최대 1시간 유효 | 사수 API는 매 요청 `device_links`로 즉시 차단(불변식 46). 리프레시 무효화 방법(SECURITY DEFINER 삭제 가능 여부·admin signOut)은 design에서 로컬·운영 실측. 직접 PostgREST 접근은 본인 RLS 권한 이상을 얻지 못함을 명시 |
| 이메일 6자리 코드 — 운영 이메일 템플릿에 코드가 없음, 기본 SMTP 발송 제한 | design에서 운영 Auth 설정(SMTP·템플릿) 확인. 템플릿 변경은 운영 반영이므로 사용자 승인 뒤 |
| 서명 없는 설치 파일 — SmartScreen 경고로 5분 기준 위협 | 설치 안내 화면에 "추가 정보 → 실행" 단계 표시, 5분 실측에 포함. 서명 인증서는 §8-1 후속 |
| 업로드 크기 — Vercel 함수 본문 4.5MB 한도 | design에서 웹 업로드가 쓰는 저장소 직접 업로드 경로를 재사용 |
| 자동 업데이트 무결성 — 코드 서명 없음 | 배포 위치(HTTPS 고정)·해시 확인, design에서 배포 위치(GitHub Releases/Vercel Blob) 결정 |
| 펫 그림 제작 | 채용 예고편 픽셀 캐릭터 스타일 재사용 검토, 캐릭터 수×상태 4종 목록을 design에서 확정 |
| 동시 세션 번호 충돌 | 번호 메모(상단) 참고, 병합 전 재확인 |

## 8. Impact Analysis

- 새로 생김: `desktop/`(Electron 앱), `lib/companion/{auth,inbox}.ts`(TDD), `app/api/companion/*`, 마이그레이션 0069(`device_links`·연결/해제 RPC), 웹 설정의 연결 기기 화면, 보안 하니스 항목.
- 바뀌지 않음: 기존 웹 경로·쿠키 세션·`can_see()`·RLS 정책·`lib/pipeline/answer.ts`·결정 원장 계약·슬랙 경로·게스트 경로.
- 문서: PRD 1.27(§3-8·§4·§8-1·§11), ADR-081, ARCHITECTURE 불변식 2·§6-11, CLAUDE.md·AGENTS.md 기술 스택·아키텍처 규칙 줄.
- Graft·Archify: 이 계획 단계에서는 실행하지 않았다(설계 단계에서 Bearer 입구와 기존 lib 함수 의존을 Graft로 확인하고, 연결·해제 흐름을 Archify로 시각화한다).

## 9. Brainstorming Log

| 단계 | 결정 |
|---|---|
| Phase 0 | 기존 요청 기록 없음(로컬 Claude·Codex 기록·리포 전체 확인). 쿠키 세션 전용·Bearer 없음·ASK는 202+2초 폴링·PRD §8-1 "PC 설치 앱 후속" 확인 |
| Phase 1 | 목적 3개 모두 · 부서원 전체 · Windows 먼저 · 성공 기준 4개 모두 |
| Phase 2 | A 추천, 사용자 B 선택 |
| Phase 3 | 위 YAGNI 표 |
| Phase 4 | 전체 구조(Electron·기기 Supabase 세션·`/api/companion/*`·30초 폴링) 승인 → 구성 요소 승인 → 데이터 흐름(연결·질문·알림/결정·해제·끊김) 승인 |
| 문서화 중 보정 | 영업 검토는 기존 계약이 확정 원문 선택 방식이라 자유 텍스트를 받지 않는다 |
| design 선택 | 설계안 C(권한·인용·작업 실행 코드만 공용 lib) · 이메일 6자리 코드 · 영업은 실제 원문 검토(AG-07) · 배포 전용 공개 GitHub 저장소(ADR-081 결정 5·8·9·10) |

## 10. Rollout

설계(`/pdca design desktop-companion`) → phase 42 step 작성·모델 배정 플랜 → 로컬 구현·검증 → `/pdca analyze`. 운영 반영(마이그레이션 0069·Auth 이메일 템플릿·설치 파일 배포)은 PRD §8의 별도 사용자 승인 뒤.
