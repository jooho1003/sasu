# 데스크톱 통합 회귀·질문 이력 검증 보완 — 2026-10-04

실행 브랜치 `release/desktop-0.1.2-20261004`. phase 44~47 통합 및 최신 main 병합 뒤, phase 48 제품 구현 전에 수행했다. 실행 당시 desktop package version은 0.1.1이었다. 설치 파일 버전 변경·패키징·게시를 이 기록으로 완료 처리하지 않는다.

기준: [질문 이력 설계](../../02-design/features/desktop-question-followup.design.md) U1~U6/S1~S4, [최근 작업](../../02-design/features/desktop-recent-work.design.md), [결정함](../../02-design/features/desktop-decision-flow.design.md), [영업 검토](../../02-design/features/desktop-sales-flow.design.md), AI-DEVELOPMENT 및 phase 43 step 12~14의 기존 검증 기록. 새 제품 동작·API·SQL·영구 저장소를 추가하지 않았다.

## 추가한 실행 시나리오

`desktop/tests/e2e/followup.spec.ts`에 기존 미실행 조합 4개를 추가했다. 실제 Electron main/preload/renderer와 격리 프로필, 합성 HTTPS Auth/API를 사용했다. 테스트 CA는 기존 정확한 인증서 검증을 유지한다.

| 시나리오 | 확인한 결과 |
|---|---|
| 이어 묻기 429 | 초안·부모 보존, 최초 POST 1회, outbox 0·파일 없음, inbox 조회에도 재전송 없음. 명시적 재시도는 동일 부모 ID |
| 페이지 503 및 빠른 상세 연타 | 현재 목록과 cursor 보존, 더 보기 재시도는 실패한 요청과 동일 cursor, ID 중복 제거. 같은 이벤트 루프의 두 클릭이 상세 GET 1회만 생성 |
| 늦은 이력 목록 + 로그아웃·새 로그인 | 응답 내용은 이전 요청 시작 시점의 질문을 snapshot하여 보존. 새 사용자 로그인 뒤 이를 release하고도 새 이력은 빈 상태·이전 질문 없음 |
| 늦은 상세 + 로그아웃·새 로그인 | 이전 상세 응답 release 뒤 이전 거절 답·초안·읽음 ID가 새 사용자 화면/설정에 없음 |

최초 targeted 4개는 모두 통과했고, 뒤 통합 41개 실행에서도 동일 4개가 통과했다. 임시 프로필 정리는 기존 검증된 비동기 `removeUserData`를 재사용한다. [429 화면](screenshots/followup-429.png)을 직접 열어 380px 화면의 부모 안내·초안·버튼 배치를 확인했다. 하단 한도 안내의 실제 표시 여부는 실행 assertion으로 확인했으며, 이 잘린 캡처에 한도 안내 전체가 보인다고 주장하지 않는다.

## 실제 명령과 결과

desktop 검증은 lint → build → unit → production Electron → 실패한 2개 재검증 → development React 순서로 수행했다. production 실행에서는 `SASU_DESKTOP_REACT_MODE`·`NODE_ENV` override를 제거했다.

| 명령 (desktop 디렉터리) | 종료 코드·결과 | 원시 기록 |
|---|---|---|
| `npm run e2e -- followup.spec.ts --grep '질문 한도 429\|페이지 오류 뒤\|이전 세션의 늦은'` | 0 · 4 PASS / 1.7분 | [targeted](continuation-electron-targeted.txt) |
| `npm run lint` | 0 · TypeScript·ESLint 통과 | [lint](continuation-desktop-lint.txt) |
| `npm run build` | 0 · main/preload/renderer production build | [build](continuation-desktop-build.txt) |
| `npm run test` | 0 · 12 files / 78 PASS | [unit](continuation-desktop-test.txt) |
| `npm run e2e -- followup.spec.ts` | 1 · 39 PASS / 2 시간 초과 / 15.3분 | [첫 통합 실행](continuation-electron.txt) |
| `npm run e2e -- followup.spec.ts --grep '최근 작업 새로고침은\|새 질문 실패 후'` | 0 · 실패한 2개 모두 PASS / 28.7초 | [재검증](continuation-electron-retry.txt) |
| `SASU_DESKTOP_REACT_MODE=development`, `npm run e2e -- followup.spec.ts --grep 'sales start'` | 0 · 6 PASS / 44.9초. 실제 bundleType 1, StrictEffects true, cleanupGeneration 1 | [development/Strict](continuation-electron-strict.txt) |
| 루트 `git diff --check` | 0 · LF→CRLF 안내만 있음 | 세션 실행 기록 |

**고유 production 41개는 최초 39개 + 재검증 2개로 모두 통과했다. 한 번의 새 전체 실행이 41/41 통과한 결과는 아니다.** development 6개는 동일 sales 테스트의 다른 React 모드 실행이므로 고유 테스트 수에 더하지 않는다. 이 문서 작성 뒤 phase 48 서브에이전트에 build/Electron 실행 슬롯을 인계했다.

## 실패 근거와 보완

1. 최근 작업 공유 갱신 사례의 로그아웃 뒤 두 번째 로그인에서, `panel.reload()` 후 기본 5초 heading 대기가 실패했다. 화면 snapshot은 `불러오는 중…`이었다. [원문](continuation-readiness-failure.md). 테스트 login helper의 준비 대기만 기존 launch와 같은 최대 30초로 맞췄다. 동작 검증의 시간 제한·assertion은 바꾸지 않았다.
2. 이전 pending 답 뒤 새 질문 실패 사례는 첫 `질문하기` 클릭에서 30초 timeout이 발생했다. 버튼은 visible/enabled/stable이고 로그는 `performing click action`에서 멈췄다. 폴링 결과 assertion까지 도달하지 못했다. [원문](continuation-readiness-failure-polling.md). 이 클릭의 코드·시간 제한을 변경하지 않고 같은 사례를 재실행해 통과했다.

실패 도중 `Get-CimInstance Win32_OperatingSystem` 결과는 가용 메모리 407,848KB / 전체 16,618,696KB였다. 같은 suite의 worker 재시작 build는 main 45.24초·renderer 15.76초였고, 안정화 뒤 재검증은 0.63초·1.76초였다. 메모리 압박에 따른 일시적 지연으로 추정하지만 두 실패를 숨기거나 최초 전체 실행을 성공으로 바꾸지 않는다. Playwright가 실패 후 자동으로 worker를 재시작하여 beforeAll build를 실행했으며, 임의로 전체 suite를 재실행하지 않았다.

## 코드 관계·도구 검증

제품 코드를 수정할 결함은 이번 추가 검증에서 발견하지 않았다. 수동 대조 범위는 `App/HistoryTab/AskTab/Evidence` → preload의 좁은 질문 IPC → API 세션 abort/generation → OutboxService의 부모 보존·4xx 미보관, 그리고 기존 poller cleanup이다. 인용 없는 답 본문을 렌더하지 않는 Evidence 경계와 로그아웃 SessionApp 재마운트를 확인했다. 실제 서버 권한 집행은 합성 응답의 통과만으로 증명하지 않는다.

Graft 도구 검색에 callable MCP가 없고 PATH CLI도 없었다. 기존 로컬 CLI에 실제 `--version`을 실행했으나 tree-sitter-kotlin 네이티브 모듈의 `ERR_DLOPEN_FAILED`(유효한 Win32 앱 아님)로 exit 1이었다. [실행 로그](continuation-graft.txt). 현재 통합 트리의 자동 호출 그래프·전역 영향 분석은 미확보이며 위 관계는 파일을 읽어 수동으로 확인한 범위다.

Archify는 기존 phase 47의 [현재 흐름 명세](../47-desktop-sales-flow/flow.json)를 다시 생성·검사했다. 새 구조 변경을 설계한 것은 아니다.

```powershell
node .vercel/desktop-core-archify/archify/bin/archify.mjs deliver architecture docs/verification/47-desktop-sales-flow/flow.json .vercel/desktop-continuation-20261004.html --json
node .vercel/desktop-core-archify/archify/bin/archify.mjs browser-check .vercel/desktop-continuation-20261004.html --json --out-dir .vercel/desktop-continuation-archify-20261004
```

[deliver](continuation-archify-deliver.txt): exit 0·9/9·오류/경고 0. [자동 browser-check](continuation-archify-browser.txt): exit 0·4 viewport containment PASS·diagnostics 0·`visualReview: not-requested`. 작은 viewport의 읽을 수 있는 세로 스크롤은 정책상 허용되었다. 사람 도표 시각 승인이나 서비스 기능 검증으로 계산하지 않는다. HTML/sidecar는 ignored `.vercel`에 있으며 원본 JSON과 receipt로 재생성할 수 있다.

## 실행 범위와 남는 게이트

이 기록의 Electron 범위는 합성 `followup.spec.ts` 41개 및 별도 development 6개다. `full-flow.spec.ts`·`smoke.spec.ts`·`work.spec.ts`의 실제 로컬 Supabase 흐름은 이번 담당 범위에서 실행하지 않았다. 실제 SMTP·운영 인증/DB·외부 모델·깨끗한 Windows 설치/자동 업데이트를 이 결과로 완료 처리하지 않는다. 사용자 지시로 SMTP 작업은 보류한다. 루트 최종 lint/build/unit·SQL·게스트 검증, phase 48 구현 및 운영 설치 파일 반영은 상위 세션의 별도 실행 기록을 따른다.

마지막 Electron 산출물 `desktop/out`은 development React + 합성 서버 주소를 사용하는 QA 빌드다. 출시 패키지에는 운영 설정의 별도 production build가 필요하다. 이 담당자는 package/version·phase index·운영 설정을 바꾸거나 commit/push/게시하지 않았다.

## Phase 48 변경 뒤 기존 회귀 — 추가 실행

WorkReviewUpload 제품 변경 뒤 root·구현자와 build/Electron 슬롯을 조율해 기존 `followup.spec.ts`만 실행했다. 업로드의 별도14/dev3을 중복 실행하지 않았다. 이 시점 package0.1.2는 root가 갱신한 값이며 담당자가 바꾸지 않았다.

| 실행 | 실제 결과 | 원시 기록 |
|---|---|---|
| 최초 post48 전체 시작 | case1 screenshot 및 case3/4와 다음 동일탭 case의 창 클릭 시간 초과로 중단, case2 PASS | [최초 로그](continuation-post48-electron.txt), [당시 contexts](post48-first-failure-contexts/) |
| 실패4 창 준비 진단 | 4 PASS·exit0·14.3초 | [진단](continuation-post48-electron-diagnostic.txt) |
| `followup.spec.ts --max-failures=1` | 34 PASS·1 창 준비 timeout·6 미실행·exit1·3.5분 | [41 시도](continuation-post48-electron-final.txt), [context](post48-pinned-failure-contexts/) |
| 남은7 대상 `--grep` | 5 PASS·1 창 준비 timeout·1 미실행·exit1·45.6초 | [7 시도](continuation-post48-electron-last7.txt), [context](post48-last7-failure-contexts/) |
| 마지막2 대상 `--grep` | 2 PASS·exit0·17.1초 | [2 통과](continuation-post48-electron-last2.txt) |

결과는 **변경 뒤 고유41 시나리오가 실행 간 모두 통과**다. 단일 명령에서41/41 성공한 기록으로 바꾸지 않는다. 최초 실패·다음 실패·미실행 수와 최종 대상 통과를 모두 남긴다.

case1은 screenshot fonts-ready 이후30초, 다른 실패는 locator click의 visible/stable 또는 performing action 단계30초였다. 기존 native panel은 blur 때 pinned가 아니면 hide한다. root 지시 범위에서 시험 프로필의 실제 지원된 `settings.set({ panelPinned:true })`를 login/relogin 준비에 적용하고 소유 창만 show/focus했다. native visible/focused/minimized 상태를 로그에 남겼다. visible=true/minimized=false가 확인됐고 focused는 true/false 모두였으므로 OS focus를 항상 얻었다고 주장하지 않는다.

34개 통과 뒤의 session cleanup case는 별도 로그인 코드가 helper를 우회했다. 초기 질문 전 동일 pin/show 준비만 추가했다. 로그아웃 뒤 screenshot/UI 재로그인에는 설정을 새로 쓰지 않고 소유 창 show/focus만 했다. session/outbox/settings 파일 제거·기본 pet/seen·`panelPinned:false` assertion은 유지하고 실제 통과했다. 마지막 polling fixture도 기존 pin을 숨겨진 창의 show/focus와 함께 준비하도록 바꿨다. 제품 blur handler·React·API·행동 assertion·click 제한은 변경0이다.

주요 명령은 `npm run e2e -- followup.spec.ts --max-failures=1`; 실패 뒤 대상7은 `--grep '뒤 재로그인에 이전 답|부서 연결 대기|실제 본체의 동시|실제 암호화 설정|폴링 실패 안내|실제 본체 hostname'`, 마지막2는 `--grep '폴링 실패 안내|실제 본체 hostname'`이다. 전체를 반복해 실패를 숨기지 않았다. 마지막 `git diff --check` exit0이며 LF/CRLF warnings만 있다.

[phase48 독립 분석](../../03-analysis/desktop-upload-recovery.analysis.md)은 설계9항목/SC1~5, production14·development3·desktop78 및 이 회귀의 실제 범위/한계를 대조한다. Electron 종료 후 build/Electron 슬롯 IDLE을 root·구현자에게 통보했다. 이후 운영 package/build는 root 소유다. 위 earlier development 산출물 기록을 갱신하면, 최종 담당 QA out은 production React **합성 HTTPS 서버 설정**이며 운영 출시 빌드가 아니다.
