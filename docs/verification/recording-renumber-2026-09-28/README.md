# 녹음 작업 번호 정리와 main 재정렬 검증 — 2026-09-28

요청: 설계 결정 1~6 승인과 "너가 고칠건 해주고"(2026-09-28). 플랜: `.claude/plans/recording-decisions-2026-09-28.*`. 운영 DB 쓰기·배포·병합은 하지 않았다.

## 왜 번호를 옮겼나

phase 23 작업(9/24~9/28)이 커밋되지 않은 사이에 origin/main이 17커밋 앞서 나갔다(ASK 수정, PR #6~#12). 그중 migration 0055~0057과 ADR-068이 이 작업의 번호와 겹쳤다.

| 번호 | origin/main·운영 | 이 작업(옮기기 전) | 옮긴 뒤 |
|---|---|---|---|
| migration 0055 | `answer_topic_item_search` | `private_visibility_functions` | 0058 |
| migration 0056 | `answer_topic_active_sources` | `review_recording_sessions` | 0059 |
| migration 0057 | `revoke_can_see_anon` | `review_recording_segments` | 0060 |
| ADR-068 | ASK 지시 대상·기록 시각 | CSP 요청별 nonce 렌더링 | ADR-069 |
| ADR-069 | — | 녹음 세션·구간 원본 | ADR-070 |

운영 실측(읽기 전용 조회, 2026-09-28): 운영 migration 이력은 57개이고 0055~0057은 위 origin/main 파일이다. `review_recordings`는 없다. anon의 `can_see` 실행은 이미 false이고 authenticated는 true다. 내부 트리거 함수 2개(`enqueue_decision_embedding`·`guard_active_item_source`)는 아직 anon·authenticated 실행 권한이 남아 있으며 0058이 회수한다(직접 호출은 원래 실패한다).

`supabase migration list`는 버전만 비교하므로 이 충돌을 "일치"로 보여 줬다. 옮기지 않고 `db push`했다면 녹음 migration은 적용된 것으로 간주돼 건너뛰어졌다.

## 한 일

1. 커밋되지 않은 작업 300개 파일을 scratchpad에 tar로 백업했다. 변경 파일에서 비밀값 패턴(Groq·OpenAI·Slack·JWT·Postgres URL·Voyage·Notion 토큰) 0건을 확인했다.
2. 번호 옮기기: migration 파일 이름 3개, 문서·코드 주석·phase 상태의 참조 32개 파일(worker, sonnet). 목록 형태(`ADR-058/068`, `ADR-054·056·057·058·068`)도 포함했다. `docs/verification/`의 로그·Archify 산출물은 증거라 바꾸지 않았다. 남은 `ADR-068`은 origin/main의 ASK를 가리키는 9/28 플랜뿐이고, `ADR-071`은 생기지 않았다.
3. 5개 커밋(step4-A·step0·step1·step2 일부·docs)으로 나눠 origin/main 위로 재정렬했다. 충돌은 `docs/PRD.md` §8 머리의 문단 추가 한 곳이었고 양쪽 문단을 모두 남겼다. `lib/contracts.ts`(origin의 `citations` `.max(8)`)와 `scripts/verify-security-sql.mjs`(origin의 anon 직접 권한 재현·단언)는 자동 병합됐고, 결과를 읽어 두 변경이 모두 살아 있음을 확인했다.

## 실행 결과 (재정렬 뒤 브랜치)

| 검사 | 결과 | 기록 |
|---|---|---|
| `npx tsc --noEmit` | 오류 0 | [tsc.txt](tsc.txt) |
| `npm run lint` | ESLint 0건, 쉬운 말 검사 차단 0·경고 77(이전과 같은 수) | [lint.txt](lint.txt) |
| 격리 PGlite SQL 하니스(`@electric-sql/pglite@0.5.8`, 새 임시 설치) | 277개 통과·실패 0, 권한 조합 2,016건. origin 0055~0057 뒤 0058~0060 순서에서 녹음 세션·구간 검사 포함 | [sql-security.txt](sql-security.txt) |
| `npm run test` | 145개 파일·1,613개 통과 | [unit.txt](unit.txt) |
| `SASU_VERIFY_BUILD=1 npm run build` | 통과, 38개 페이지 | [build.txt](build.txt) |

`verify-recording-sessions-sql.mjs`·`verify-recording-segments-sql.mjs`는 단독 실행 스크립트가 아니라 SQL 하니스 안에서 불린다. 검증 빌드가 바꾼 `next-env.d.ts`(`.next-verify` 경로)는 생성 파일이라 되돌렸다.

## 확인하지 않은 것

- 실제 로컬 Supabase Storage 통합(`review-qa.mjs recording-storage-test`). 로컬 QA DB는 migration을 이름으로 기록하므로(`review_qa_migrations`) 이름을 바꾼 뒤에는 DB를 새로 만들어야 한다. SQL 본문은 바뀌지 않았다.
- 돌연변이 시험 재실행, Graft·Archify 재생성. 코드 흐름은 바뀌지 않았고 번호·이름만 바뀌었다.
- 운영 DB 적용·배포·병합.

## 배포 순서 (병합 전 필수)

이 브랜치의 워커는 `prepareWorker()`에서 매번 `sweep_review_recordings`를 호출하고, 실패하면 예외를 던진다(`lib/pipeline/review-material.ts` `sweepReviewParts`). 0059 없이 이 코드를 운영에 배포하면 워커 준비가 실패해 모든 작업(슬랙 답변·카드·노션 동기화 포함)이 멈춘다. 운영은 **DB 0058~0060 적용 → 코드 배포** 순서로만 반영한다. 사용자 결정(2026-09-28)에 따라 녹음 migration 적용은 step2·실기기 게이트 뒤이므로, 이 브랜치의 병합도 그 뒤다.
