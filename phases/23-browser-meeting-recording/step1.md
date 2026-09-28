# Step 1: 구간 원본과 서버 검증

상태: step1-A 순수 모듈, step1-B 녹음 세션, step1-C 저장·검증·전사 연결·구간 접근권·파기 서버를 구현하고 로컬(격리 SQL·실제 로컬 Storage)에서 검증했다. step0 실제 기기 게이트와 운영 반영은 유지한다. 원천은 상세 설계 §5~§6·V07~V10, PRD §8.

2026-09-25 오후: [step1-B 기록](../../docs/verification/recording-sessions-2026-09-25/README.md)을 마감하고 [step1-C 명세](step1c-segment-verification.md)대로 아래 3~6을 구현했다. 7은 격리 SQL과 실제 로컬 Supabase Storage로 실행했다. [step1 완료 기록](../../docs/verification/browser-meeting-recording/step1.md) · [step1-C 실행 기록](../../docs/verification/recording-segments-2026-09-25/README.md).

2026-09-25: [step1-A 명세](step1a-original-segments.md)에 따라 독립 WAV 분할·manifest v1·WAV/해시 검증·60+1초 전사 구간 생성과 로컬 실험실을 구현했다. [실행 기록](../../docs/verification/recording-originals-2026-09-25/README.md). 서버 생성 방식과 실제 기기 완료를 이 결과로 대신하지 않는다.

2026-09-25 설계 보완: 녹음 시작 전 영속 세션 계약이 없던 결함을 ADR-070로 해소했다. 아래 1~6은 새 계약 기준이다(상세 설계 §5.0~§5.3). [설계 검증 기록](../../docs/verification/recording-session-design-2026-09-25/README.md). step1-A의 manifest v1과 전사 창 함수를 그대로 쓴다.

## 읽을 파일

- `supabase/migrations/0034_reviewed_materials.sql`, `0036_demo_reviewer_read_only.sql`, `0037_review_access_controls.sql`, `0052_recording_key_context.sql`(운영 적용), `0058_private_visibility_functions.sql`
- `lib/contracts.ts`, `lib/reviews.ts`, `lib/review-access.ts`, `lib/pipeline/review-material.ts`, `lib/worker.ts`, `lib/recording/**`(step1-A 포함)
- `app/api/d/[dept]/reviews/**`, `app/api/d/[dept]/recordings/[id]/key/route.ts`, `scripts/verify-security-sql.mjs`, `scripts/verify-review-access-sql.mjs`, RLS/검토 상태 관련 기존 tests

## 구현과 검증

1. **녹음 세션**: 새 migration으로 `review_recordings`(§5.0)와 `start_review_recording`·`discard_review_recording`·`sweep_review_recordings`를 추가한다. 동의한 부서장·조직 스위치·참여자 전원 동의(녹음자 자동 포함)·진행 한도 3/10건·동의 스냅샷·키 버전·`expires_at`을 SQL에서 집행한다. 같은 id·같은 입력은 멱등, 다른 입력은 409다. RLS는 녹음자 본인 읽기만 허용하고 authenticated 직접 쓰기는 없다. `members_revoke_reviews` trigger가 `active`·`saving` 세션을 `revoked`로 바꾸게 한다.
2. **키**: 0052의 `recording_key_context`를 새 migration에서 교체한다(인자 유지). 세션 `active`·`saving`·만료 전·녹음자·`review_editor`·스위치·참여자 동의를 확인하고 `key_version`을 돌려준다. 키 route는 끝 상태·만료·세션 없음을 404, 권한 문제를 403으로 유지하고, 버전별 비밀을 고른다. 적용 전 운영의 `input_method<>'upload'` 행이 0건인지 쿼리로 확인해 기록한다.
3. **저장·원본 가용성**: `create_review_recording`은 manifest v1을 검증하고 fingerprint를 §5.1.1 canonical 바이트로 SQL에서 다시 계산한다(step1-A 고정 벡터와 같은 값). `reviewed_materials`(같은 ID, `audio_segments`, `original_path` null)와 `review_original_segments`(attempt 1, `awaiting_upload`)를 한 트랜잭션에 만들고 세션을 `saving`으로 바꾼다. `private.review_original_available`을 형식별로 나누고, 이 함수를 쓰는 `review_storage_allowed`·`authorize_review_access`·`consume_review_access`·`queue_review_part`를 함께 고친다. `review_storage_allowed`는 `original-segments/{index}-{attempt}.wav` INSERT를 녹음자·`awaiting_upload`·attempt 일치·세션 `saving`·만료 전·스위치일 때만 허용하고, `audio_segments`에서 `review_parts` 경로와 일치하는 쓰기(`parts/`·`windows/{index}`)를 모두 거부한다. 기존 `single_file` 경로는 바꾸지 않는다.
4. **검증·전사**: `finalize_review_recording`과 `verify_review_segment` job(`claim_review_segment`·`finish_review_segment`, 2분 lease)을 구현한다. 누락 구간은 같은 attempt로, 불일치 구간은 워커가 객체를 지우고 attempt+1로 되돌린다(3회 초과 시 실패). `finish_review_segment`는 자료 행을 잠근 뒤 전 구간 `verified`일 때 한 번만 전사 창 `review_parts` 행(`object_path`는 `windows/{index}` 식별자)을 만들고 `process_review`를 예약하며 세션을 `completed`로 바꾼다. `process_review`는 `audio_segments`이면 원본 i·i+1로 창을 메모리에서 만들고 저장하지 않는다.
5. **접근·파기**: `authorize_review_segment_access`와 `review_access_events.segment_index`를 추가하고, 원본 route에 `segment` 분기를 넣는다(서명 URL 없음, ADR-058 규칙 그대로). `purge_review_files`는 모든 attempt 경로와 `original-segments/` 접두사 목록을 지운다. 재추출은 서버 재예약만 하고, 원본/전체 삭제·동의 철회·24시간 만료·늦은 업로드/늦은 완료 파기를 연결한다.
6. **API**: `POST/GET /api/d/[dept]/recordings`, `POST /recordings/[id]/{save,finalize,discard}`를 세션 클라이언트로 만든다. 요청 본문의 부서·작성자·경로는 받지 않는다. 계약 Zod는 `lib/contracts.ts` 하나에 둔다.
7. **검증**: RLS 하니스에서 정상 녹음자·다른 부서장·같은 부서 다른 부서장·member·미동의·reviewer(데모)의 직접 RPC/Storage 접근, 검증 전 전사 우회, 다른 attempt·구간 경로, 구간 번호 없는 원본 요청, 한도·만료·폐기·철회 뒤 키, 동시 검증 완료의 전이 1회를 확인한다(V07·V09·V10·V15·V17·V21). 합성 Storage로 실제 업로드→검증→불일치 재업로드→전사 예약→파기를 실행한다.

## 완료 기록

순수 모듈 TDD, SQL 권한/상태 테스트, 합성 Storage 실제 업로드/검증/삭제 결과를 `docs/verification/browser-meeting-recording/step1.md`에 남긴다. Graft 전후 그래프와 Archify 실행 흐름도(세션→키→저장→검증→전사)를 만들거나, 도구가 없으면 없다고 기록한다. 세션 요청에 service role을 추가하지 않는다. 운영 DB migration 적용은 이 step 실행과 구분한다.
