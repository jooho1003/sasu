# 개발 회고 검증 재실행 (phase 27 step 7)

2026-10-05. 로컬 QA(Supabase `review-qa`, 서버 3011, `SASU_RETRO_ENABLED=true`)에서만 실행했다. 운영 DB·배포·운영 데이터 생성은 없다. 합성 번들만 사용했고 실제 활동 제목·URL·회고 본문은 기록하지 않는다. 수집기(`scripts/retro-collect.ts`)는 이 작업에서 실행하지 않았다.

PRD §11 "개발 회고 (ADR-063)" 행의 완료 조건(업로드 → 초안 → 근거 제외 → 재생성 → 편집 → 확정 → 공개 → 내보내기, LLM 실호출, 1440/390 캡처)을 이번 코드 상태에서 다시 확인한 기록이다. 이전 기록은 `../daily-retro-2026-09-19/`.

## 실행 결과

| 검증 | 커맨드 | 결과 | 원시 로그 |
|---|---|---|---|
| lint | `npm run lint` | 통과 | `lint.txt` |
| 타입 | `npx tsc --noEmit` | 통과 | `tsc.txt` |
| 단위 | `npm run test` | 186 파일 · 1,881 테스트 통과 | `unit.txt` |
| SQL | `node scripts/verify-retro-sql.mjs "D:/바이브코딩/.sasu-qa-db"` · `verify-security-sql.mjs` | 통과 316, 실패 0 (회고 29건 포함, 권한 조합 2,016). 두 스크립트가 같은 하니스를 돌려 같은 결과 | `sql.txt` |
| 빌드 | `E2E_TRAILER_INVITES=1 node scripts/review-qa.mjs build` (QA 환경 `next build`) | 첫 시도 Turbopack 내부 오류(`Symlink [project]/node_modules is invalid`, 일시), 재시도 통과 | `build.txt` |
| E2E 회고 | `E2E_RETROS=1 node scripts/review-qa.mjs retro-test tests/e2e/demo-retros.spec.ts` | `retros.spec.ts`·`demo-retros.spec.ts` 2 통과 (30초) | `e2e.txt` |
| E2E 회귀 | `node scripts/review-qa.mjs ui-regression` | 56 통과 · 9 실패 (아래) | `e2e-ui-regression-run1.txt`, `-run2.txt` |
| 수집기 dry-run | `npx tsx scripts/retro-collect.ts --date 2026-10-05 --dry-run` / `--chrome --dry-run` | 통과(root, 사용자 동의) — 136건 / 182건(web_visit 46), 임시 History 0 | `collector-dry-run.txt` |

### E2E 회고 상세

- 1회차 실패: `retros.spec.ts:56`에서 부서 공개 전환 후 팀원 B의 조회가 404. 원인은 phase 30(`aa31f85`)이 공개 전환에 `window.confirm` 동의를 추가했는데 스펙이 대화상자를 수락하지 않아 전환이 취소된 것이다. 제품 버그가 아니라 스펙이 뒤처진 경우로 판단했다. 스펙에 `page.once("dialog", d => d.accept())` 한 줄만 추가했다(`tests/e2e/retros.spec.ts`, 제품 코드 변경 없음). 로그: `e2e-run1-failed.txt`.
- 2회차 통과. 흐름: 번들 업로드 → 초안(실제 LLM) → 항목 제외 → 재생성 → 편집 → 옛 revision 저장 409 → 확정 → Markdown 다운로드의 `[^A1]` 각주 → export `cache-control` private/no-store → 팀원 B에게 `self` 회고 404 → `dept` 전환 후 B 200. 페이지 오류 0.
- **`llm_calls` purpose=`retro_draft` 개수: 2** (`live-results.json`의 `llmCalls`, 스펙이 `>=2`를 단언). 1회차 실패 실행에서도 같은 흐름의 초안·재생성 호출이 있었으나 별도로 집계하지 않았다.
- 스펙이 이전 증거 폴더(`daily-retro-2026-09-19/`)를 덮어써서 `git checkout`으로 복원하고, 새 산출물은 이 폴더로 복사했다.

### E2E 회귀 실패 9건 (회고와 무관하게 보이나 원인은 진단하지 않음)

`ui-regression`(10개 스펙) 1회차 11 실패 → 로컬 데모 시드(`review-qa.mjs seed-demo`, `demo-auth`) 후 2회차 9 실패.

- `guest.spec.ts` 2건: 부서 카드 링크 `a[href*="/cards/"]`를 찾지 못함.
- `ui-refresh.spec.ts` 2건: 시드 후 새로 실패(1회차에는 통과).
- `review-state-recovery.spec.ts` 5건: `구간 1 텍스트`를 찾지 못함.
- 1회차의 `hiring-demo.spec.ts` 4건은 시드 후 통과.

모두 회고 코드를 건드리지 않는 스펙이고 로컬 QA 조직·시드 상태에 기대는 것으로 보이지만, 회고 추가 이전 커밋에서 같은 결과인지 비교하지 않았다. "기존 E2E 전부 통과"는 **충족하지 못했다**. 전체 `npx playwright test`(전 스펙)는 실행하지 않고 위 10개 스펙 묶음만 돌렸다. 로그: `e2e-ui-regression-run2.txt`.

## 누출 점검

| 점검 | 결과 |
|---|---|
| 서버 로그에 회고 제목·활동 제목·quote 문자열 | 0건 (서버 stdout/stderr 6줄, 기동 메시지 위주라 증명력은 약함. Next 서버가 요청 로그를 남기지 않음) |
| anon으로 비데모 `retro_days` select | 로컬 지금 시점 0행이나 비데모 행이 남아 있지 않아(스펙이 정리) 이 점검만으로는 의미가 약하다. SQL 하니스 `retro: demo anon reads confirmed dept only, no private drafts or self days`가 비데모·self 비노출을 단언하며 통과. anon 조회 20행은 전부 데모 부서(비데모 0) |
| 데모 조직 `create_retro_day` 거부 | SQL 하니스 `retro: direct writes… demo are denied`(`demo_org`) 통과 |
| 상세 API에 남의 `self` day 없음 | `retros.spec.ts:54` 팀원 B의 `self` 상세 조회 404 통과 |
| export `cache-control: private, no-store` | `retros.spec.ts`가 정규식으로 단언, 통과 |
| 운영 헤더(읽기 전용 curl, `https://getsasu.com`) | 존재하지 않는 UUID 경로의 회고 API 비로그인 요청 → `307`, `cache-control: private, no-store, max-age=0`. 인증 없이는 실제 export 응답 헤더를 볼 수 없어 로그인 후 헤더는 미확인 |

## 캡처 (합성 데이터, 이 폴더)

`retros-timeline-1440.png`·`retros-timeline-390.png`, `retro-detail-1440.png`·`retro-detail-390.png`, `demo-retros-1440.png`·`demo-retros-390.png`, `settings-retro-1440.png`.

## PRD §11 매핑

| §11 완료 조건 | 이 기록의 근거 |
|---|---|
| 회고 전 흐름(업로드 ~ 내보내기)과 LLM 실호출 | E2E 회고 2회차 통과, `retro_draft` 2회 |
| 타임라인·상세·세팅·데모 화면 1440/390 | 캡처 7장 |
| 권한(self 비노출, 공개 전환, 데모 읽기 전용) | SQL 29건, 스펙 단언 |
| 기존 기능 회귀 | 일부 미충족(위 실패 9건, 원인 미진단) |

## 남은 항목

- 수집기 dry-run: 2026-10-05 root가 실행(사용자 동의). 건수만 기록, [collector-dry-run.txt](collector-dry-run.txt).
- 운영 회고 확인(운영 배포 상태·`SASU_RETRO_ENABLED` 실사용 점검): 미실행. 운영 쓰기 없음.
- ui-regression 실패 9건의 원인 규명 필요 여부 판단.
- step 7 상태 갱신은 루트가 한다.
