# Step 7: trailer-verification

## 읽어야 할 파일

- `/docs/PRD.md` §11 "예고편 발행 (ADR-045)" 행 전체 — 이 step은 그 행을 스펙과 기록으로 옮긴다
- `/docs/ARCHITECTURE.md` §8 · §6-2 불변식 20·22
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §L1 "부서장 — 예고편" 흐름 · §L3
- step 0~6 산출물 전부, 특히 `app/api/d/[dept]/trailers/**`, `app/t/[slug]/page.tsx`, `app/demo/d/[dept]/trailers/page.tsx`, `scripts/snapshot-demo-trailer.ts`, `scripts/seed-demo.ts`
- phase 10 산출물: `scripts/seed-qa-org.ts`, `tests/e2e/org-admin.spec.ts`(QA 계정·세션 발급 방식)
- `tests/e2e/ask-permission.spec.ts` 74행~ `runWorker`(워커 수동 실행), `tests/e2e/guest.spec.ts`(행 수 불변 확인)

## 작업

### 1. QA 조직 시드 확장 (`scripts/seed-qa-org.ts`, 작성만)

- QA 조직에 부서 `QA 예고편`(고정 UUID)과 부서장 계정 `SEED_QA_LEAD_EMAIL`/`PASSWORD`(동의 완료)을 추가한다.
- 합성 원칙 문서 소스(`is_principles`, `visibility='dept'`) + items 몇 개, 합성 결정 3건(`visibility='dept'`), `leads_only` 결정 1건, 정정 관계(원 결정 → `supersedes_id` 새 결정) 1쌍을 넣는다. 모든 텍스트는 합성이며 실제 회사·인물 이름이 없다.
- QA 조직 `trailer_publish_enabled`는 **false로 시작**한다(E2E가 조직 관리자로 켠다). `--reset`은 QA 예고편 행과 카운터를 지우고 조직 허용을 false로 되돌린다.
- `.env.example`: `SASU_TRAILER_PUBLISH_ENABLED=false`, `SASU_TRAILER_DEMO_PATH=`, `SEED_QA_LEAD_EMAIL=`, `SEED_QA_LEAD_PASSWORD=`, `E2E_TRAILER_DB=`.

### 2. E2E `tests/e2e/trailer-publish.spec.ts`

**A. 항상 실행(DB 쓰기 없음, 플래그 없는 서버)**
- `/d/<임의 uuid>/trailers`, `/t/abcdefghijklmnopqrstuv`, `/demo/d/<임의 uuid>/trailers` → 404
- `POST /api/d/<임의 uuid>/trailers` → 404
- `/demo`에 예고편 카드 0개, `/`의 예고편 섹션 링크가 `/t/`로 가지 않음

**B. 운영 DB·실제 LLM 필요** — `E2E_ALLOW_EXTERNAL_WRITES=1`, `E2E_TRAILER_DB=1`, QA 계정 env가 모두 있을 때만. 서버는 `SASU_TRAILER_PUBLISH_ENABLED=true`, `SASU_ORG_ADMIN_MODE=on`.
1. QA 부서장 → `/d/<qa>/trailers/new` 후보에 `leads_only`·정정된 결정이 **없다** → 결정 2건 선택·생성 → 워커 실행 → 목록 상태가 검토로 바뀐다
2. 검토 화면: 고정 문구 보임 · 필드 하나 수정·저장 → 검사 중 → 워커 → 검토(해시 초기화로 승인 수 0)
3. 전 항목 승인 → 조직 허용 off 상태에서 발행 → "조직 관리자가 공개 예고편을 허용해야" 안내
4. QA 조직 관리자 → `/admin` 스위치 켬 → 부서장 발행 → 링크 받음
5. anon PostgREST로 `public_trailer` 호출 → 최상위 키 집합 = `{apply_url, scenarios}` · `/t/<slug>` 렌더 · "가상화되었습니다" 고지 보임 · 페이지 로드 중 POST/PATCH/DELETE 요청 0
6. 철회 → `/t/<옛 slug>` 404 → 수정·재검사·재승인·재발행 → 새 slug ≠ 옛 slug
7. 관리자 [철회] → 공개 목록에서 사라짐 · 스위치 끔 → 부서장 발행 시도 409
8. 하루 20회: 부서장 토큰으로 `create_trailer_draft` RPC를 **직접** 21회 호출(라우트를 거치지 않아 job·LLM 없음) → 21번째 `trailer_daily_limit` · 행 수 20 증가. 끝나면 `--reset` 정리
9. 게스트 `/demo/d/<DEMO_TRAILER_DEPT_ID>/trailers`: 열람 전후 `llm_calls`·`trailers`·`jobs` 행 수 불변 · [체험하기]가 `/t/onsaemiro2026demotrail`로 가고 렌더된다
10. 데모 발행본 원문 겹침 0: service role로 데모 발행본과 원문(결정·카드 제목·원칙 items)을 읽어 `runTrailerGate` → `passed === true`

로그·첨부에 시나리오 본문·원문을 남기지 않는다.

### 3. 로컬 실행과 기록 `docs/verification/trailer-publish.md`

- 이번 step에서 실행한 것(A 그룹·단위·라우트·SQL 하니스·빌드·`e2e:trailer`·`guest`·`site`·`org-admin` A 그룹 회귀)의 실제 결과.
- PRD §11 예고편 발행 행의 항목별 매핑 표(하니스 케이스 번호 / 단위 테스트 / E2E B 번호).
- **O11 실행 순서**(메인이 승인 후 그대로 쓴다): `supabase db push`(0027) → 배포(발행 플래그 off) → `npx tsx scripts/snapshot-demo-trailer.ts --dept … --decisions …` → 메인이 스냅샷 검토(검사 통과·가상화 품질·금지어) 후 커밋 → `npx tsx scripts/seed-demo.ts` → `npx tsx scripts/seed-qa-org.ts` → 로컬 서버(플래그 on) + `E2E_ALLOW_EXTERNAL_WRITES=1 E2E_TRAILER_DB=1 npm run e2e -- tests/e2e/trailer-publish.spec.ts` → Vercel env `SASU_TRAILER_PUBLISH_ENABLED=true`, `SASU_TRAILER_DEMO_PATH=/t/onsaemiro2026demotrail` → 배포 → 운영 URL에서 `/`·`/demo`·`/t/…` 확인.
- 한계: 자동 검사는 바꿔 쓰기·수치 노출을 막지 못한다(R-4) — 데모 스냅샷은 사람 검토를 거친다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
npm run e2e:trailer
npm run start -- --port 3116   # 별도 터미널, 플래그 없음
E2E_BASE_URL=http://127.0.0.1:3116 npm run e2e -- tests/e2e/trailer-publish.spec.ts tests/e2e/org-admin.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts
# 기대: A 그룹 통과, B 그룹 skipped, 기존 스펙 통과
```

## 검증 절차

1. AC를 실행하고 수치를 기록 문서에 적는다.
2. 체크리스트: B 그룹이 env 없이 실행되지 않는가 · 스펙이 service role을 검증 조회에만 쓰는가 · PRD §11 행의 항목이 전부 매핑됐는가.
3. `phases/11-trailer-publish/index.json` step 7을 갱신한다. B 그룹 미실행을 summary에 명시한다.

## 금지사항

- `E2E_ALLOW_EXTERNAL_WRITES=1`로 실행하거나 시드·스냅샷 스크립트를 실행하지 마라. 이유: 운영 DB 쓰기와 실제 Groq 호출은 O11 승인 범위다.
- skip된 B 그룹을 통과로 기록하지 마라. 이유: ADR-026.
- 스펙을 통과시키려고 SQL의 발행 조건을 완화하지 마라. 결함이면 `blocked`로 보고한다.
