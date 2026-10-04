# 최근 맡긴 작업 검증

실행일 2026-10-03 KST · 기준 `8917c49` · branch `feat/desktop-recent-work` · [설계](../../02-design/features/desktop-recent-work.design.md)

## 변경과 증거

팀장 ‘일 맡기기’ 상단에 최근 24시간의 본인 문서·음성·영업 원문 검토를 표시한다. 한국어 상태·빈 목록·로딩·오류/재시도와 공유 갱신을 연결했다. 자료는 최신 E05 존재 확인, 영업은 E16 현재 상태 확인 후 기존 HTTPS 웹 상세로 인계한다. 웹 열기 성공 뒤 읽음을 기록한다. 새로운 서버·DB·LLM·의존성 없음.

| 실행 | 결과 | 기록 |
|---|---|---|
| desktop `npm run lint` | exit 0 | [desktop-lint.txt](desktop-lint.txt) |
| desktop `npm run test` | 12 files / 78 PASS | [desktop-test.txt](desktop-test.txt) |
| desktop `npm run e2e -- followup.spec.ts` | 신규 6 + 기존 12 = 18 PASS, 1.6분; electron-vite production build 포함 | [electron.txt](electron.txt) |
| root `npm run lint` | exit 0, 기존 문구 경고 84, blocking 0 | [root-lint.txt](root-lint.txt) |
| root `npm run test` | 183 files / 1,834 PASS | [root-test.txt](root-test.txt) |
| root `npm run build` | 격리 worktree의 외부 node_modules junction을 Turbopack이 거부 | [root-build.txt](root-build.txt) |
| root `npm run build -- --webpack` | exit 0, production build·타입·정적 페이지 생성 완료 | [root-build-webpack.txt](root-build-webpack.txt) |
| `node scripts/verify-security-sql.mjs` | 316 PASS / 권한 조합 2,016, isolated PGlite | [sql.txt](sql.txt) |

SQL 하니스는 실제 마이그레이션을 격리 PostgreSQL/WASM에서 실행한다. 현재 멤버십/팀장·본인/부서·기기 세션·인용 가시성 검사와 기존 companion 단위 검증을 재사용했다. pg_cron/pg_net 마이그레이션 0004는 제외된다. 합성 API 응답을 실제 SQL 권한 증거로 계산하지 않는다.

## 실제 Electron 사용자 흐름

격리 프로필에서 실제 main/preload/renderer를 합성 HTTPS Auth/API에 연결했다. 테스트 전용 임시 인증서는 Node CA 목록에 추가하고 Chromium에서는 localhost와 정확히 같은 인증서 PEM만 허용한다. 운영 인증서 검사·HTTPS/동일 origin 제한은 제품 코드 그대로다. OS 브라우저 호출만 관찰용 shell 대체를 사용한다.

1. 문서/음성/영업 목록과 한국어 상태를 표시하고 탭 재진입 뒤 다시 찾는다. 문서 버튼 연타는 웹 1회, 성공 뒤 읽음. 영업 E16 확인 뒤 해당 웹 경로를 연다.
2. 목록 503을 빈 목록과 구분→수동 재시도→빈 목록. 자료가 현재 목록에서 사라지면 열지 않는다. 영업 403·shell 실패는 읽음을 남기지 않는다.
3. 영업 상세 지연 중 탭 이탈/로그아웃은 웹·읽음을 시작하지 않는다.
4. 수동 갱신 중 30초 자동 갱신은 같은 요청을 공유한다. 로딩·버튼 잠금과 팀원 목록 숨김을 확인한다.
5. 읽음 저장 실패는 현재 화면에 안내하지만 탭 이탈 뒤 늦은 오류는 다른 화면에 표시하지 않는다. 웹 성공을 읽음 성공으로 오인하지 않는다.
6. 자료 E05 재확인 지연 중 탭 이탈/로그아웃은 웹·읽음을 시작하지 않는다.
7. 기존 질문 이력/이어 묻기·로그아웃/401 재로그인·오프라인 암호화 보관·IPC 제한·폴링 취소·hostname 12개가 회귀 통과했다.

[합성 화면](screenshots/recent-work.png)을 시각 확인했다. 380px 패널에서 제목·기간·갱신·문서/음성 상태가 잘리고 겹치지 않으며 아래 목록과 작업 시작은 세로 스크롤로 이어진다. 모든 상태 조합의 별도 화면 캡처는 만들지 않았다.

## 실패와 수정

- 구현 전 테스트는 실제 로그인 이후 ‘최근 맡긴 작업’ 제목 누락으로 실패했다([electron-red.txt](electron-red.txt)).
- 처음 HTTP fixture는 기존 main의 HTTPS 인계 제한에 막혔다. 제품 제한을 유지하고 임시 인증서를 사용하는 HTTPS fixture로 바꿨다. Node fetch와 Chromium session.fetch의 신뢰 설정이 서로 달라 각각 연결했다. [첫 실행](electron-first.txt), [TLS 중간 실패](electron-third.txt), [수정 후 신규 4건](electron-fifth.txt).
- 독립 gap 검토는 읽음 저장 실패가 발신 탭 이탈 뒤 global notice를 바꾸는 문제를 발견했다. 발신 화면 세대 검사 함수를 App 콜백까지 전달하고 위 5번 회귀 테스트로 수정했다.
- 기본 root build 실패는 외부 junction 환경 문제다. 웹 제품 코드/Next 설정을 변경하지 않고 webpack 빌드를 별도로 검증한다.

## Graft·Archify·React 검토

Graft 구현 전과 후 `node D:/바이브코딩/.sasu-graft-20260923/tool/node_modules/@nanonets/graft/dist/cli.js --version`을 실행했으나 tree-sitter-kotlin Win32 binding `ERR_DLOPEN_FAILED`로 실패했다([후속 실행](graft-after.txt)). 자동 의존 그래프는 확보하지 못했다. 실제 import/호출로 `App→WorkTab/RecentWork→E05/E16 preload→main API/session.fetch→웹 인계/암호화 settings`를 수동 대조했다. 서버/RLS/contracts/작업 시작은 변경하지 않았다.

Archify 3.0.1로 [flow.json](flow.json)을 작성하고 아래 명령을 실행했다. [delivery](archify-deliver.json) 9/9·오류/경고 0, [browser-check](archify-browser.json) viewport containment PASS·`visualReview: not-requested`. 자동 레이아웃 검사 결과를 사람 시각 승인으로 표시하지 않는다. HTML은 로컬 `.vercel` 산출물이다.

```powershell
node D:/바이브코딩/sasu/.vercel/desktop-core-archify/archify/bin/archify.mjs deliver architecture docs/verification/45-desktop-recent-work/flow.json .vercel/desktop-recent-work.html --json
node D:/바이브코딩/sasu/.vercel/desktop-core-archify/archify/bin/archify.mjs browser-check .vercel/desktop-recent-work.html --json --out-dir .vercel/desktop-recent-work-archify
```

React 검토: 공유 Promise·effect cleanup·동기 ref 잠금·각 await 세대 검사·현재 화면 오류만 반영·native button 접근성 이름을 확인했다. 같은 목적의 새 캐시/폴링/상태 라이브러리는 추가하지 않았다.

## 범위와 운영 상태

최근 24시간 제한/본인 자료 범위는 기존 서버 필터를 따른다. 운영 계정 실자료·실제 OS 브라우저 탐색·메일 수신·Windows 신규 설치·모든 시간 경계 조합을 검증한 결과는 아니다. 이미 시작한 OS 열기/저장 요청 자체는 취소할 수 없으며 늦은 결과의 화면 반영만 막는다.

설치된/공개 Windows 0.1.1은 유지된다. 이번 기능은 PR30 위의 개발 브랜치에서 검증했으며 운영 미반영이다. 사용자 지정 발신자 `사수 / sasu@getsasu.com`의 DNS/Resend SMTP 연결은 요청대로 보류한다.
