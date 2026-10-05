# desktop-upload-recovery Analysis Report

> Analysis Type: 독립 Gap Analysis / 계약·코드·실행 증거 검토  
> Project: 사수(SASU) / desktop 0.1.2 릴리스 작업 트리  
> Analyst: desktop_verify (구현 담당 stack_review와 분리)  
> Date: 2026-10-04  
> Design: [desktop-upload-recovery.design.md](../02-design/features/desktop-upload-recovery.design.md)

bkit PDCA `analyze`와 설치된 analysis template 1.3의 Context Anchor·전략·설계·계약·실행·품질·구조·규칙 절을 적용했다. 실행하지 않은 API/권한·조합을 100%로 계산하지 않는다.

## Pipeline References

| 원천 | 비교 범위 |
|---|---|
| [PRD](../PRD.md) §3-8 DC-09·§8 | 기존 문서/음성 업로드와 웹 검토함 인계, 완료 조건 |
| [ARCHITECTURE](../ARCHITECTURE.md) §6-12 | 기기 Bearer·좁은 IPC·서버 권한·현재 화면 경계 |
| [ADR](../ADR.md) ADR-087 | 기존 desktop 구조·불변식 유지 |
| [Plan](../01-plan/features/desktop-upload-recovery.plan.md) | FR1~5·SC1~5 |
| [Design](../02-design/features/desktop-upload-recovery.design.md) | U1~7/S1~2·API·구조 |
| [AI-DEVELOPMENT](../AI-DEVELOPMENT.md), [phase step0](../../phases/48-desktop-upload-recovery/step0.md) | red/green·도구·실행 증거 |
| [구현자 검증](../verification/48-desktop-upload-recovery/verification.md), [step0 증거](../verification/48-desktop-upload-recovery/step0.md) | 실제 기능·실패·한계 |

## Context Anchor

| Key | Value |
|---|---|
| WHY | DC-09 업로드·웹 인계 생명주기 복구 |
| WHO | 동의한 비데모 부서 lead |
| RISK | 중복 업로드·이탈 뒤 후속 행동·접수 전 링크 |
| SUCCESS | SC1~5 실행 및 U1~7/S1~2 대조 |
| SCOPE | PRD §3-8 DC-09·§8 / ARCHITECTURE §6-12 / 기존 desktop-companion 설계 |

## Strategic Alignment Check

새 기능/API/DB 결정을 추가하지 않고 기존 자료 승인·업로드의 중복 시작, 늦은 응답, 웹 인계 순서를 복구했다. lead 화면 진입은 기존 WorkTab, 실제 동의·부서·비데모·현재 참여자 집행은 기존 서버/RLS에 남는다. UI 검사를 권한 집행으로 계산하지 않았다.

### Success Criteria Status

| ID | 요구 | 실제 근거·판정 |
|---|---|---|
| SC1 | 지연 업로드 1회·접수 전 링크0·입력 동결·성공 웹/읽음 | 충족: production 접수/연타/동결/링크/웹·seen 시나리오. accepted는 응답 ID 후에만 기록 |
| SC2 | 실패 링크0·초안/동의 보존·자동 재전송0·수동 retry | 충족: 503 실패 후 입력/동의 유지, 대기 중 POST 증가0, 수동 성공 |
| SC3 | 준비/업로드/참여자 지연 후 이탈 경계 | 충족하는 대표 경로 실행: read/hash 후 동일 work 이탈, decode 후 다른 탭, 업로드 후 탭/동일 탭/로그아웃, members 종류 전환. 모든 await×모든 이탈의 곱집합 실행을 뜻하지 않음 |
| SC4 | 웹 실패 미읽음·오류/retry·늦은 웹/읽음 폐기 | 충족: 웹 실패 seen0, 수동 retry·연타1; 지연 웹 후 다른 탭에서 seen 미시작, 늦은 읽음 오류 안내 폐기 |
| SC5 | members 상태·종류·개발 StrictMode·lint/build/unit·기존 회귀·독립 분석 | 충족하는 관측 범위: production14, development3, desktop78/lint/build, 변경 후 기존41 고유 시나리오의 실행 간 통과, 본 독립 분석. Strict members pending effect replay 직접 실행은 미확보 |

**SC 판정:** 5/5의 요구 흐름을 위 실행 범위로 확인했다. 이 숫자는 권한/음성 의미 정확도나 모든 지연 조합의 커버리지 점수가 아니다. SC5의 개발 모드 관측은 아래와 같이 한정한다.

### Decision Record Verification

PRD의 승인 자료와 기존 웹 검토함 사용, Plan의 제품 1파일 복구, Design의 기존 state/ref 선택을 따랐다. 새 controller·서버 outbox·자동 재전송·영구 캐시를 도입하지 않았다. 별도 upload fixture 원칙은 지켰다. 기존 followup fixture의 운영체제 창 준비는 독립 최종 회귀 중 보완했으며 제품·행동 assertion 변경은 없다.

## 1. Analysis Overview

독립 검토는 실제 [WorkReviewUpload.tsx](../../desktop/src/renderer/src/components/WorkReviewUpload.tsx) 전체와 WorkTab/App의 재마운트·onSeen, preload/main/Storage/companion 서버 소비 계약을 읽고, 설계 목록 및 실제 로그에 대조했다. 구현 담당의 자기 보고만으로 통과 처리하지 않았다. 제품 변경 전 3개 red와 변경 후 production14/development3의 원시 기록, lint/build/unit 및 최종 기존 회귀를 확인했다. 독립 검토자가 실행한 post48 회귀는 합성 HTTPS fixture의 실제 Electron main/preload/renderer다.

## 2. Gap Analysis

### 2.1 API·Data·Component Structure

제품 변경은 WorkReviewUpload 1파일이다. file/title/kind/visibility/synthetic/participants/consent를 유지하고, active/generation·upload/open 잠금·accepted·members 종류 세대/잠금을 메모리에 추가했다. DB·영구 캐시·계약 스키마·preload/main/API를 새로 추가하지 않았다. App workKey/세션 재마운트와 WorkTab 소비자를 재사용한다. 접수 전 UUID는 로컬 변수이며 `reviewId`는 성공한 `result.id`로만 설정한다.

### 2.2 Functional Depth / UI Checklist

아래 행의 일치는 파일 존재가 아니라 실제 handler·상태·경계 구현과 실행 증거를 대조한 결과다.

| 항목 | 구현 위치(WorkReviewUpload) | 실행·정적 대조 | 판정 |
|---|---|---|---|
| U1 입력/handler 동결·한 IPC | upload81~85, edit66~78, frozen154, controls161~179 | 지연 제출 연타1·파일/제목/가시성/동의 동결, drop/ref 검사 | 일치 |
| U2 성공 뒤 링크·실패 보존 | upload118~130, link182 | 접수 전/실패 링크0, 성공 ID/초안·동의/수동 retry | 일치 |
| U3 await 뒤 current·정리 | cleanup40~43, upload95~134 | read/hash/decode/업로드 이탈·close 실패 실행. close await 후 current 확인은 정적 대조 | 일치, 조합 한정 |
| U4 open→current→seen | open137~152 | 웹 실패 미읽음/retry/연타, 늦은 웹·읽음 오류 폐기 | 일치 |
| U5 members 상태·단일 조회 | loadMembers45~62, UI171~176 | loading/error/empty/retry, 오류 때 이전 선택 숨김, 서버 현재 동의 검사 | 일치 |
| U6 종류/이탈·개발 경로 | members current50·changeKind74~78, cleanup42 | 늦은 종류 응답 폐기; 실제 dev singleflight·loading 완료. pending effect replay 미실행 | 일치, 관측 한정 |
| U7 로컬 진행·접수 중복 금지 | accepted36/68/82/126, progress94/120/127/132, submit179 | 식별자 없는 fake progress 무시, 접수 후 같은 초안 submit 금지·명시 편집 링크 초기화 | 일치 |
| S1 기존 보안 유지 | 기존 IPC/Storage/API 소비, upload93·122, open144 | 좁은 capability·Bearer·lead/동의/비데모·RLS·현재 참여자·비공개 Storage·origin 읽기 대조 | 일치, 실제 권한은 별도 검증 |
| S2 로그·SDK/DB/영구 저장 없음 | import2~4·UUID119·accepted126 | 원문/질문/토큰 새 로그 및 새 SDK/LLM/DB/영구 저장 없음 | 일치 |

**설계 목록 일치율:** U1~7/S1~2 **9/9(100%)**, 누락·shallow 구현 0. 이 점수는 정적/기능 설계 목록에 한정하며 미실행 runtime을 대체하지 않는다. 90% 미만의 구현 gap이 확인되지 않아 기능 iterate를 요구하지 않는다.

### 2.3 API Contract Verification: 설계↔서버↔클라이언트

| 기존 계약 | 클라이언트·main | 서버 | 판정 |
|---|---|---|---|
| E17 members.list | preload→members:list→ApiClient GET, strict 응답 parser | `/api/companion/members`: requireDeviceContext, 현재 부서·동의 멤버 | 정적 일치 |
| E12 upload.review | 좁은 IPC→parseReviewInput→storage-upload→reviews POST, 반환 ID 대조·비공개 원본/parts | `/api/companion/reviews`: Bearer context·ReviewCreate/한도→create_review | 정적 일치 |
| E13 parts queue | 기존 storage-upload가 index별 queue 요청·job_ids 수집 | `/api/companion/reviews/[id]/parts`: 현재 부서/RLS review·queue_review_part | 정적 일치 |
| 웹/읽음 | 기존 origin 제한 app.openWeb, onSeen(id,current)·App rememberSeen current | 기존 OS/설정 capability | 정적 일치, 실패/늦은 응답은 Electron 실행 |

서버 계약 3/3 정적 일치. 사용자 요청에 service role을 추가하거나 `can_see()`를 renderer에 복제하지 않았다. 서버 부서/사용자 값은 기존 검증 세션 경계에 남는다. 이 표의 코드 대조와 합성 HTTP 응답은 실제 운영 Storage/RLS 권한의 증명이 아니다.

### 2.4 Runtime Verification Results

| 실제 실행 | 결과 | 원시 근거 |
|---|---|---|
| 제품 변경 전 red | 접수 전 링크·실패 링크·늦은 hash 후 업로드의 실제 3 누락, exit1 | [red](../verification/48-desktop-upload-recovery/step0-red.txt) |
| 업로드 복구 production | 14 PASS, exit0, 1.1분 | [green](../verification/48-desktop-upload-recovery/step0-green.txt) |
| 실제 development React | 3 PASS, exit0, 15.6초 | [dev](../verification/48-desktop-upload-recovery/strict-green.txt) |
| desktop lint/build/unit | lint/build exit0, 12 files/78 PASS | [lint](../verification/48-desktop-upload-recovery/step0-lint.txt), [build](../verification/48-desktop-upload-recovery/desktop-build.txt), [unit](../verification/48-desktop-upload-recovery/desktop-test.txt) |
| post48 기존41 시도 | 34 PASS·1 창 준비 timeout·6 미실행, exit1, 3.5분 | [41 시도](../verification/44-desktop-question-followup/continuation-post48-electron-final.txt) |
| 남은7 재검증 | 5 PASS·1 창 준비 timeout·1 미실행, exit1, 45.6초 | [7 시도](../verification/44-desktop-question-followup/continuation-post48-electron-last7.txt) |
| 마지막2 재검증 | 2 PASS, exit0, 17.1초 | [2 통과](../verification/44-desktop-question-followup/continuation-post48-electron-last2.txt) |

변경 후 기존 **고유41 시나리오를 실행 간 모두 통과**했다. 단일 명령의 41/41 PASS가 아니다. 실패와 재검증을 숨기지 않으며, production14·development3·desktop78을 하나의 커버리지 수치로 더하지 않는다. 원시 로그의 테스트 환경은 합성 HTTPS Auth/companion/Storage이고 실제 main/preload/renderer/암호화 설정/OS shell 경계를 사용한다.

L1 실제 운영 companion/API 업로드 curl·실제 고객 Storage·전체 end-to-end 백엔드 쓰기는 이번 검토에서 미실행이다. L2/L3는 같은 Electron 시나리오에 중복되므로 별도 분모로 합산하지 않는다. template의 L1/L2/L3 가중 runtime 점수와 이를 포함한 overall 점수는 **N/A**다. 테스트 pass 수를 미측정 endpoint/branch coverage 100%로 변환하지 않는다.

### 2.5 StrictMode·실패 기록·검증 한계

실제 dev hook은 mounted WorkReviewUpload의 `bundleType:1`, `StrictEffects:true`, `cleanupGeneration:1`을 관측했다. 초기 kind=document의 mount cleanup replay 증거와, 이후 audio 전환 시 members 단일 조회·loading 종료·error/retry·종류 전환·현재 참여자 WAV 제출 증거를 분리한다. members 읽기는 update effect로 시작하므로 **pending members request effect의 setup/cleanup/setup을 직접 실행했다고 주장하지 않는다**. 같은 종류 pending read를 이어받는 current/ref 구현은 정적 검토 범위다.

SC3의 대표 실행 외에 read/hash/decode/members/open/seen 각각의 탭·동일 탭·로그아웃 전 조합, 지연 context.close 뒤 이탈, 모든 members 오류/이탈 조합을 추가로 실행하지 않았다. 실제 WAV 2초 제출은 codec/계약 증거이며 실제 음성 의미 정확도·30분 실부하 측정은 아니다. 이미 시작한 서버 저장/OS 열기를 취소한다고 주장하지 않는다.

업로드 owner의 [초기 TLS fixture 실패](../verification/48-desktop-upload-recovery/step0-fixture-tls.txt) 및 [최초 green 시간 초과](../verification/48-desktop-upload-recovery/step0-green-first-timeouts.txt)는 제품 red3과 분리 보존했다. owner는 loopback 테스트 인증서 검증과 소유 창 show/focus 준비를 보완한 뒤 진단 단독→최종14를 실행했다.

독립 post48 최초 실행도 [원시 로그](../verification/44-desktop-question-followup/continuation-post48-electron.txt)와 [contexts](../verification/44-desktop-question-followup/post48-first-failure-contexts/)에 보존했다. case1 screenshot은 fonts-ready 후30초, 다른 case는 click의 visible/stable 대기30초였다. 기존 panel blur 때 숨김과 fixture의 표시 경계를 읽어, **지원된 settings IPC의 합성 프로필 panelPinned:true 및 소유 창 show/focus만** 준비에 적용했다. 실패4 [진단](../verification/44-desktop-question-followup/continuation-post48-electron-diagnostic.txt)은 4 PASS/14.3초였다. 다음41 시도의 custom login/polling 경로가 준비 helper를 우회해 같은 timeout이 남아, 해당 준비만 맞춰 위 마지막7/2를 실행했다. 로그아웃 후는 settings를 쓰지 않고 native show/focus만 사용하므로 설정 파일 제거·`panelPinned:false`·기본 pet·seen 초기화 assertion을 그대로 통과했다. 제품 blur handler, React 코드, 동작 assertion·click timeout을 바꾸지 않았다. native diagnostics는 visible:true/minimized:false를 관측했고 focused는 true/false 모두 있었다. OS focus를 항상 획득했다고 주장하지 않는다.

## 3. Code Quality and Security Analysis

확실한 추가 제품 결함은 발견하지 않았다. upload/open은 React state 반영 전 ref를 잠그며, current 검사 후에만 상태/후속 행동을 수행한다. close 실패를 catch한 뒤 current면 잠금을 풀고, open·onSeen 거절도 catch한다. members 종류 변경은 버전을 폐기하고 이전 결과가 새 요청을 풀지 못하게 한다. 오류 시 멤버/선택을 UI에서 숨기고 성공 목록으로 선택을 필터링한다. complexity 자동 계측은 하지 않았으므로 수치 점수는 없다.

보안은 기존 서버·main 경계 유지의 정적 검토와 최신 root 별도 검증을 연결한다. [root 릴리스 검증](../verification/desktop-release-2026-10-04/README.md): root lint/build exit0, unit1834, CSP7, isolated SQL316·권한조합2016, 운영 guest5 및 AI/DB 행 증가0. 새 서버 변경이 없는 범위의 재사용 증거이며 합성 Electron14를 실제 권한 matrix로 계산하지 않는다. SQL의 pg_cron/pg_net migration0004 제외도 root 기록을 따른다.

## 4. Performance Analysis

실서비스 latency·처리량·메모리·30분 음성 성능은 측정하지 않았다. 단일 IPC/조회와 종료 화면 후속 행동 방지는 실제 요청 수로 확인했다. 테스트 소요 시간은 실행 기록이며 제품 성능 목표 점수가 아니다.

## 5. Test Coverage

Statement/branch/function/line coverage는 이번 실행에 수집되지 않아 N/A다. 기능별 실행은 production14, dev3, 기존 고유41, desktop78로 각각 유지한다. 위 미실행 조합·실제 Storage/RLS·고객 자료·음성 의미 정확도를 커버했다고 주장하지 않는다. smoke/full-flow/work의 실제 로컬 Supabase 별도 suite는 이 담당자의 최종41 명령 범위에 포함되지 않았다.

## 6. Clean Architecture Compliance

renderer→preload의 named capabilities→main IPC→기존 ApiClient/storage-upload→서버 세션/RLS의 기존 의존 방향을 유지했다. presentation에 SDK/토큰·service role·가시성 권한 복제를 추가하지 않았다. 기존 media helper를 재사용하고 신규 lib/TDD 대상은 없다.

Graft 실제 [before](../verification/48-desktop-upload-recovery/graft-before.txt)/[after](../verification/48-desktop-upload-recovery/graft-after.txt)는 tree-sitter-kotlin Win32 native ERR_DLOPEN_FAILED·exit1이다. 자동 전역 graph는 **미확보**다. 수동 검토는 App/WorkTab/업로드→preload/main→E17/E12/Storage/E13→openWeb/onSeen 소비 관계까지다.

Archify [flow](../verification/48-desktop-upload-recovery/flow.json)의 실제 [deliver](../verification/48-desktop-upload-recovery/archify-deliver.json)는9/9·오류/경고0, [automated-browser](../verification/48-desktop-upload-recovery/archify-visual.json)는 pass·diagnostics0이다. receipt의 `visualReview:pending`과 구현자의 실제 view_image 검토 기록을 구분한다. 도표 검사로 runtime/API 권한을 증명하지 않는다.

## 7. Convention Compliance

한국어 native controls·aria labels·shared/messages 직접 import·기존 한도/동의·각 await current·ref singleflight를 따랐다. 신규 의존성/환경변수/원문 로그 없음. 합성 profile/TLS 삭제는 절대 경로의 tmp prefix 검사와 파일 API를 사용한다. 독립 최종 fixture 준비는 root가 허용한 시험 환경 설정으로만 수정했다. 마지막 `git diff --check` exit0(기존 LF/CRLF warning만)이다.

## 8. Overall Assessment

설계9/9·정적 계약3/3, 실제 production14/dev3/기존 고유41 통과 증거에서 추가 기능 gap은 확인되지 않았다. 정적 설계 일치100%와 실제 검증 범위는 분리한다. 미실행 L1/runtime 가중치·coverage를 채워 overall100%라고 기록하지 않는다. 요구 흐름의 SC1~5는 명시된 대표 조합·Strict 관측 범위에서 충족한다.

## 9. Recommended Actions / Design Updates / Next Steps

기능 iterate 요구 없음. 구현 담당이 report/phase step1을 본 분석 및 원시 실패 기록에 연결한다. root는 운영 설정으로 별도 production package/ASAR/설치·게시·실제 업데이트를 검증한다. 현재 QA out은 합성 서버를 사용하는 시험 빌드이므로 출시 산출물로 사용하지 않는다. SMTP는 사용자 보류를 유지하며 신규 Windows 계정 전체 녹화·실제 메일 수신·실고객 자료 정확도를 이번 검증으로 완료 처리하지 않는다.

상위 기능 결정 변경이나 신규 설계 없음. 개발 Strict members pending-read replay 직접 증명과 자동 Graft graph 부재는 검증 한계로 남는다. 독립 담당자는 commit/push/운영 게시/package/version을 변경하지 않았다. 최종 Electron 실행 종료 후 desktop build/Electron 슬롯 IDLE을 root·owner에게 통보했다.

## Version History

| Date | Version | Change |
|---|---|---|
| 2026-10-04 | 1.0 | 독립9항목/SC1~5·계약 대조, 실제14/dev3/78 및 변경 후 고유41 실행 간 통과와 실패·한계 기록 |
