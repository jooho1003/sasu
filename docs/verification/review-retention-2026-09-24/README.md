# 자료 보호 선행 작업 — 2026-09-24

미완료 설계를 순서대로 진행하라는 요청에 따라 phase 23의 step4-A를 이어서 작업했다. 원천은 PRD §3-4 SEC-04, 웹 회의 녹음 설계 V18, `phases/23-browser-meeting-recording/step4.md`다. 기존 녹음 구현의 선행 게이트를 넘겨 완료 처리하지 않는다.

## 변경과 재현

- [9/18 운영 관찰](../processors-2026-09-18.md)에 남은 `can_see()`의 anon 직접 실행 권한을 보정한다. `0058_private_visibility_functions.sql`은 PUBLIC·anon 권한을 모두 회수하고 authenticated·service_role 권한은 유지한다. 함수 본문·RLS 판정은 바꾸지 않는다. 내부 트리거 함수 2개도 API 직접 실행 권한을 회수한다.
- SQL 하니스에서 기존 배포의 직접 GRANT를 재현했다. 수정 전에는 anon 권한이 true여서 [실패](sql-red.txt)했고, 신규 migration 뒤 [245개 검사·권한 조합 2,016건](sql-green.txt)이 통과했다. 모든 초기 함수의 기본 권한을 전수 감사한 결과는 아니다.
- 로컬 QA DB에 0058를 적용했고 [역할별 실제 권한](local-permissions.txt)을 확인했다. 운영 DB에는 적용하지 않았다.
- `scripts/verify-review-retention.ts`와 `retention-test` 명령을 추가했다. 실제 세션 RPC·로컬 Postgres·Storage와 제품의 `purgeReviewFiles()`를 사용한다. 음성·문서 원본, 변환 구간, 만료·수동 보관·미확정 사례를 포함한다. 파기 워커의 제품 로직 자체는 기존 검증대로 동작해 변경하지 않았다.
- `tests/pipeline/review-material.test.ts`에 파기 표시 없는 자료 보호, 경로 중복 제거, Storage 실패 후 재시도, DB 조회 실패 시 중단을 추가했다.
- `tests/e2e/review-retention-live.spec.ts`는 실제 파기 검증 후 남긴 로컬 fixture로 로그인해 전사 열람, 원본 재생·재추출 차단, 1440/390px 화면을 확인한다. 로그인 fixture는 `.vercel/review-qa/`에만 저장하며 커밋하지 않는다.

## 실제 Storage 결과

[결과 JSON](storage-results.json) · [실행 출력](storage.txt)

1. 만료 전 발급한 접근권도 만료 뒤에는 거부한다. sweep 전부터 재생·재추출·구간 재처리가 차단된다.
2. sweep을 두 번 실행해도 각 만료 자료의 파기 job은 한 건이다.
3. 원본과 변환 구간은 관리자 Storage GET에서도 404가 되어 실제 제거를 확인했다.
4. 같은 파기 handler를 다시 실행해도 성공한다.
5. 파기 뒤 같은 경로에 사용자 세션으로 뒤늦게 업로드하면 거부한다.
6. 수동 보관·미확정 자료의 파일은 파기 대상에 포함되지 않는다.
7. 전사·수정 이력·확정 출처·items·합성 요약은 삭제 전후 동일하다.

LLM 호출 0건, 외부 요청 0건. 요약은 검증용 합성 fixture이며 모델 품질을 평가하지 않는다. 전체 job dispatcher는 실행하지 않았다. 관계없는 QA job이 모델이나 메시지 발송을 호출하지 않도록 생성한 분류·요약 job만 중단하고, 예약된 파기 작업의 실제 handler를 호출했다. 검증 종료 시 이번 실행에서 만든 파일만 정리했으며 감사 기록과 메타데이터는 남긴다.

초기 검증 스크립트는 같은 조직에 같은 부서명을 두 번 넣어 실패했다([초기 출력](storage-first.txt), [원인 확인](storage-fixture-failure.txt)). fixture 이름을 고쳐 최종 실행이 통과했다. 제품 오류로 계산하지 않는다. 실제 진행 중인 HTTP 업로드와 삭제의 경합까지 재현한 것은 아니다.

## 코드 관계와 도구

Graft 0.19.0을 `node:22-bookworm` 격리 컨테이너에서 사용했다. `DO_NOT_TRACK=1`, deep 분석·LLM 키 전달 없음. 변경 전 입력은 HEAD `009fcc8`의 앱·lib·컴포넌트·스크립트·테스트·설정 git archive이며, 변경 후에는 이번 스크립트·테스트를 복사해 다시 분석했다.

- [구현 전 build](graft-build-before.txt) · [graph check](graft-check-before.txt) · [호출자](graft-before.json) · [handler 등록 검색](graft-registration-before.txt)
- [구현 후 build](graft-build-after.txt) · [graph check](graft-check-after.txt) · [호출자](graft-after.json)
- 전후 모두 graph check OK. 변경 전 570파일·2,639노드·6,686관계, 변경 후 신규 검증 코드가 실제 파기 handler를 호출하는 관계를 확인했다. 함수 참조 등록은 calls 조회에서 잡히지 않아 Graft grep과 실제 코드를 함께 확인했다.
- SQL은 이 Graft 입력에 포함하지 않았다. `can_see` 권한→RLS·`search_as`, `sweep_review_originals`→jobs→`purgeReviewFiles`→Storage, 원본 접근 API→세션 RPC→Storage 경계는 실제 SQL·호출 파일 및 실행 하니스로 확인했다.
- 이번 변경은 기존 함수 권한과 검증 경로를 보완하며 제품 구성 요소·실행 순서를 바꾸지 않는다. Archify는 실행하지 않았다. 기존 [접근 흐름](../browser-meeting-recording/access-design.md)을 참조하며 새 Archify 결과가 있다고 주장하지 않는다.

## 검증 명령

```powershell
node scripts/verify-security-sql.mjs C:/Users/이주호/AppData/Local/Temp/sasu-pglite-verify-20260920
node scripts/review-qa.mjs setup
node scripts/review-qa.mjs retention-test
node node_modules/vitest/vitest.mjs run tests/pipeline/review-material.test.ts --maxWorkers=1
npm run lint
$env:SASU_VERIFY_BUILD='1'
node scripts/review-qa.mjs build
npm run test -- --maxWorkers=2 --testTimeout=15000
node scripts/review-qa.mjs start
# 별도 터미널: start와 같은 SASU_VERIFY_BUILD=1
node scripts/review-qa.mjs retention-browser-test --reporter=line
node scripts/review-qa.mjs guest-test --reporter=line
```

| 검사 | 결과 | 실행 기록 |
|---|---|---|
| SQL 하니스 | 245개·권한 조합 2,016건 통과 | [로그](sql-green.txt) |
| 실제 로컬 Storage | 7개 통과, LLM·외부 요청 0건 | [결과](storage-results.json) |
| 집중 단위 | 10개 통과 | [로그](unit-focused.txt) |
| lint | 통과, 문구 차단 0·기존 경고 77건 | [로그](lint.txt) |
| 프로덕션 빌드 | 타입 검사·페이지 생성 통과 | [로그](build.txt) |
| 전체 단위 | 139파일·1,399개 통과 | [로그](unit.txt) |
| 실제 로그인 화면 | 1개 통과, 20.1초 | [로그](browser.txt) |
| 공개 게스트 회귀 | 5개 통과, 41.1초, 쓰기·LLM 증가 0 | [로그](guest.txt) |

화면은 [1440px](expired-original-1440.png)·[390px](expired-original-390.png)에 있다. 390px 캡처를 직접 검토해 만료 안내·전사 유지·재추출 비활성·가로 넘침 없음을 확인했다. 녹음 실기기 검증이나 독립적인 사람 검수는 아니다.

## 다음 순서와 남은 게이트

후속: 사용자가 동적 렌더링 전환을 승인했다. 아래 렌더링 결정 대기는 [CSP 구현·검증](../csp-rendering-2026-09-24/README.md)으로 해소했고, 운영 관찰·승인 게이트는 유지한다.

1. step4-A: 제공사 확인 V13, CSP 강제 적용 V14, 이번 0058 운영 반영·실측. 현재 PRD의 정적 소개 페이지와 요청별 nonce가 충돌해 동적 렌더링 전환 여부를 사용자에게 물었다. 현재 빌드에는 `/demo/hiring`, `/demo/notion`, `/no-membership`와 기본 오류 화면도 사전 렌더링되어 있어 전체 강제 적용 전에 함께 검증해야 한다.
2. step0: 5초 입력 감지 기록은 이미 있지만 V01~V06의 실제 녹음·Meet/Zoom·장시간 복구 전체 결과는 없다. 이번 Storage 검증으로 대신하지 않는다.
3. step1→step2→step4-B→step3 순서 유지. 녹음 시작 전 영속 세션 생성/키 발급 계약의 미확정 사항도 유지한다.

운영 배포·운영 DB 변경·커밋·외부 메시지 전송은 실행하지 않았다. 전체 phase는 부분 구현 상태를 유지한다.
