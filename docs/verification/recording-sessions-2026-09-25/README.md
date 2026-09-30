# 녹음 시작 전 서버 세션(step1-B) — 2026-09-25

원천: [step1-B 명세](../../../phases/23-browser-meeting-recording/step1b-recording-sessions.md), ADR-070 결정 1·2·8, 상세 설계 §5.0. 같은 날 09:54~10:04에 다른 작업(Codex로 추정)이 구현하고 이 폴더에 실행 결과를 남겼다. README는 그때 작성되지 않았다. 13:5x에 Claude가 이 폴더의 실행 결과를 읽고, step1-C 작업 중 다시 실행한 결과를 더해 정리했다. 운영 DB 적용·배포·커밋은 하지 않았다.

## 변경

- `supabase/migrations/0059_review_recording_sessions.sql`: `review_recordings`(녹음자 본인 읽기 RLS, authenticated 직접 쓰기 없음, 데모 reviewer 쓰기 차단), `start_review_recording`(동의한 부서장·스위치·참여자 동의·녹음자 자동 포함·제목 마스킹·동의 스냅샷·사용자 3건/부서 10건·같은 ID 멱등·다른 입력 40001), `recording_key_context` 교체(세션 기준, 키 버전 반환), `list_review_recordings`, `discard_review_recording`, `sweep_review_recordings`, 참여자 철회 trigger, 조직 관리자 진행 건수. 적용 전 `input_method<>'upload'` 행이 있으면 migration이 멈춘다.
- API: `POST/GET /api/d/[dept]/recordings`, `GET /recordings/[id]`, `POST /recordings/[id]/discard`, 키 route의 세션 키 버전 사용. 모두 세션 클라이언트다.
- `lib/contracts.ts` `ReviewRecordingStart`, `lib/recording/recording-key.ts` 키 버전 회전(`RECORDING_KEY_VERSION`·`RECORDING_KEY_PREVIOUS_*`), `.env.example`, 워커 sweep 호출(`sweepReviewParts`).

## 실행 기록 (09:54~10:04, 이전 작업)

| 검사 | 결과 | 기록 |
|---|---|---|
| 계약·키 단위 테스트 먼저 작성 | 22개 실패 확인 후 구현 | [unit-red](unit-red.txt) |
| 대상 단위 | 55개 → 66개 통과 | [targeted](unit-targeted.txt) · [final](unit-targeted-final.txt) |
| 만료 sweep 순서 | 2개 실패 확인 후 구현 | [sweep-red](sweep-red.txt) |
| 격리 PGlite SQL 하니스 | 259개·권한 조합 2,016건 통과(녹음 세션 14개 포함) | [sql](sql.txt) · [sql-final](sql-final.txt) |
| 전체 단위 | 143개 파일·1,508개 통과 | [unit-all](unit-all.txt) |
| lint | ESLint 통과, 쉬운 말 검사 차단 0·경고 77 | [lint](lint.txt) |
| 프로덕션 빌드 | 통과 | [build](build.txt) |
| Archify 순서도 | 첫 검증 실패 뒤 9/9 통과, 전달, 브라우저 확인 통과 | [첫 검증](archify-validate.json) · [최종 검증](archify-validate-final.json) · [전달](archify-delivery.json) · [브라우저](archify-visual-final.json) · [HTML](sessions-flow.html) |

위 결과는 모두 10:01:34(마지막 소스 변경) 이후에 실행됐다. 파일 수정 시각과 결과 시각을 대조해 확인했다.

## 다시 실행 (13:4x, step1-C 작업 중)

- 0059을 그대로 둔 채 0060을 더해 SQL 하니스를 다시 실행했다. 녹음 세션 14개를 포함해 기존 259개가 모두 통과했다([기록](../recording-segments-2026-09-25/sql-regression-first.txt)). 새 구간 검사 18개를 더한 최종 결과는 step1-C 기록에 있다.
- 0059은 실제 로컬 Supabase(`review-qa`, Docker)에도 처음 적용했다. `input_method` 확인 블록을 포함해 오류 없이 적용됐다([기록](../recording-segments-2026-09-25/local-setup.txt)). 운영 DB가 아니다.
- step1-C는 0059의 `discard_review_recording`·`sweep_review_recordings`·철회 trigger 본문을 0060에서 교체한다(저장 중 녹음의 취소·파기 연결). 0059 파일은 바꾸지 않았다.

## 확인하지 않은 것

- 실제 Supabase Storage 업로드와 동시 트랜잭션 부하. PGlite는 연결 하나로 순차 실행한다.
- 이 폴더에는 Graft 결과가 없다. 수동 코드 검토를 Graft 결과로 표시하지 않는다.
- 운영 DB의 `input_method<>'upload'` 0건 확인과 0059 적용. 운영 반영은 step1 전체 검증과 사용자 승인 뒤에 한다.
- 녹음 화면(step2)과 실제 기기 녹음(step0 V01~V06).
