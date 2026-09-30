# V12 기존 기능 회귀 — 2026-09-30

[상세 설계](../../planning/웹회의_녹음_설계.md) V12는 "기존 ASK·음성/문서 파일·VTT·권한 인지 답변에 회귀가 없고, lint/build/unit/E2E 실행 결과를 기록"하는 항목이다. [분석 v1.2](../../03-analysis/browser-meeting-recording.analysis.md)에서 ⚠️(ASK·VTT 전용 E2E 미실행)로 남아 있던 부분을 채운다. 실제 기기·운영 결과가 아니라 **합성 데이터 + 격리 로컬 Supabase + Groq·Voyage 실제 호출**이다.

## 대상과 환경

| 항목 | 값 |
|---|---|
| 코드 | 2026-09-30 00:19 원본 작업 트리 스냅샷. HEAD `659f131` + 다른 세션의 미커밋 phase 23 step4-B1~B8·phase 33 변경(수정 56·새 파일 129)을 그대로 복사한 별도 worktree `D:/바이브코딩/sasu-v12-20260930`. 복사한 185개 파일이 원본과 바이트 단위로 같음을 `cmp`로 확인 |
| 이유 | 로컬 QA DB에 다른 세션이 0063·0064를 이미 적용해, HEAD만으로는 스키마가 맞지 않는다. 또 커밋·배포될 코드가 이 스냅샷이다. 원본 트리 파일은 실행 중 건드리지 않았다(아래 테스트 수정 1건 제외) |
| DB | 로컬 `review-qa` Supabase(`127.0.0.1:54321`, migration 0064까지). 원격 DB 쓰기 없음 |
| 환경 변수 | `scripts/review-qa.mjs`가 로컬 URL·키·시드 계정을 주입. worktree에 `.env` 없음. 원본 `.env`에서는 `GROQ_API_KEY`·`VOYAGE_API_KEY`·`OPENAI_API_KEY`·`EMBEDDING_PROVIDER`·`EMBEDDING_MODEL`만 전달하고 Supabase·Slack·Notion 변수는 지웠다. `E2E_ALLOW_EXTERNAL_WRITES=1`·`E2E_ALLOW_SHOWCASE_WRITES=1`·`E2E_EXPECT_0025=1` |
| 서버 | `review-qa.mjs build` → `start`(localhost:3011), Chromium |

## 결과

| 층 | 명령 | 결과 |
|---|---|---|
| build | `node scripts/review-qa.mjs build` | 성공 (Next.js 16.3.4) |
| unit | `npx vitest run` | **159 파일 · 1,704 통과** |
| lint | `npm run lint` | **통과** — ESLint exit 0, 문구 검사 221파일 blocking 0 · 기존 경고 79. 약 3분(00:57~00:59), 정체 없음 |
| E2E 자료 검토(음성·문서) | `reviewed-materials.spec.ts` | **4/4 통과** — 한국어 TTS 전체 전사 → 원본 재생 → 편집·재접속·확정·권한·삭제 / 문서 전문 검토·재추출·버전 충돌 / 지원 문서 형식·손상 PDF·처리 중단 / Slack 보존·체크섬 내보내기·멤버 차단 |
| E2E 업로드 경계(문서·VTT) | `upload-boundaries.spec.ts` | **6/6 통과** — lead 문서 마스킹 저장 / member 403 / 데모 부서 거부 / **VTT: 동의한 멤버 발언만 마스킹 저장** / 0025 직접 INSERT 거부 / org_id 변경 거부 |
| E2E 권한 인지 답변 | `review-qa.mjs grounded-answer-test` (`grounded-answer-live.spec.ts`) | **1/1 통과** — 질문 → 오래된 결정·문서·회의 원문 → 재열람, `leads_only` 원문 권한 차단 |
| E2E ASK 권한 (구) | `ask-permission.spec.ts` | **실패 — 기존 테스트 결함**, 아래 §판정 |

**V12 판정: ✅ 충족(조건부)** — 음성·문서 파일·VTT·권한 인지 답변은 현재 흐름의 E2E로 회귀가 없다. `ask-permission.spec.ts`는 제품 회귀가 아니라 9/16부터 낡은 테스트라 따로 고쳐야 한다.

## 실패와 판정

첫 실행(3개 파일, 5.9분)은 3 실패 · 3 통과였다. 셋 모두 원인을 확인했다.

| 사례 | 증상 | 원인 | 조치 |
|---|---|---|---|
| `reviewed-materials.spec.ts:184` TTS | 확정 체크박스를 찾지 못해 300초 타임아웃 | 화면 문구는 `aa31f85`(2026-09-20, 쉬운 말 정리)에서 "전문과 **빠짐**·오류를…"로 바뀌었는데 테스트는 "**누락**"을 찾았다. HEAD에도 있던 기존 결함 | **원본 트리에서 테스트 1줄 수정**(`누락` → `빠짐`). 재실행 통과 |
| `upload-boundaries.spec.ts:176` VTT | "시드 팀원이 동의 상태여야 전사 케이스가 성립한다" | 테스트가 운영 파일럿 시드 이름 "사수 파일럿 팀원"을 찾는다. 로컬 QA DB의 동의한 팀원 이름은 "합성 팀원"(동의 상태 정상) | 원본은 그대로 두고 **worktree에서만** `CONSENTED_MEMBER_NAME`을 "합성 팀원"으로 바꿔 실행. 통과. 원본 테스트의 이름 고정은 후속 과제 |
| `ask-permission.spec.ts` | ① 첫 실행·재실행 모두 업로드 500 (`PGRST303 JWT issued at future`) ② PostgREST를 먼저 깨운 뒤 단독 실행하면 202지만 `document_id` 없음 | ① 실행의 **첫** PostgREST 요청에서만 발생. 직접 발급 토큰 60건(동시 요청 포함)은 모두 200이어서 로컬 PostgREST v16.2가 한동안 요청이 없을 때 오래된 시각으로 판정하는 환경 문제로 본다(추정) ② `POST /api/d/[dept]/documents`는 `52f5525`(2026-09-16, 자료 검토함)부터 `{ ok, review_id, job_id }`를 돌려준다. 테스트는 그 전의 "바로 소스 생성·`document_id`" 흐름을 기대한다 | 수정하지 않음. 증거 준비를 검토함 → 확정 흐름으로 다시 써야 하는 테스트 변경이라 이번 범위 밖. 같은 권한 경계는 `grounded-answer-live`로 확인 |

## 로컬 QA DB에 남은 것

- 첫 실행에서 중간에 멈춘 TTS 사례의 합성 자료 1건, 세 번째 실행의 `ask-permission` 합성 업로드 2건(검토함)이 로컬 `review-qa`에 남았다. 로컬 전용이며 운영 DB와 무관하다.

## 원본 트리 변경

- `tests/e2e/reviewed-materials.spec.ts:184` 1줄(`누락` → `빠짐`). 다른 세션의 미커밋 변경과 섞이지 않게 따로 커밋해야 한다. → `a1410a3`로 따로 커밋했다.

## 후속 — 낡은 테스트 두 건 정리 (2026-09-30 오후)

위 §판정에서 남긴 테스트 부채를 고치고 **원본 작업 트리**(HEAD `a6639ce` + 이 수정)에서 다시 실행했다. 환경은 위와 같은 로컬 `review-qa`와 Groq·Voyage 실제 호출이다. worktree가 아니라 원본 트리라서 `.env`의 Supabase 값은 `review-qa.mjs`가 로컬 값으로 덮어쓴다(테스트의 `loadEnvFile`은 이미 있는 값을 덮어쓰지 않는다). 로컬 QA DB는 0064까지였으므로 `review-qa.mjs setup`으로 0065를 먼저 적용했다. 운영 DB에는 쓰지 않았다.

| 파일 | 고친 내용 |
|---|---|
| `ask-permission.spec.ts` | ① 증거 준비를 현재 흐름으로: `POST /documents` → `review_id` → `ready` 대기 → `publish` → `source_id`. 정리는 `remove_source`와 검토 자료 삭제 ② 답변 본문은 고정 안내 문장이므로(PRD §6-5 5항, phase 32) 본문에 금액이 있는지 대신 lead 인용에 `4,200` 원문이 있는지로 판정. member 쪽 본문·인용·화면에 없어야 한다는 검사는 그대로 ③ 분류 뒤에 예약되는 `embed`와 답변 작업이 `runWorker` 뒤에 생길 수 있어, 대기 폴링이 아직이면 워커를 한 번씩 깨운다(로컬에는 매분 cron 없음) ④ 중복된 로그인 헬퍼를 `support/auth`로 교체 |
| `upload-boundaries.spec.ts` | VTT 화자를 고정 이름("사수 파일럿 팀원") 대신 그 부서의 동의한 팀원(`role=member`, `consented_at` 있음) 중 이름순 첫 명으로 찾는다. 환경마다 시드 이름이 달라도 같은 경계를 검사한다 |

| 실행 | 결과 |
|---|---|
| 1차 (3파일) | 7 통과 · 1 실패 — ASK가 업로드·확정·임베딩까지 통과하고 답변 본문 검사(②의 낡은 기대)에서 실패 |
| 2차 (ASK만) | 실패 — 업로드 500 `PGRST303 JWT issued at future`. 위 §판정의 로컬 PostgREST 첫 요청 문제와 같다. 서버 로그에서 확인했고, 이후 실행마다 직전에 `/rest/v1/`을 세 번 호출해 깨웠다 |
| 3차 (ASK만) | 통과 |
| 4차 (3파일) | 7 통과 · 1 실패 — ASK `embed_status` 90초 대기 초과. jobs 기록상 두 번째 `embed`가 `runWorker` 종료 뒤(16:24:34)에 예약되어 정리 요청의 `after(runOnce)`(16:26:01)까지 처리되지 않았다 → ③으로 수정 |
| **5차 (3파일)** | **8/8 통과 (1.6분)** — ASK 권한 1 · 권한 인지 답변 `grounded-answer-live` 1 · 업로드 경계 6(VTT 포함) |
| **6차 (ASK `--repeat-each=2`)** | **2/2 통과 (1.5분)** |

**V12 판정: ✅ 충족** — 조건이던 낡은 `ask-permission.spec.ts`가 현재 흐름에서 통과한다. ESLint·`tsc --noEmit` 통과.

정리 확인: 이번 실행의 합성 검토 자료 5건은 모두 삭제 상태이고, source 5건은 `remove_source` 설계대로 `active=false`·본문과 임베딩 비움(행과 원장 인용은 보존)이다. `grounded-answer-live.spec.ts`는 실행할 때마다 `docs/verification/grounded-answer-selection-2026-09-23/live/`의 9/23 기록(캡처·`result.json`·`llm-telemetry.json`)을 다시 쓴다. 이번 실행분(질문 5건, 답변 3.5~8.6초)은 기록으로 남기지 않고 9/23 파일을 `git checkout`으로 되돌렸다.
