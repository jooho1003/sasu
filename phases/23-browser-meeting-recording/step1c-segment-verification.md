# Step 1-C: 녹음 저장·구간 검증·전사 연결 (서버)

원천: PRD §3-4 REC-03·04·06·SEC-03·04, ARCHITECTURE §6-5 불변식 30~34, ADR-058·069, 상세 설계 §4.3·§5.0~§5.3·§6·§10(V07~V10·V21). step1-B의 세션(`review_recordings`, 0059)과 step1-A의 순수 모듈(`lib/recording/original-segments.ts`)을 그대로 쓴다. 녹음 화면·구간 재생 UI(step2), 단어 타임스탬프 경계(step4-B, ADR-070 결정 7), 운영 DB 적용·배포는 이 단계가 아니다. step0 실제 기기 게이트를 완료로 바꾸지 않는다.

## 읽을 파일

- `supabase/migrations/0034_reviewed_materials.sql`(create_review·review_storage_allowed·queue/claim/finish_review_part·review_action·revoke_participant_reviews), `0037_review_access_controls.sql`(review_original_available·authorize/consume_review_access·wrapper 3개·sweep_review_originals), `0052_recording_key_context.sql`, `0059_review_recording_sessions.sql`
- `lib/contracts.ts`(ReviewRecordingStart·RecordingManifest·OriginalAccessGrant), `lib/recording/original-segments.ts`, `lib/pipeline/review-material.ts`, `lib/jobs.ts`, `lib/worker.ts`, `lib/review-access.ts`, `lib/reviews.ts`
- `app/api/d/[dept]/recordings/**`, `app/api/d/[dept]/reviews/[id]/{route,original/route,parts/route}.ts`
- `scripts/verify-security-sql.mjs`, `scripts/verify-recording-sessions-sql.mjs`, `scripts/verify-review-access-sql.mjs`, `tests/pipeline/review-material.test.ts`, `tests/recording-session-routes.test.ts`, `tests/review-original-route.test.ts`, `tests/review-access.test.ts`, `tests/worker.test.ts`

## 고정 계약

이름·경로·상수는 아래 값으로 고정한다. 상세 설계의 `index` 열은 SQL에서 `segment_index`로 쓰고 JSON에서는 `index`로 돌려준다.

- 구간 원본 경로: `{dept}/{review}/original-segments/{index}-{attempt}.wav`. 전사 창 식별자: `{dept}/{review}/windows/{index}`(Storage 객체 아님).
- 잠금 순서: `review_recordings` → `reviewed_materials` → `review_original_segments` → `review_parts`. 모든 새 함수와 교체 함수가 이 순서를 지킨다(교착 방지).
- 구간 업로드 시도는 구간당 3회(attempt 1~3). 검증 작업 예약은 구간당 10회(`verify_run` 0~10). lease와 방치 판정은 2분.
- 작업 ID(결정적): 검증 `md5('review-segment:'||review||':'||index||':'||verify_run)::uuid`, 전사 창 `md5('review-part:'||part_id||':'||attempt)::uuid`(기존 규칙), 녹음 파기 `md5('recording-purge:'||review)::uuid`.

### 테이블 (migration `0060_review_recording_segments.sql`)

- `review_original_segments(review_id FK reviewed_materials, segment_index 0~29, attempt 1~3, sample_count 1~960000, bytes = 44+sample_count*2, sha256 소문자 64자, object_path unique, status awaiting_upload|verifying|verified|failed, verify_run 0~10, error_code segment_missing|segment_mismatch|segment_invalid|segment_unavailable|timeout|null, lease, lease_until, updated_at)`, PK(review_id, segment_index). RLS 읽기는 `review_parts_read`와 같은 방식(자료 행이 보이면 보임). authenticated·service_role에는 SELECT만 준다. 쓰기는 RPC만. `demo_reviewer_read_only` 트리거를 붙인다.
- `review_access_events.segment_index integer null check(0~29)`.
- `review_recordings.state_reason`에 `review_removed`를 추가한다(다른 부서장의 취소·삭제).

### RPC

| 함수 | 권한 | 반환 | 규칙 |
|---|---|---|---|
| `create_review_recording(p_dept uuid, p_recording uuid, p_manifest jsonb, p_capture jsonb)` | authenticated | `{review_id, state, segments:[{index, attempt, path, status, error_code}]}` | `review_editor`·스위치 → manifest v1과 capture v1을 SQL에서 다시 검증 → canonical 바이트(`sasu-recording-manifest-v1\n` + `index:sample_count:bytes:sha256\n`…)로 fingerprint를 SQL이 계산 → 세션 잠금. `active`면 자료 행(같은 ID, `audio_segments`, `original_path` null, `status uploading`, 세션의 제목·공개 범위·참여자·입력 방식·동의 확인자, `consent_confirmed_at`=세션 시작, `file_size`=bytes 합, `duration`=샘플 합/16000, `filename`=제목+`.wav`)과 구간 행(attempt 1)을 만들고 세션을 `saving`으로. `saving`·`completed`에서 같은 fingerprint면 현재 상태만, 다르면 40001. 끝 상태·만료 55000 `recording_closed`. 없는 세션 P0002. 같은 ID 자료가 이미 있으면 40001 |
| `finalize_review_recording(p_dept uuid, p_recording uuid)` | authenticated | 위와 같은 모양 | `review_editor`·스위치·세션 `saving`·만료 전·참여자 동의·자료 `uploading`. `awaiting_upload` 구간과 방치된 `verifying` 구간(lease 없음+2분 경과 또는 lease 만료)을 `verifying`으로 바꾸고 `verify_run+1`로 작업 예약. 한도(10) 초과 구간은 `failed`(timeout), 자료 `failed`. `active`는 55000 `recording_not_saved`, 자료 `failed`는 55000 `recording_failed`, `completed`는 현재 상태 |
| `discard_review_recording` (교체) | authenticated | `{id, state}` | `active`·`saving` → `discarded`(만료됐으면 `expired`). 자료가 있으면 취소·`original_deleted_at`·검증 작업 실패 처리·파기 예약. `completed`는 55000 `recording_already_saved`. 스위치 off에서도 허용 |
| `claim_review_segment(p_review uuid, p_index int, p_attempt int, p_run int, p_lease uuid)` | service_role | `{review_id, dept_id, index, attempt, object_path, sample_count, bytes, sha256}` 또는 null | 세션 `saving`·만료 전, 자료 `uploading`·삭제 안 됨·원본 보존, 녹음자 `review_editor`, 스위치, 참여자 동의, 구간 `verifying`·attempt·run 일치·살아 있는 lease 없음 |
| `finish_review_segment(p_review uuid, p_index int, p_lease uuid, p_result text)` | service_role | boolean | claim과 같은 조건 + lease 일치·만료 전. `verified` → 구간 verified, 전 구간 verified면 **한 번만**: 전사 창 `review_parts`(status queued·attempt 1·`start=i*60`·`end=i*60+(n_i+min(16000,n_{i+1}))/16000`) + `process_review` 예약 + 자료 `processing`·`original_uploaded=true` + 세션 `completed`. `missing` → 같은 attempt `awaiting_upload`(segment_missing). `mismatch` → attempt<3이면 attempt+1 새 경로 `awaiting_upload`(segment_mismatch), 3이면 구간 `failed`(segment_invalid)·자료 `failed`. `retry` → lease 해제(segment_unavailable). 다른 값은 22023 |
| `authorize_review_segment_access(p_dept uuid, p_review uuid, p_index int, p_action text)` | authenticated | `{token, path, kind, filename, segment_index, sample_count}` | `authorize_review_access`와 같은 규칙(부서장·동의·보존·내려받기 스위치·행위자 advisory lock·분당 60건·이벤트 1건·60초 단회 접근권). `audio_segments`만, `play_original`·`download_original`만, 전 구간 verified일 때만. 이벤트에 `segment_index` 기록 |

### 교체

- `private.review_original_available`: 공통 조건은 새 `private.review_original_retained`(삭제·원본 삭제·보존 기한·참여자 동의)로 분리한다. `single_file`은 `original_path` 필요, `audio_segments`는 구간 1개 이상이고 전부 `verified`.
- `review_storage_allowed(name, true)`: `single_file` 분기는 기존과 같다. `audio_segments`는 녹음자 본인·구간 `awaiting_upload`·경로 정확 일치·세션 `saving`·만료 전·스위치·자료 `uploading`·보존 조건일 때만 INSERT. 그 형식의 `parts/`·`windows/` 경로는 모두 거부. 읽기(false)는 항상 false.
- `authorize_review_access`: `audio_segments`의 `play_original`·`download_original`은 22023 `segment_required`. export·reextract는 기존 규칙.
- `consume_review_access`: `audio_segments`는 이벤트 `segment_index`의 verified 구간 경로와 요청 경로가 같아야 한다. `single_file`은 `segment_index`가 null이어야 하고 기존 규칙.
- `claim_review_part` wrapper: 반환에 `original_layout`을 더한다. `audio_segments`면 `manifest`(v1, 전 구간)와 `segment_paths:{current, next|null}`도 더한다.
- `review_action`: 한 번 더 감싼다(`review_action_before_recordings`). 세션을 먼저 잠근다. `audio_segments`에서 `cancel`·`delete`·`delete_original`이면 검증 작업을 실패 처리하고, 세션이 `active`·`saving`이면 `discarded`(review_removed)·원본 파기 예약. `reextract`면 전사 창을 서버가 바로 다시 예약한다(클라이언트 업로드 없음).
- `sweep_review_recordings`: 만료 `active`·`saving` → `expired`. `saving`이던 자료(`uploading`·`failed`)는 취소·파기 예약. 살아 있는 세션의 방치 `verifying` 구간은 다시 예약하거나 한도 초과 시 실패. 반환값은 만료 처리한 세션 수.
- `private.revoke_participant_recordings`: `revoked`로 바뀐 세션의 검증 작업을 실패 처리한다. 자료 삭제·파기는 기존 `members_revoke_reviews`가 한다.

### 계약 (`lib/contracts.ts`, TDD)

- `RecordingCaptureMetadata = strictObject({ paused: boolean, interrupted: boolean, captured_samples: int 1~28,800,000 })`. SQL은 여기에 `manifest_version`·`retained_samples`·`meeting_provider`·`consent_snapshot`(세션 값)을 더해 `capture_metadata`에 저장한다(16KB 이하). 권한·완료 판정에 쓰지 않는다.
- `RecordingSave = strictObject({ manifest: RecordingManifest, capture: RecordingCaptureMetadata })`, `captured_samples ≥ manifest 샘플 합`.
- `RecordingSegmentState = { index, attempt, path, status, error_code|null }`, `RecordingSaveResult = { review_id, state: saving|completed, segments }`.
- `OriginalSegmentAccessGrant = OriginalAccessGrant + { segment_index, sample_count }`.

### 워커 (`lib/pipeline/review-material.ts`, TDD)

- `verify_review_segment`(payload `{reviewId, index, attempt, run}`)를 `JobKind`와 `registerReviewHandlers`에 추가한다. claim → service role download → 크기가 manifest와 다르면 읽지 않고 mismatch → `verifyRecordingOriginal`. Storage 404(`status` 404 또는 `statusCode` "404")는 missing, 그 밖의 오류는 retry. mismatch는 객체를 먼저 지우고(실패하면 retry) finish. retry면 finish 뒤 재시도 가능한 오류를 던진다. 외부 오류 본문은 저장·로그하지 않는다.
- `process_review`: claim 결과가 `audio_segments`면 `segment_paths`의 원본 두 개를 받아 `createRecordingTranscriptionPart(manifest, part_index, current, next)`로 61초 이하 WAV를 메모리에서 만든다. 실패는 `audio_segment_invalid`, 내려받기 실패는 `file_unavailable`. 이후 기존 2,100,000바이트·`validateAudioPart`·`llm.transcribeAudio`를 그대로 쓴다. 창 파일은 저장하지 않는다.
- `purge_review_files`: `audio_segments`면 구간 행의 모든 attempt 경로와 `original-segments/` 접두사 목록(100개씩 끝까지)을 지우고, 목록을 한 번 더 확인해 남은 객체를 지운다. 그래도 남으면 오류로 재시도한다. `single_file`은 기존 동작.

### API (세션 클라이언트만)

- `POST /api/d/[dept]/recordings/[id]/save`: `RecordingSave` → `create_review_recording` → 201. 본문의 부서·작성자·경로는 받지 않는다(strict).
- `POST /api/d/[dept]/recordings/[id]/finalize`: → `finalize_review_recording` → 202, `kickWorker()`.
- `POST /recordings/[id]/discard`: 성공 뒤 `kickWorker()`(파기 작업).
- `GET /reviews/[id]/original?action=…&segment=N`: `segment`가 있으면 0~29 정수만 허용하고 `authorize_review_segment_access` → 접근권 헤더로 세션 Storage download → no-store 스트리밍. 서명 URL 없음. `segment` 없이 구간 자료를 요청하면 SQL이 22023으로 거부한다.
- `GET /reviews/[id]`: 응답에 `segments`(index·attempt·path·status·error_code·updated_at)를 더한다. `single_file`은 빈 배열.
- 오류 문장은 `_shared.ts`의 `recordingFailure`에서 `message`별로 구분한다: `recording_not_saved`, `recording_failed`, `recording_already_saved`.

## 코드 관계와 구조 확인

- Graft: 격리 컨테이너(`node:22-bookworm`, `DO_NOT_TRACK=1`)로 변경 전후 `processReviewPart`·`purgeReviewFiles`·새 핸들러 호출 관계. Docker가 없으면 미실행 사유를 기록한다.
- Archify: 저장 → 업로드 → finalize → 검증 → 1회 전이 → 전사 창 → 구간 접근권 → 파기 순서도. 사람 결정 지점(저장·폐기)과 비동기 작업·재시도를 표시한다.
- 산출물: `docs/verification/recording-segments-2026-09-25/`.

## Acceptance Criteria

```powershell
node scripts/verify-security-sql.mjs C:/Users/이주호/AppData/Local/Temp/sasu-pglite-verify-20260920
npx vitest run tests/contracts.test.ts tests/recording tests/pipeline/review-material.test.ts tests/recording-session-routes.test.ts tests/review-original-route.test.ts tests/review-access.test.ts tests/worker.test.ts
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build
npm run test -- --maxWorkers=2 --testTimeout=15000
```

SQL 하니스가 확인할 것(V07·V09·V10·V21): 저장 권한(다른 부서장·member·다른 부서·미동의·스위치 off·데모 reviewer), manifest 위조(순서·크기·해시·추가 키·버전), SQL fingerprint = 고정 벡터(`0:1:46:a×64` → `9f027eff…b4d4`), 같은 입력 멱등·다른 입력 409, Storage INSERT(녹음자만·발급 경로·attempt 일치·검증 시작 후 거부·`parts/`·`windows/` 거부·만료·스위치 off), 검증 missing·mismatch(attempt+1)·3회 초과 실패, 순서와 무관한 1회 전이(전사 창·작업 수 = 구간 수), 늦은 lease 거부, 완료 뒤 키 404, 구간 없는 원본 요청 거부·구간 접근권 1회 소비·다른 구간 경로 거부·분당 제한 공유, 전 구간 검증 전 전사 예약·재추출·게시 불가, 취소·삭제·폐기·만료·철회의 세션 상태와 파기 예약, 함수 권한 행렬.

실제 로컬 Storage(Docker 기동 시): 업로드 → 불일치 → 새 attempt 재업로드 → 검증 → 전사 예약(LLM 미호출) → 구간 접근권으로 받은 바이트 일치 → 원본 삭제 → 모든 attempt와 접두사 아래 늦은 객체 파기 → `parts/` 객체 0건.

## 금지사항

- 사용자 요청 경로에서 service role을 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다. 워커 핸들러 안에서만 쓴다.
- 요청 본문의 부서·작성자·경로·attempt·상태를 믿지 마라. 이유: 권한은 세션과 SQL이 정한다.
- 전사 창 WAV를 Storage에 저장하지 마라. 이유: ADR-070 결정 5.
- 구간 재생에 서명 URL·목록 조회를 쓰지 마라. 이유: ADR-058.
- 검증 전 구간으로 전사를 예약하거나 일부 검증만으로 저장 완료를 표시하지 마라. 이유: 불변식 33.
- Groq SDK를 직접 부르지 마라. 이유: `lib/llm.ts` 단일 호출점.
- 음성 바이트·원문·외부 오류 본문을 로그에 남기지 마라.
- 운영 DB에 migration을 적용하거나 배포하지 마라. 이유: 검증 기록과 사용자 승인 뒤에 한다.
