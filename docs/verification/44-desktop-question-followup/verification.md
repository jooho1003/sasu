# 데스크톱 질문 이력·이어 묻기 검증

실행: 2026-10-03 KST · 기준 main e4fa262 · branch `feat/desktop-question-followup` · [설계](../../02-design/features/desktop-question-followup.design.md)

## 변경과 실제 실행 결과

기록 탭 진입마다 현재 본인 질문을 조회하고 한국어 상태·빈 상태·재시도·더 보기를 제공한다. 답 선택 시 현재 권한으로 상세를 재조회한다. 완료/거절 답에서 명시적으로 부모를 선택하여 기존 IPC로 이어 묻는다. 새 질문 전환은 초안을 유지하고 부모/이전 답을 초기화한다. 실패 초안 보존·즉시 중복 잠금·이탈 후 콜백 폐기를 연결했다. 새로운 서버/DB/LLM/서비스 없음.

| 실행 명령 | 결과 | 기록 |
|---|---|---|
| desktop `npm run lint` | exit 0 | [desktop-lint.txt](desktop-lint.txt) |
| desktop `npm run test` | 12 files / 78 PASS | [desktop-test.txt](desktop-test.txt) |
| desktop `npm run e2e -- followup.spec.ts` | 신규 5 + 기존 7 = 12 PASS, 26.6초; electron-vite production build 포함 | [electron.txt](electron.txt) |
| root `npm run lint` | exit 0 | [root-lint.txt](root-lint.txt) |
| root `npm run build` | exit 0 | [root-build.txt](root-build.txt) |
| root `npm run test` | 183 files / 1,834 PASS | [root-test.txt](root-test.txt) |
| `node scripts/verify-security-sql.mjs` | 316 PASS / 권한 조합 2,016, isolated PGlite | [sql.txt](sql.txt) |

SQL 하니스는 실제 마이그레이션을 격리 PostgreSQL/WASM에서 실행한다. `verifyConversationsSql`의 본인/부서 이력·권한 없는 부모 거부·인용 권한·질문 맥락과 기존 기기 세션 SQL을 포함한다. pg_cron/pg_net 마이그레이션 0004는 이 하니스에서 제외된다. 운영 DB 접근·외부 모델 호출·메일 발송 없음.

루트 lint의 기존 문구 검사 경고는 84건이며 blocking 0이다. lint exit 0을 경고 0으로 해석하지 않는다.

## Electron 사용자 흐름

실제 Electron main/preload/renderer와 합성 HTTP Auth/API를 격리 프로필로 실행했다. 합성 API가 실제 SQL 권한 집행을 증명하지는 않으므로 위 SQL 실행 기록을 별도로 사용한다.

1. 자동 이력 조회→거절 답 재열람→이어 묻기 포커스→부모 ID 전달. 403 실패는 초안/부모를 유지하고 자동 독립 재전송하지 않는다. 전송 중 연타 1건, 재시도 성공, 새 질문은 null 부모.
2. 목록 503→재시도→빈 이력→다음 페이지→중복 ID 제거. 상세 403은 기록 화면을 유지한다.
3. pending 답 A 중 질문 B 전송 실패→A의 취소된 폴링은 기록 확인 안내로 끝난다.
4. done 답 본문/인용 표시→이어 묻기 503→암호화 파일에 질문 평문 없음→초안/부모 초기화→재연결 시 같은 부모 ID 전송.
5. 목록/상세 지연 응답 도중 탭을 떠나면 늦은 응답이 선택 화면·답을 바꾸지 않는다.
6. 기존 로그아웃/401 후 재로그인 상태 삭제, 동시 암호화 보관, 잘못된 응답 미재전송, 설정/IPC 권한, 폴링 취소, hostname 테스트 7개 회귀 통과.

[부모·초안 보존 화면](screenshots/followup-forbidden.png)은 실제 합성 Electron 스크린샷이다. 380px 패널에서 질문 연결·입력·새 질문 버튼 표시를 시각 확인했다. 창 아래 내용은 세로 스크롤로 이어진다.

## 실패→수정 기록

- 테스트를 구현 전에 추가했지만 최초 실행은 로그인 화면 준비 5초 제한에서 실패했다. 이 결과를 기능 누락에 대한 red 증거로 계산하지 않는다. 이후 renderer 구현과 30초 준비 대기로 신규 3개가 통과했다.
- 독립 gap 검토가 pending A 폴링 취소 후 B 실패의 무기한 진행 표시를 발견했다. 기존 답을 중단 표시하고 신규 접수 성공 뒤에만 진행 표시하도록 수정했으며 회귀 테스트를 추가했다.
- 신규 outbox 테스트의 유효하지 않은 부모 GUID·parse callback 인자 누락을 수정했다. 제품 outbox 계약을 바꾸지 않았다.
- 전체 E2E 첫 12건 중 기존 테스트 하나가 창 생성 전 `app.windows()` 조회 레이스로 실패했다. helper에서 두 창의 URL을 기다리고 초기화 실패 시 프로필을 정리하도록 보완한 뒤 12/12 통과했다.

## Graft·Archify·React 검토

Graft 구현 전과 후에 `node D:/바이브코딩/.sasu-graft-20260923/tool/node_modules/@nanonets/graft/dist/cli.js --version`을 실행했으나 동일한 `ERR_DLOPEN_FAILED`(tree-sitter-kotlin Win32 binding)로 실패했다. [후속 실행](graft-after.txt). 이번 변경의 자동 코드 그래프는 미확보다. 실제 import/호출로 `App→HistoryTab/AskTab→preload→outbox→companion API→startAsk/SQL`을 수동 대조했다.

Archify 3.0.1로 [flow.json](flow.json)을 작성했다. 처음 라벨 겹침 진단에 따라 좌표를 수정한 후 아래 명령이 성공했다.

```powershell
node .vercel/desktop-core-archify/archify/bin/archify.mjs deliver architecture docs/verification/44-desktop-question-followup/flow.json .vercel/desktop-question-followup.html --json
node .vercel/desktop-core-archify/archify/bin/archify.mjs browser-check .vercel/desktop-question-followup.html --json --out-dir .vercel/desktop-question-archify
```

[delivery receipt](archify-deliver.json), [브라우저 검사](archify-browser.json): 자동 viewport containment 통과, `visualReview: not-requested`. 생성 HTML은 `.vercel` 로컬 산출물이며 재생성 가능한 JSON/receipt만 추적한다. 이를 사람 시각 승인으로 표시하지 않는다.

React 검토: effect cleanup·요청 세대·functional setState 페이지 병합·동기 ref 잠금·textarea 접근성 이름을 확인했다. 새 의존성·영구 이력 저장소를 추가하지 않았다.

## 한계와 운영 상태

429 실패의 초안 유지, 페이지 요청 실패/빠른 상세 연타, 지연 응답과 로그아웃 결합은 각각 별도 UI 사례로 실행하지 않았다. 공통 오류/잠금/세션 초기화 경로와 기존 단위·SQL 결과를 사용하며 모든 조합을 검증했다고 주장하지 않는다.

운영 설치 파일/설치된 0.1.1은 변경하지 않았다. 메일 발신자는 사용자 지정 `사수 / sasu@getsasu.com`, 도메인 `getsasu.com`으로 기록했다. DNS 인증·Resend SMTP·실제 수신·신규 Windows 설치 전체 녹화는 phase 43 후속으로 남는다. 이번 기능은 개발 검증 완료이며 운영 게시 완료가 아니다.
