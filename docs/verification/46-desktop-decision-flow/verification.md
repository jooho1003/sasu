# 결정함 조회·처리 회복 검증

2026-10-03 KST · branch `feat/desktop-decision-flow` · 기준 PR33의 `1f9da61` · [설계](../../02-design/features/desktop-decision-flow.design.md)

## 변경

결정함에 기존 App 공유 E05의 로딩·오류·빈 목록과 수동 갱신을 연결했다. E09 상세 선택과 E10 처리에 ref 잠금·세대 검사를 추가했다. 인용 없는 상세는 내용/행동/읽음을 숨기고 목록 복귀를 제공한다. 처리 성공/중복 성공은 목록 복귀와 새 E05 조회, 실패는 같은 입력을 유지한다. 현재 탭 재클릭도 이전 화면을 무효화한다. 선행 E05는 처리 후 응답 폐기와 새 조회로 교체한다.

제품 변경은 App/CardsTab/CardView renderer 3파일이다. 서버·SQL·기기 Bearer·preload/main·LLM·원장·멱등·새 의존성 변경 없음.

## 실행 기록

| 실행 | 결과 | 기록 |
|---|---|---|
| desktop `npm run lint` | exit 0 | [desktop-lint.txt](desktop-lint.txt) |
| desktop `npm run test` | 12 files / 78 PASS, exit 0 | [desktop-test.txt](desktop-test.txt) |
| desktop `npm run e2e -- followup.spec.ts` | 신규 7 + 기존 18 = 25 PASS, 1.5분, exit 0; production build 포함 | [electron.txt](electron.txt) |
| root `npm run lint` | exit 0, 기존 문구 경고 84, blocking 0 | [root-lint.txt](root-lint.txt) |
| root `npm run build` | 외부 node_modules junction을 기본 Turbopack이 거부 | [root-build.txt](root-build.txt) |
| root `npm run build -- --webpack` | exit 0, production compile·타입·49/49 정적 생성 완료 | [root-build-webpack.txt](root-build-webpack.txt) |
| root `npm run test` | 183 files / 1,834 PASS, exit 0 | [root-test.txt](root-test.txt) |
| `node scripts/verify-security-sql.mjs` | 316 PASS / 권한 조합 2,016, exit 0 | [sql.txt](sql.txt) |

SQL은 실제 마이그레이션을 isolated PGlite PostgreSQL/WASM에 적용한다. 담당자/팀장/다른 부서·RLS·기기 세션·원장 멱등의 기존 검증을 재사용했다. pg_cron/pg_net 마이그레이션 0004는 제외된다. 실제 운영 DB·메일·외부 모델 호출 없음.

## Electron 흐름

실제 main/preload/renderer를 격리 프로필에서 합성 HTTPS Auth/API에 연결했다. 이전 phase45의 임시 CA·정확한 localhost 인증서 신뢰를 테스트에만 사용한다. 제품 HTTPS/동일 origin·인증서/IPC 제한은 그대로다. 합성 API가 실제 SQL 권한을 증명하는 것으로 계산하지 않는다.

1. 목록 지연을 로딩으로 표시하고 빈 상태를 숨긴다. 503→오류/재시도→빈 목록→open/needs_review 한국어 상태·마감을 표시한다.
2. 상세 버튼 연타는 E09 1건. 인용 0이면 제목/배경/처리/읽음 없이 안내와 복귀. 403은 목록 유지, 현재 인용 있는 상세는 읽음, 현재 결정된 상세는 행동 없음.
3. 결정·보류·반려·duplicate 성공은 목록 복귀와 새 조회. 기존 본문 {status,outcome,rationale}만 전송한다.
4. submit 연타는 POST 1건. 503/403/409/연결 실패는 결과·이유 유지, 수동 재시도만. 성공 후 목록 오류가 발생해도 행동은 다시 전송하지 않는다.
5. 상세 조회 지연 중 탭 이탈, 처리 성공/실패 지연 중 복귀·탭 이탈·로그아웃은 늦은 선택/notice/갱신을 남기지 않는다.
6. 읽음 실패 지연 중 복귀 버튼/현재 결정함 재클릭은 다음 목록에 오류를 남기지 않는다. 로그아웃 뒤 상세 응답도 로그인 화면·읽음을 바꾸지 않는다.
7. 처리 전 30초 자동 E05가 이전 스냅샷을 잡고 지연된 상태에서 보류 성공→이전 응답 폐기→새 E05 정확히 1회→처리된 카드가 목록에 남지 않는다.

[목록 화면](screenshots/decision-list.png)을 시각 확인했다. 380px 창에서 목록/상태/마감/갱신 버튼이 겹치거나 가로로 잘리지 않는다. 모든 처리/오류 상태의 별도 캡처를 만들지는 않았다.

## 실패→수정

- 구현 전 [red](electron-red.txt)는 실제 로그인 후 목록 로딩 안내 누락으로 실패했다.
- [첫 실행](electron-first.txt)에서 합성 deadline이 ISO datetime 계약을 따르지 않아 main parser가 올바르게 거부했다. fixture만 수정했다. textarea에 값이 들어간 뒤 label text 기반 exact locator가 불안정해 role/name locator로 변경했다. 제품 입력/응답 계약은 그대로다.
- 독립 gap 검토는 선행 E05 재사용으로 처리 전 스냅샷이 남는 경우와 동일 탭 재클릭의 읽음 세대 누락을 발견했다. 새 조회 경로와 nav key cleanup으로 수정하고 6/8→8/8 재검토했다.
- 신규 clock 테스트는 이미 생성된 interval을 뒤늦게 clock.install한 상태에서 추적하지 못했다([중간 실행](electron-second.txt)). clock 설치 후 reload하여 실제 30초 effect를 등록했고 [지연 스냅샷 사례](electron-race.txt) PASS.
- 기본 root build는 격리 worktree의 외부 junction 환경 문제다. 제품 Next 설정을 바꾸지 않고 webpack으로 별도 검증한다.
- 전체 실행의 기능 검증 뒤 Windows 임시 프로필 정리가 EPERM으로 실패했다([첫 정리 실패](electron-cleanup-failure.txt), [짧은 재시도 실패](electron-cleanup-retry-failure.txt)). 경로를 검증한 공통 비동기 rm과 최대 20회의 짧은 backoff로 이벤트 루프를 막지 않고 Chromium 핸들 해제를 기다리도록 테스트 정리만 보완했다.

## Graft·Archify·React

Graft 전후 `node D:/바이브코딩/.sasu-graft-20260923/tool/node_modules/@nanonets/graft/dist/cli.js --version`은 Win32 tree-sitter-kotlin binding `ERR_DLOPEN_FAILED`로 실패했다([전](graft-before.txt), [후](graft-after.txt)). 자동 의존 그래프 없음. 실제 import/호출로 App→CardsTab→CardView→기존 card IPC→ApiClient→E09/E10→loadCardView/decideCard/SQL과 App E05/읽음 소비자를 수동 대조했다.

Archify 3.0.1로 [flow.json](flow.json)을 작성했다. [delivery](archify-deliver.json) 9/9·오류/경고 0, [browser-check](archify-browser.json) containment PASS·visualReview not-requested. 로컬 HTML은 `.vercel/desktop-decision-flow.html`이며 재생성 가능한 JSON/receipt를 추적한다.

```powershell
node D:/바이브코딩/sasu/.vercel/desktop-core-archify/archify/bin/archify.mjs deliver architecture docs/verification/46-desktop-decision-flow/flow.json .vercel/desktop-decision-flow.html --json
node D:/바이브코딩/sasu/.vercel/desktop-core-archify/archify/bin/archify.mjs browser-check .vercel/desktop-decision-flow.html --json --out-dir .vercel/desktop-decision-flow-archify
```

React best-practices 검토: 기존 Promise 공유·변경 후 최신 조회 분리·동기 ref 잠금·await/cleanup 세대·key 재마운트·native form/label/button·직접 shared import를 확인했다. 앱 내부 로직이므로 Next.js API 변경은 없다.

## 한계·운영 상태

E05 기다리는 동안 성공 후 갱신의 탭 전환 지속/로그아웃 뒤 새 조회 금지 조합은 직접 별도 실행하지 않았다. 현재 성공 콜백에서 이미 시작한 App 백그라운드 갱신이며 종료 세션 검사를 정적으로 대조했다. 이미 시작한 결정 POST는 이탈로 취소할 수 없다. 모든 서버 권한/시간/에러 조합, 운영 실자료·실제 Windows 설치·OS 브라우저 탐색·메일 수신 결과로 해석하지 않는다.

운영 설치 파일/설치된 앱은 0.1.1 유지. 이번 작업은 PR33 위의 개발 브랜치이며 운영 미반영이다. `사수 / sasu@getsasu.com`의 DNS/Resend SMTP는 사용자 지시대로 보류한다.
