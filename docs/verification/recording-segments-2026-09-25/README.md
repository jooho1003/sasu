# 녹음 구간 저장·검증·전사 연결(step1-C) — 2026-09-25

요청: "지금 codex 한도 없으니까 너가 다음 착수 사항 개발 진행해줘." phase 23 step1의 남은 서버 단계를 Claude가 구현했다. 명세는 [step1-C](../../../phases/23-browser-meeting-recording/step1c-segment-verification.md), 플랜과 게이트 판정은 `.claude/plans/recording-segment-verification-2026-09-25.*`다. 운영 DB 적용·배포·커밋은 하지 않았다. 녹음 화면(step2), 실제 기기 녹음(step0 게이트), 단어 시각 경계(step4-B)는 범위 밖이다.

## 구현

- `supabase/migrations/0060_review_recording_segments.sql`
  - 신규: `review_original_segments`(자료와 같은 읽기 RLS, 직접 쓰기 없음, 데모 reviewer 쓰기 차단), `review_access_events.segment_index`, 세션 상태 사유 `review_removed`.
  - 신규 함수: `create_review_recording`(manifest v1·capture v1 재검증, SQL이 fingerprint 재계산, 자료·구간 행 한 트랜잭션, 세션 `saving`), `finalize_review_recording`(검증 작업 예약, 완료 표시 없음), `claim_review_segment`·`finish_review_segment`(service role, lease, 전 구간 검증 때 한 번만 전사 창과 작업 예약·세션 `completed`), `authorize_review_segment_access`(구간 번호 단회 접근권).
  - 교체: `private.review_original_available`(형식별), `review_storage_allowed`(녹음자·발급 경로·`awaiting_upload`만), `authorize_review_access`(구간 자료의 통째 재생 거부), `consume_review_access`(구간 경로 결속), `claim_review_part`(manifest·구간 경로 반환), `review_action`(한 번 더 감쌈: 저장 중 녹음 취소·삭제 시 세션 종료·파기, 재추출은 서버 재예약), `discard_review_recording`·`sweep_review_recordings`·`private.revoke_participant_recordings`(저장 중 녹음의 취소·파기·검증 작업 실패 처리).
- `lib/contracts.ts`: `RecordingCaptureMetadata`·`RecordingSave`·`RecordingSegmentState`·`RecordingSaveResult`·`OriginalSegmentAccessGrant`.
- 워커 `lib/pipeline/review-material.ts`: `verify_review_segment` 핸들러와 등록, `process_review`의 전사 창 메모리 조립, `purge_review_files`의 모든 attempt·접두사 목록 파기. `lib/jobs.ts`에 작업 종류 추가.
- API: `POST /api/d/[dept]/recordings/[id]/save`(201), `.../finalize`(202, 워커 호출), `discard` 뒤 워커 호출, `GET /reviews/[id]/original?segment=N`, `GET /reviews/[id]`의 `segments`. 녹음 라우트 공통 함수는 `lib/recording/recording-routes.ts`로 옮겼다. `lib/review-access.ts`에 `requestOriginalSegmentAccess`.
- 검증 도구: `scripts/verify-recording-segments-sql.mjs`(격리 SQL 18개), `scripts/verify-recording-storage.ts`와 `review-qa.mjs recording-storage-test`(실제 로컬 Storage).
- 구현 값(검증 재시도 한도 10, 결과 4종, capture v1 필드 등)은 [상세 설계 §5.3.1](../../planning/웹회의_녹음_설계.md)에 적었다. ADR-070 결정은 바꾸지 않았다.

## 실행 결과

| 검사 | 결과 | 기록 |
|---|---|---|
| 계약 테스트 먼저 작성 | 18개 실패 확인 → 77개 통과 | [red](unit-red-contracts.txt) · [green](unit-green-contracts.txt) |
| 워커 테스트 먼저 작성 | 20개 실패 확인 → 38개 통과 | [red](unit-red-worker.txt) · [green](unit-green-worker.txt) |
| 라우트·접근 함수 테스트 먼저 작성 | 12개 실패 확인 → 63개 통과 | [red](unit-red-routes.txt) · [green](unit-green-routes.txt) |
| 공통 함수 `lib/` 이동 | 모듈 없음 실패 확인 → 6개 파일 82개 통과 | [red](unit-red-recording-routes.txt) · [green](unit-green-routes-2.txt) |
| 0060 적용 뒤 기존 SQL 하니스 | 259개 통과(회귀 없음) | [기록](sql-regression-first.txt) |
| 격리 PGlite SQL(새 검사 18개 포함) | 277개·권한 조합 2,016건 통과 | [최종](sql-final.txt) |
| SQL 돌연변이 6개 | 대조군 통과, 6개 모두 해당 검사에서 실패 | [결과](sql-mutants.json) |
| 전체 단위 | 145개 파일·1,592개 통과 | [기록](unit-all.txt) |
| lint | ESLint 0건, 쉬운 말 검사 차단 0·경고 77(작업 전과 같은 수) | [기록](lint.txt) |
| 프로덕션 빌드(`SASU_VERIFY_BUILD=1`) | 통과, save·finalize 라우트 포함 | [기록](build.txt) |
| 실제 로컬 Supabase에 0059·0060 적용 | 오류 없이 적용(운영 아님) | [기록](local-setup.txt) |
| 실제 로컬 Storage 통합 | 18개 통과, LLM 호출 0·외부 요청 0. 미사용 변수 한 줄을 지운 최종 스크립트로 다시 실행해도 18개 통과 | [결과](storage-results.json) · [첫 실행](storage.txt) · [최종 재실행](storage-rerun.txt) |
| Archify 순서도 | 첫 검증 실패 뒤 9/9·오류 0·경고 0, 전달, 브라우저 확인 통과 | 아래 "구조도" |
| Graft | 구현 전(HEAD)·구현 후 그래프와 호출 관계 | 아래 "코드 관계" |

실제 Storage 검사 18개: 저장 → 올바른 구간 0 업로드 → 같은 길이의 잘못된 구간 1 업로드 → 거부 확인(다른 부서장, `parts/`, `windows/`, 다른 attempt 경로, 같은 경로 재업로드 409, upsert) → finalize → 실제 `verifyReviewSegment`로 구간 0 검증·구간 1 불일치(attempt 2, 이전 객체 404) → 옛 경로 거부·새 경로 재업로드 → 완료(세션 `completed`, 자료 `processing`, 전사 창 2개·작업 2개, 작업은 LLM 호출 전에 막음) → 완료 뒤 키 P0002 → 실제 객체로 61초 창과 마지막 1.5초 창 조립·`validateAudioPart` 통과 → 통째 재생 22023 → 구간 접근권으로 받은 바이트가 올린 원본과 같음 → 같은 접근권 재사용·다른 구간 경로·서명 URL·내려받기 스위치 off 거부 → 원본 삭제 뒤 실제 `purgeReviewFiles` 두 번 → 모든 attempt와 늦게 넣은 객체 404, 목록 0건, `parts/` 없음, 이후 업로드 거부 → 두 번째 녹음 폐기 → 취소·파기.

로컬 Docker Storage가 연속 요청 중 502·503·504를 일시적으로 냈다. 검증 스크립트는 이 5xx만 재시도하고, 검증 핸들러가 스스로 알리는 재시도 신호(`recording_segment_unavailable`)는 작업 실행기처럼 같은 payload로 다시 부른다. 4xx 거부와 404는 재시도하지 않으므로 권한·파기 판정을 가리지 않는다.

## PRD·설계 검증표 대응

| ID | 이번에 확인한 것 | 남은 것 |
|---|---|---|
| V07 | 같은 ID 저장 멱등, 불일치 구간만 같은 ID의 attempt+1, 3회 초과 실패, 409 Duplicate 뒤 서버 검증 판정, 검증 전 전사·재추출·게시 불가, 완료 전이 1회(검증 완료 순서와 무관) | 실제 동시 트랜잭션 경합(PGlite·로컬 실행은 순차), 업로드 중 네트워크 단절(step2 화면) |
| V08 | 구간 재생은 구간당 접근 허가 1건·서명 URL 없음(실제 Storage), 재추출은 클라이언트 업로드 없이 서버가 전사 창 재예약 | 실제 전사·수정·확정·인용 완주(step2, 합성 음성) |
| V09 | 같은 부서의 다른 부서장·member·다른 부서 부서장·조직 관리자·부서장 자격을 잃은 녹음자의 구간 INSERT 거부, 녹음자의 `parts/`·`windows/`·다른 attempt 경로 쓰기 거부, 구간 번호 없는 원본 요청 거부, 저장·확인 요청의 권한 거부(member·조직 관리자·다른 부서장). 작업 중 참여자 철회 뒤 세션 `revoked`·자료 삭제·검증 작업 실패 | 미동의 사용자의 업로드 직접 시험(정책은 `review_editor`로 거부), 화면에서의 우회 시도(step2) |
| V10 | 원본 삭제·폐기 뒤 모든 attempt와 접두사 아래 늦은 객체 파기, `parts/` 객체 없음(실제 Storage). 보존 기한 sweep이 구간 원본 포함 | 전체 삭제의 실제 Storage 파기는 SQL 예약까지만 확인 |
| V21 | 저장 이후 수명 주기: 폐기·만료·철회·완료 뒤 키 거부, 다른 부서장이 `saving` 자료를 취소·삭제하면 세션 `discarded`, 만료 sweep이 `uploading`·`failed` 자료 취소·파기 | 조직 스위치 off 경고 화면(V19, step2) |

## 진행 중 바로잡은 것

1. PostgreSQL `least()`는 NULL을 무시해서, 마지막 전사 창에 1초를 더하는 버그가 있었다. 테스트 전에 migration을 다시 읽다가 찾았다. 끝 시각 검사로 고정했다.
2. SQL 첫 실행 두 번은 검사 fixture 문제로 실패했다. 사용자당 진행 3건 한도(54000)와 세션 시각 CHECK(23514)다. 제품 오류가 아니다([1차](sql-first.txt) · [2차](sql-second.txt)). fixture를 고친 [3차](sql-third.txt)부터 통과했다.
3. 돌연변이 첫 실행은 복사본에 `tests/fixtures`가 없어 모든 실행이 우리 검사 전에 죽었다. 결과를 버리고 대조군을 추가해 다시 실행했다.
4. 라우트 서브에이전트가 TDD 가드가 막은 `app/api/.../_shared.ts` 편집을 Bash로 우회했다고 보고했다. 그대로 두지 않고 `lib/recording/recording-routes.ts`로 옮겨 테스트를 먼저 쓰게 했고, `_shared.ts`는 지웠다.
5. 첫 Graft 구현 후 그래프는 워커 구현 전(테스트만 있는 상태)에 찍혀 최종 코드를 반영하지 않았다. `*-midtdd`로 남기고 최종 코드로 다시 찍었다.

## 코드 관계 (Graft)

Graft 0.19.0, 9/24에 쓰던 격리 컨테이너(`node:22-bookworm`, `DO_NOT_TRACK=1`) 재사용, 비밀값·deep 분석 없음. SQL은 그래프 입력이 아니다.

- 구현 전은 `git archive HEAD`다. 커밋되지 않은 step0·1-A·1-B 작업이 빠져 있다: 2,639노드·6,686관계·570파일([build](graft-build-before.txt) · [check](graft-check-before.txt) · [조회](graft-before.json)).
- 구현 후 최종: 2,770노드·7,031관계·591파일, graph check OK([build](graft-build-after.txt) · [check](graft-check-after.txt) · [조회](graft-after.json)). 워커 구현 전 스냅샷은 [build](graft-build-after-midtdd.txt) · [조회](graft-after-midtdd.json).
- 확인한 관계: `processReviewPart → createRecordingTranscriptionPart`, `verifyReviewSegment → verifyRecordingOriginal`, `purgeReviewFiles → listSegmentObjects·removeReviewObjects`, 녹음 라우트 6곳 → `recordingAccess`·`recordingFailure`, `recordingAccess → requireMembership·createServerSupabaseClient`(세션 클라이언트), `finalize POST → kickWorker`.
- `registerHandler("verify_review_segment", verifyReviewSegment)`처럼 인자로 넘긴 함수는 Graft가 호출 관계로 잡지 않는다. 등록은 소스(`lib/pipeline/review-material.ts`)와 `tests/pipeline/review-material.test.ts`의 등록 검사로 확인했다.

## 구조도 (Archify)

[순서도 HTML](segments-flow.html) · [명세](segments-flow.json) · [첫 검증(실패)](archify-validate-first.json) · [최종 검증](archify-validate.json) · [전달 영수증](archify-delivery.json) · [브라우저 영수증](archify-visual.json) · [라이트/다크 접촉 시트](segments-flow.visual-check.html)

```text
diagram_type: sequence
specification_sha256: a4ed2e6f6ad58a9ad4f259bad58501e24f872a3aecb2381042404495c81b573e
artifact_sha256: 34d046d65963f1626dd700825b73551c2eba3963e8fb57e854893d3ed061ba2a
validation: 9/9 showcase, 0 errors, 0 warnings
browser_evidence: passed
```

첫 후보는 폭 때문에 부제 글자가 가독성 기준보다 작아 실패했다. 폭과 간격을 조정한 최종 명세를 동결한 뒤 전달했다. 화면 UI 글자는 Archify 기본값(영어)이다. 다이어그램 검증은 녹음 기능 검증과 별개다.

## 검증 명령

```powershell
node scripts/verify-security-sql.mjs C:/Users/이주호/AppData/Local/Temp/sasu-pglite-verify-20260920
npx vitest run tests/recording tests/pipeline/review-material.test.ts tests/recording-session-routes.test.ts tests/review-original-route.test.ts tests/review-access.test.ts tests/review-detail-route.test.ts tests/worker.test.ts tests/contracts.test.ts
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build
npm run test -- --maxWorkers=2 --testTimeout=15000
# Docker의 로컬 Supabase(review-qa)
node scripts/review-qa.mjs setup
node scripts/review-qa.mjs recording-storage-test
```

## 확인하지 않은 것과 남은 게이트

- 실제 동시 트랜잭션 경합. 완료 1회 전이는 자료 행 잠금으로 보장하도록 만들었고 순서를 바꾼 검증으로 확인했지만, 동시 연결 부하 시험은 하지 않았다.
- `processReviewPart`의 실제 Groq 전사. LLM 호출 0이 이번 검증 조건이다. 워커 분기는 단위 테스트(모의 Storage·LLM)로, 창 조립은 실제 객체로 확인했다.
- 녹음 화면과 ReviewDetail의 구간 재생·다시 시도(step2). 지금 ReviewDetail의 `retry()`는 `parts/` 업로드를 시도하므로 구간 자료에서는 Storage가 거부한다. step2에서 서버 재예약으로 바꾼다.
- step0 실제 기기 V01~V06, 단어 시각 경계(step4-B).
- 운영: 0058·0059·0060은 운영 DB에 적용하지 않았다. 적용 전 운영의 `input_method<>'upload'` 0건 확인이 필요하다. 배포·커밋 없음.
- 남은 위험: 구간 경로 객체 크기는 bucket 한도(50MiB)만 막는다. 워커가 선언 크기와 다르면 읽지 않고 지운다.
