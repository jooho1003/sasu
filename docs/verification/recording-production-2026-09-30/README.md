# 웹 회의 녹음 운영 반영 — 2026-09-30

사용자 승인(2026-09-30): "운영 반영하고 푸시 정리 해줘", 이어서 "녹음까지 반영, 스위치는 꺼둔 채". 9/28 결정(녹음 migration은 실제 기기 게이트 뒤)을 바꿔, **migration과 코드를 실기기 확인 전에 운영에 반영하고 조직 녹음 스위치는 끈 채 둔다.** 스위치를 켜는 것은 실제 기기 V01~V06 확인 뒤다(ADR-070 사용자 결정 2026-09-30).

같은 날 다른 세션이 phase 34(0065, 방치 업로드 정리)를 먼저 분리 배포했다([기록](../review-upload-timeout-2026-09-30.md)). 이 문서는 그 뒤에 남은 phase 23·33의 운영 반영 기록이다.

## 반영 대상

- 코드: PR #16 병합 커밋 `ec44f28`(main). phase 23 step4-A·0·1·2·3·4-B1~B8, phase 33, 낡은 E2E 두 건 수정. phase 34는 main에 먼저 들어가 있었고 이 브랜치에 병합했다(`a7201d6`·`4e257d0`).
- DB: migration `0058`~`0064` 7개.
- 운영 환경변수: `RECORDING_KEY_SECRET`(Production, Secret, 난수 32바이트 base64url). 값은 Vercel에만 있고 리포·로컬 `.env`에는 없다. `RECORDING_KEY_VERSION`은 기본값 1을 쓴다.
- 켜지 않은 것: 조직 녹음 스위치(`org_settings.browser_recording_enabled`, 운영 행 0개 = 모든 조직 꺼짐), CSP 강제(`SASU_CSP_ENFORCE` 미설정 = Report-Only).

## 실행 순서와 결과

| 단계 | 실행 | 결과 |
|---|---|---|
| 사전 확인(읽기 전용) | 운영 DB 조회 | migration 58개(0001~0057 + 0065), `review_recordings` 없음, `reviewed_materials.input_method<>'upload'` **0건**(ADR-070 적용 전 조건), 녹음 스위치 켠 조직 0/0, 최근 30분 작업 done 6·밀린 작업 0 |
| 적용 순서 검증 | 격리 PGlite SQL 하니스를 운영과 같은 순서(0057 → 0065 → 0058~0064, 0065를 `0057b_`로 이름만 바꾼 임시 복사본)로 실행 | **282 통과 · 실패 0**, 권한 조합 2,016 |
| 스키마 백업 | `npx supabase db dump --db-url …` → 리포 밖 비공개 `.vercel/recording-schema-before-20260930.sql` | 557,008바이트, SHA-256 `b48493887689460af40e24fecb2b2995e236ceadfd4b72685a370c5d04751de0` |
| 대조 | `npx supabase migration list --db-url …` | 원격에 없는 것은 0058~0064 7개뿐. 0055~0057·0065는 로컬 파일과 이름까지 같음. [전](migration-list-before.txt) |
| dry-run | `npx supabase db push --db-url … --include-all --skip-vault --dry-run` | 적용 예정 0058~0064 정확히 7개, seed·role 0. [기록](db-push-dry-run.txt). `--skip-vault`는 루트의 로컬용 `supabase/config.toml` vault 값이 운영에 올라가지 않게 붙였다. 0065가 먼저 적용돼 있어 `--include-all`이 필요했다 |
| 적용 직전 재확인 | 같은 조회 | 녹음 자료 0건, migration 58개, main `f1ccfbe` 그대로 |
| **DB 적용** (17:16:40~17:16:47) | `npx supabase db push --db-url … --include-all --skip-vault --yes` | 0058~0064 7개 적용, 오류 0. [기록](db-push.txt) |
| 적용 후 검증 | 조회 + `migration list` | migration 65개, 로컬·원격 일치([후](migration-list-after.txt)). `review_recordings`·`review_original_segments`·`dept_glossaries` RLS on. 새 함수 12개 존재. `sweep_review_recordings`는 anon·authenticated 실행 불가·service_role 가능. 0058의 `enqueue_decision_embedding` anon·authenticated 실행 불가. 기존 코드의 작업이 적용 뒤에도 done. service_role로 워커 준비 sweep 4개 호출 후 되돌림 → 모두 0건 정상. [기록](db-post-check.txt) |
| 환경변수 | `vercel env add RECORDING_KEY_SECRET production --sensitive`(stdin) | Production · Secret 확인 |
| 빌드 확인 | 피처 브랜치 푸시 → Vercel preview | `2e4cec4`·`4e257d0` preview 빌드 성공 |
| **코드 배포** (17:19:05) | PR #16 제목·본문 갱신 후 `gh pr merge 16 --merge` → main 자동 배포 | 이전 운영 `dpl_EFEZEAxnbNUgig4FDsFo1xDgsqcP` → 새 운영 **`dpl_Gtzz9Xpa3CC1pjJgqmKY8FegYssj`** Ready, `sasu-alpha.vercel.app` 연결(`vercel inspect`) |

## 배포 직후 확인

| 확인 | 결과 |
|---|---|
| curl | `/`·`/privacy`·`/robots.txt`·`/demo/features`·`/login` 200. 무서명 `POST /api/jobs/run`·`/api/slack/events` 401 |
| CSP 헤더 | `content-security-policy-report-only`에 요청별 nonce·`strict-dynamic`. 강제 헤더 없음 |
| 워커 | 비밀값을 넣은 `POST /api/jobs/run` 1회 → 200 `{"claimed":0,"done":0,"failed":0}`. 준비 단계 sweep(원본 만료 → 녹음 세션 → 방치 업로드 → 구간)이 운영에서 통과했다(실패하면 500 `worker_failed`) |
| 작업 큐(17:27) | 배포 뒤 `notion_poll` done 2, 실패 0, 3분 넘게 밀린 queued 0, `review_recordings` 0 |
| 운영 E2E (`E2E_BASE_URL=https://sasu-alpha.vercel.app`, `SASU_RETRO_ENABLED=true`) | `guest`·`demo-reviewer`·`demo-public-workspace`·`demo-meeting-recorder`·`site`·`security-headers` **26/26 통과 (5.3분)**. 게스트 열람 전후 운영 DB 행 수 불변, 심사위원 60초 메모리 녹음·재생에서 쓰기 요청 0 |
| 운영 CSP 실측 (V14 일부) | [csp/](csp/): Report-Only 7개 페이지(의도한 404 1개 포함) 위반 0, 탐색 위반 0, 페이지 오류 0, nonce 스크립트 모두 일치. 주입 시험은 보고만 되고(disposition `report`) 실행됨 — Report-Only이므로 설계대로다 |

E2E가 다시 쓴 과거 기록 5개(`csp-rendering-2026-09-24/` JSON 3개, `step3-demo-local.png`, `demo-workspace/ledger-desktop.png`)는 되돌렸다. CSP JSON 3개는 운영 결과라 이 폴더의 `csp/`로 옮겨 남겼다.

## 되돌리기

- 코드: `vercel promote dpl_EFEZEAxnbNUgig4FDsFo1xDgsqcP`(phase 34까지의 이전 운영). 단, 이전 코드는 녹음 테이블을 쓰지 않을 뿐 새 스키마와 함께 동작한다(DB → 코드 순서로 설계).
- DB: 0058~0064에는 `supabase/rollback/` down 스크립트가 없다. 녹음 행이 0건인 동안 문제가 생기면 위 스키마 백업의 함수 정의로 교체 함수(`recording_key_context`·`private.review_original_available`·`review_storage_allowed`·`consume_review_access`·`authorize_review_access`·`review_action` 등)를 되돌리는 별도 migration을 쓴다.

## 하지 않은 것 · 남은 게이트

- 조직 녹음 스위치 켜기: 실제 기기 V01~V06(마이크·Meet/Zoom 탭 소리·절전 복귀) 확인 뒤, 조직 관리자가 켠다.
- V13 제공사 확인(Voyage 학습 옵트아웃, 운영 Groq 키 조직 ZDR), V14 CSP 강제(`SASU_CSP_ENFORCE=true`, Report-Only 1일 관찰 뒤), V16 실제 모델 지시문 문서, V20 실기기 정량 실측.
- 로그인 실계정 경로(녹음 화면·용어집·검토 화면)의 운영 수동 확인. 매직링크 로그인이 필요해 자동 검증에서 뺐다.
