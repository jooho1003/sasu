# 웹 회의 녹음 — bkit 설계 어댑터

> 2026-09-29 · Phase 23 · 범위 원천은 [PRD §3-4·§8·§11](../../PRD.md), 구조는 [ARCHITECTURE](../../ARCHITECTURE.md), 결정 이유는 [ADR-056·057·070·071·072](../../ADR.md)이다. 여기에는 새 제품 결정을 두지 않는다.

## Context Anchor

| 항목 | 상위 문서의 기준 |
|---|---|
| WHY | 회의 소리를 권한·동의·원본 검증과 함께 업무 근거로 연결한다(PRD REC-01~06). |
| WHO | 녹음하는 동의한 부서장, 검토자, 질문 권한이 있는 구성원. |
| RISK | 전사 경계 중복·부정확한 시각·개인정보 원문 저장·ASK 음성 회귀(상세 설계 §11). |
| SUCCESS | [상세 설계 V01~V21](../../planning/웹회의_녹음_설계.md)의 실행 기록과 PRD §11 완료 기준. |
| SCOPE | [Phase 23 step4-B](../../../phases/23-browser-meeting-recording/step4.md)의 정확률 강화. |

## Design Map

| 구현 대상 | 확정 설계 | 현재 세부 step |
|---|---|---|
| Groq 전사 응답·시각 | [상세 설계 §11.2](../../planning/웹회의_녹음_설계.md) · [Groq API Reference](https://console.groq.com/docs/api-reference) | [4-B1 메타데이터 어댑터](../../../phases/23-browser-meeting-recording/step4b1-transcription-metadata.md) |
| 경계 중복·신뢰도·원본 위치 | 상세 설계 §11.2 · PRD ACC-01 · ADR-072 | [4-B2 순수 변환](../../../phases/23-browser-meeting-recording/step4b2-transcription-window.md) · [4-B3 순서 처리·저장](../../../phases/23-browser-meeting-recording/step4b3-transcription-storage.md) · [4-B4 검토 표시·이동](../../../phases/23-browser-meeting-recording/step4b4-attention-review.md) · [4-B5 인용 위치](../../../phases/23-browser-meeting-recording/step4b5-citation-location.md) |
| 부서 용어집 | 상세 설계 §11.3 · PRD ACC-02 | [4-B7 용어집](../../../phases/23-browser-meeting-recording/step4b7-glossary.md) |
| 요약 병합·지시문 방어 | 상세 설계 §11.4·§13.1 · PRD ACC-03·SEC-03 | [4-B6 병합](../../../phases/23-browser-meeting-recording/step4b6-summary-merge.md) |
| 정량 평가 | 상세 설계 §11.5·V20 · PRD §11 | [4-B8 측정 도구](../../../phases/23-browser-meeting-recording/step4b8-accuracy-measurement.md) |

### 4-B6 문서 요약 병합 대조 목록

PRD ACC-03·상세 설계 §11.4에 따라 `lib/pipeline/document-summary.ts`는 chunk별 추출을 원문 문자열로 먼저 검증하고, 여러 chunk의 검증된 결과만 `llm.structured("summarize_document", DocumentSummary, …)`에 한 번 더 전달한다. 병합 결과도 전체 원문으로 재검증한다. 같은 item의 서로 다른 근거 문장은 보존하고 동일한 문장만 중복 제거한다. 문서 본문과 추출 결과의 지시문은 자료로 취급한다. `tests/pipeline/document-summary.test.ts`에서 여러 결정·거짓 인용·지시문 포함 자료를 비교한다. 세부 실행은 [step4-B6](../../../phases/23-browser-meeting-recording/step4b6-summary-merge.md)을 따른다.

### 4-B7 부서 용어집 대조 목록

PRD ACC-02·상세 설계 §11.3에 따라 `dept_glossaries`는 부서 구성원의 세션 RLS 읽기, 동의한 부서장의 RPC 편집, 서버 마스킹을 적용한다. `lib/recording/glossary.ts`는 최근 수정순의 용어를 Groq Whisper의 224토큰 제한 안에서 보수적으로 고르고, 같은 용어를 문서 요약 표기 기준에 제공한다. 녹음 전사 워커와 문서 요약 워커는 service role로 현재 용어를 읽고 사용자 경로는 세션 클라이언트만 사용한다. 용어집 화면·route·SQL·순수 로직 테스트를 대조한다.

### 4-B8 정확률 측정 대조 목록

PRD §11 V20·상세 설계 §11.5에 따라 `lib/recording/accuracy.ts`는 문자 오류율·용어 문자 오류율·낮은 신뢰 구간 오류 재현율·결정 후보 precision/recall을 라벨 입력에서 계산한다. `scripts/measure-recording-accuracy.ts`는 조건과 원본 파일 해시가 포함된 입력만 받아 결과를 `docs/verification/browser-meeting-recording/accuracy.md` 형식으로 출력한다. 입력은 실제 20분 대본·3개 실기기 모드·용어 30개·라벨 있는 회의 5개여야 V20으로 인정한다. 수치 없는 도구 준비는 V20 통과로 표시하지 않는다.

### 4-B3 구조·실행 대조 목록

`review_parts.last_word_end_seconds`(숫자 또는 null), `claim_review_part`(앞 창 `done` gate·이전 창 cutoff 전달), `finish_review_recording_part`(lease/원본/동의 검증 뒤 sections·숫자 저장과 다음 job 예약), `sweep_review_parts`(선행 대기 창 제외), `review_action`(재추출 때 시각 초기화), `lib/pipeline/review-material.ts`(`audio_segments`만 `includeTimestamps`), `lib/contracts.ts`(`confidence`·`boundary_review`), SQL·워커 테스트를 비교한다. 구조 결정은 PRD §3-4 ACC-01·§8과 ADR-072가 원천이다. UI·요약 병합은 이 step에서 다루지 않는다.

### 4-B4 화면 대조 목록

PRD ACC-01·상세 설계 §11.2에 따라 `components/review-detail.tsx`의 구간 카드에 낮은 신뢰·경계 확인 표시와 배경을 붙인다. `다음 확인 필요 구간`은 검색을 해제하고 다음 구간 입력칸으로 이동한다. 확인 필요 구간을 모두 한 번 방문하기 전에는 기존 확정 체크박스를 비활성화한다. 녹음 원본 재생·저장 RPC·일반 자료의 확인 흐름은 유지한다. `app/globals.css`와 `tests/review-controls/recording-segments.spec.ts`를 비교한다. 인용 칩의 원본 위치 이동은 별도 후속 구현이다.

### 4-B5 인용 위치 대조 목록

PRD ACC-01·상세 설계 §11.2의 인용 칩 이동을 `lib/recording/citation-location.ts`, 답변·문서·결정 원장 API, 카드 화면, `components/{ask-s4,document-assistant,ledger-s3,review-detail}.tsx`에 연결한다. 발행 항목의 `review-section-N` 순번을 2,400 유니코드 문자 청크와 대조해 발행 당시 구간 시각을 찾는다. 세션 RLS로 보이는 `reviewed_materials`만 대상으로 하고 발행 후 수정·삭제·원본 파기 시 일반 원문 링크를 유지한다. 검토 화면은 지정 구간으로 스크롤하고 기존 사용자 클릭 재생 버튼을 제공한다. 인용의 원문 문자열 포함 검증을 유지한다. 단위·route·브라우저 검증을 비교한다.

## 4-B1 구현·검증 경계

`lib/llm.ts`의 `transcribeAudio()`만 Groq SDK를 호출한다. ASK·회고 음성의 기본 `json` 응답은 유지하고, 호출자가 시각을 요청한 경우에만 `verbose_json`과 word·segment granularities를 보낸다. 공급자 응답의 시각·신뢰도 값을 검증해 텍스트와 함께 반환한다. 이 step은 워커·자료 화면에 메타데이터를 저장하거나 표시하지 않는다. 실행 기록은 [accuracy-step4b1.md](../../verification/browser-meeting-recording/accuracy-step4b1.md)를 따른다.

구성 요소 경계와 실행 흐름은 그대로다. 반환 값만 넓히므로 Archify 구조도는 이 step에서 새로 만들지 않고, 자료 저장·화면 이동을 연결하는 후속 step에서 갱신한다. Graft는 변경 전후 `transcribeAudio`와 세 호출자(ASK·회고·자료 워커)를 확인한다.

## 구현 대조 목록 (step4-A·0~3)

`/pdca analyze browser-meeting-recording`이 코드와 비교하는 목록이다. 원천은 상세 설계 §4~§6·§9·§10·§13, ARCHITECTURE §6-5, ADR-056·057·058·070이며 여기에는 새 결정을 두지 않는다. 항목별 판정은 [분석 문서](../../03-analysis/browser-meeting-recording.analysis.md) §2에 있다. (2026-09-29 병합: 위 절은 step4-B를 진행하는 세션이, 이 절은 analyze를 진행한 세션이 썼다.)

### 불변식 (ARCHITECTURE §6-5)

| # | 내용 | 확인 위치 |
|---|---|---|
| 30 | IndexedDB 저장은 `review_recordings` 세션과 그 키가 있을 때만 | `components/meeting-recorder.tsx` 시작 순서, `lib/recording/browser/storage.ts` 사전 검사 |
| 31 | 키는 active/saving·만료 전·스위치 on·동의한 부서장·참여자 전원 동의일 때만, 키 비저장 | 0059 `recording_key_context`, `app/api/d/[dept]/recordings/[id]/key/route.ts` |
| 32 | 구간 원본은 녹음자만 `{index}-{attempt}` INSERT, `parts/`·`windows/` 쓰기 없음 | 0060 `review_storage_allowed` |
| 33 | 전 구간 검증 뒤 전사 창 1회 예약, 클라이언트 manifest는 판정에 쓰지 않음 | 0060 `finish_review_segment`, `lib/pipeline/review-material.ts` |
| 34 | 구간당 접근 허가 1건·60초 단회 접근권·분당 60건·서명 URL 없음 | 0060 `authorize_review_segment_access`, `reviews/[id]/original/route.ts` |
| §4.2 | 한 탭 녹음은 Web Locks(`ifAvailable`)만으로 판정, BroadcastChannel·IndexedDB lease는 판정에 쓰지 않음 | `lib/recording/browser/storage.ts` `acquireCaptureLock` — 차이 G-1, 후속 [step0-capture-lock](../../../phases/23-browser-meeting-recording/step0-capture-lock-20260929.md) |

### 엔드포인트

| Method | Path | RPC |
|---|---|---|
| GET, POST | `/api/d/[dept]/recordings` (`?recent=1` 포함) | `list_review_recordings` · `start_review_recording` · `start_continued_review_recording` |
| GET | `/api/d/[dept]/recordings/[id]` | `list_review_recordings` |
| POST | `/api/d/[dept]/recordings/[id]/key` | `recording_key_context` |
| POST | `/api/d/[dept]/recordings/[id]/save` | `create_review_recording` · `create_review_recording_with_profile` |
| POST | `/api/d/[dept]/recordings/[id]/finalize` | `finalize_review_recording` |
| POST | `/api/d/[dept]/recordings/[id]/discard` | `discard_review_recording` |
| GET | `/api/d/[dept]/reviews/[id]/original?segment=0..29` | `authorize_review_segment_access` (`lib/review-access.ts`) |
| GET, PATCH, POST | `/api/d/[dept]/reviews/[id]` | 상세·편집·재추출(`audio_segments`는 서버 재예약만) |
| GET, POST | `/api/admin/review-settings` | 조직 스위치·`admin_review_recording_count` |
| POST | `/api/jobs/run` | 워커 → sweep·job |

### 데이터

- 테이블: `review_recordings`(0059) · `review_original_segments`(0060) · `review_access_events.segment_index`(0060) · `org_settings.browser_recording_enabled`(0037, 기존)
- 0061: `review_recordings_one_successor` · `review_recording_metadata_stamp` · 0062: `create_review_recording_with_profile`
- 세션·구간 RPC: `start_review_recording` · `list_review_recordings` · `discard_review_recording` · `recording_key_context` · `create_review_recording` · `finalize_review_recording` · `claim_review_segment` · `finish_review_segment` · `authorize_review_segment_access` · `sweep_review_recordings` · `admin_review_recording_count`
- 0060 교체: `authorize_review_access` · `consume_review_access` · `claim_review_part` · `review_action` · `review_storage_allowed` · `private.review_original_available`
- 동의 철회: trigger `members_revoke_recordings`(세션) + 기존 `members_revoke_reviews`(자료). ADR-070 "영향"의 `revoke_participant_reviews`·`queue_review_part` 교체는 이것으로 기능상 대체됐다(분석 §4). 상위 문서 정정은 대기.

### 모듈·화면·워커

- 화면: `app/(auth)/d/[dept]/reviews/record/page.tsx` · `components/{meeting-recorder,recording-segment-player,review-detail,reviewed-materials}.tsx` · `components/admin/review-settings.tsx`
- 데모: `app/demo/d/[dept]/reviews/page.tsx` · `components/demo-safe-actions.tsx` · `components/demo-meeting-recorder.tsx` (fetch·Supabase·IndexedDB·LLM 0)
- 순수 로직: `lib/recording/{capture-watchdog,checkpoint-crypto,health,levels,original-segments,pcm,recording-key,recording-routes,session}.ts`
- 브라우저 어댑터: `lib/recording/browser/{capture.ts,capture.worklet.js,inputs.ts,storage.ts,storage.worker.ts}`
- 워커: `lib/pipeline/review-material.ts`(`verify_review_segment` · `process_review` · `purge_review_files` · sweep) · `lib/worker.ts`
- 계약: `lib/contracts.ts`의 `ReviewRecordingStart` · `RecordingOriginalSegment` · `RecordingManifest` · `RecordingCaptureMetadata` · `RecordingSave` · `RecordingSegmentState` · `RecordingSaveResult` · `OriginalSegmentAccessGrant`

### 테스트

| 층 | 파일 · 명령 |
|---|---|
| 단위·route | `tests/recording/*.test.ts` · `tests/recording-key-route.test.ts` · `tests/recording-session-routes.test.ts` · `tests/review-original-route.test.ts` · `tests/review-detail-route.test.ts` · `tests/review-access.test.ts` · `tests/pipeline/review-material.test.ts` |
| SQL | `node scripts/verify-security-sql.mjs <pglite>` (`verify-recording-sessions-sql.mjs` · `verify-recording-segments-sql.mjs` · `verify-review-access-sql.mjs`) · `tests/rls/recording-step2.sql` |
| 합성 브라우저 | `npm run e2e:recording` (`tests/recording/*.spec.ts`) |
| 실험실 UI | `npm run e2e:review-controls` (`tests/review-controls/*.spec.ts`) |
| 제품 E2E | `tests/e2e/recording-product.spec.ts` · `demo-meeting-recorder.spec.ts` · `demo-reviewer.spec.ts` (로컬 Supabase·빌드 필요) |
| 사람 게이트 | V01~V06 실제 기기 · V13 제공사 · V14 CSP 강제 · 운영 반영 |
