# Phase 25 · Step 7 검증 기록 — collection-ui

검증일: 2026-09-18  
상태: **completed**

## 이번 작업의 변경 범위

- 기존 부분 구현을 유지했다: `app/api/admin/notion/top-level/route.ts`, `app/api/admin/notion/roots/route.ts`, `components/admin/notion-collection.tsx`, `components/admin/notion-installation.tsx`, `app/admin/sources/page.tsx`의 관리자 연결·최상위 목록·root 매핑·10초 현황 폴링을 다시 만들지 않았다.
- `components/settings-s5.tsx`, `components/notion-source-list.tsx`, `app/api/d/[dept]/settings/notion/route.ts`: 자동 수집 문서를 별도 접이식 목록으로 분리했다. 세션 클라이언트와 `sources` RLS로 200행씩 읽고 제목·상태·마지막 수집·오류 코드별 한국어 안내를 표시한다. 부서장은 제외(하위 포함), 부서장 전용, 다시 가져오기와 root별 카드 후보 토글을 사용하고 일반 멤버에게는 쓰기 버튼이 없다.
- `app/api/d/[dept]/settings/route.ts`: 자동 수집분(`root_id is not null`)은 위 전용 페이지네이션 경로에서만 읽고 기존 연결 자료 목록은 직접 등록분만 읽는다.
- `supabase/migrations/0045_notion_collection_controls.sql`: `set_notion_root_card_candidates(root, enabled)`를 추가했다. `can_see(..., 'leads_only')`를 호출하고 root 및 소속 v2 source의 `ingest_mode`를 함께 변경한다. authenticated는 함수 실행만 가능하고 테이블 직접 쓰기 권한은 없다.
- `app/api/admin/notion/top-level/route.ts`: 최상위 제목을 응답 전에 마스킹하고 200자로 제한했다. 하위 항목은 계속 반환하지 않는다.
- `app/api/admin/notion/roots/route.ts`: root 저장 성공 뒤 `notion_discover` bulk 작업을 예약하고 워커를 깨운다. 동의 실패 때는 인원 수만 반환하고 작업을 만들지 않는다.
- `lib/demo-access.ts`, `scripts/seed-demo.ts`, `tests/seed-demo.test.ts`: 합성 root 2개, 자동 수집 source 9개, 완료·대기·실패·제외 카운트와 제외 1건을 추가했다. seed 재실행 시 source → exclusion → root 순서로 정리한다.
- `app/demo/notion/page.tsx`, `components/demo-notion-collection.tsx`, `app/demo/page.tsx`, `app/demo/features/page.tsx`: `/demo/notion`을 기능 지도에 연결했다. 연결·두 최상위 항목 매핑·동의 차단·제외·재발견·공개 범위·카드 후보 토글은 React 메모리에만 남고 API 요청을 만들지 않는다.
- `tests/e2e/notion-collection.spec.ts`: 라우트 수준 Notion 응답 mock, 하위 제목 비노출, 동의 게이트, 제외 후 재발견 유지, 일반 멤버 버튼 부재·403, 데모 DB 쓰기·Notion·LLM 호출 0, PC·390px 오버플로와 스크린샷을 검증한다.

## 코드 관계·구조 확인

실사용 관리자 경로는 `AdminSourcesPage` → `NotionCollection` → `/api/admin/notion/top-level`·`/api/admin/notion/roots`다. 최상위 목록만 `notion_installation_for_admin` → `withNotionForAdmin` → `searchNotion`으로 설치 토큰을 요청 범위에서 복호화하며, 응답에는 마스킹한 최상위 제목·ID·종류만 남는다. root 저장은 세션 RPC `admin_upsert_notion_root` 뒤 식별자만 든 `notion_discover` job을 예약한다.

실사용 S5 경로는 `SettingsS5` → `NotionSourceList` → `GET/PATCH/POST /api/d/[dept]/settings/notion`이다. GET은 `requireMembership`으로 URL 부서를 실제 멤버십 ID로 바꾸고 세션 Supabase에서 `sources.root_id is not null`을 200행 범위 조회한다. `sources_visible_access`가 `can_see()`를 호출하므로 visibility 판정을 애플리케이션에 복제하지 않는다. PATCH는 lead를 먼저 확인한 뒤 `set_notion_exclusion`, RLS source update, `set_notion_root_card_candidates`만 호출한다. POST의 기존 재가져오기는 세션 source 확인 뒤 식별자 job을 예약한다. 사용자 요청 경로에 service role 클라이언트를 추가하지 않았다.

데모 경로는 `DemoNotionPage` → `DemoNotionCollection` → `NotionSourceList(demo)`이며 `DEMO_NOTION_ROOTS`·`DEMO_NOTION_SOURCES` 합성 상수를 초기 상태로 사용한다. 데모 이벤트 핸들러는 React state만 바꾸며 fetch·DB·Notion·LLM 호출이 없다. 같은 상수를 `seed-demo.ts`가 합성 DB row 입력으로 사용하므로 화면과 시드의 root·카운트·source 목록이 어긋나지 않는다.

Graft·Archify는 PATH에 없어 결과가 없다(`graft: not found`, `archify: not found`). 실제 파일 읽기, `rg` 호출자 검색, TypeScript build와 위 경계 테스트로 관계를 확인했다.

## Acceptance Criteria 실행 기록

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/notion-collection-controls-route.test.ts tests/notion-collection-admin-routes.test.ts tests/notion-reimport-route.test.ts tests/seed-demo.test.ts tests/demo-access.test.ts` | 성공 — 5 files, 32 tests |
| `node scripts/verify-security-sql.mjs 'D:/바이브코딩/.sasu-qa-db'` | 성공 — 격리 PGlite 208 checks, 0 failed. 카드 후보 RPC의 lead-only 실행·anon 거부·source ingest mode 변경 포함 |
| `npx eslint <Step 7 변경 TS/TSX 파일>` | 성공 — 오류·경고 없음 |
| `npx tsc --noEmit` | 성공 |
| `npm run lint && npm run build && npm run test` | 성공 — Next.js 16.3.4 optimized build, 108 files / 1,203 tests |
| `npm run e2e -- --grep notion` | 성공 — Chromium 7/7. 새 Step 7 시나리오 5건과 기존 Notion 자동 갱신 PC·390px 2건 |
| `git diff --check -- <Step 7 변경 파일>` | 성공 — whitespace 오류 없음. 기존 CRLF 변환 안내만 출력 |

Vitest는 기존 Vite native config 전환 예정 안내와 `vite-tsconfig-paths` 안내를 출력했으나 테스트 실패·경고 판정은 없었다. E2E의 새 Step 7 시나리오는 `/demo/notion` 정적 합성 화면과 브라우저 route mock만 사용해 쓰기·Notion·LLM 호출을 만들지 않았다. 같은 grep에 포함된 기존 `product-continuity` 2건은 설정된 QA 로그인/읽기 경로와 route-level mock을 사용했고 제품 데이터 쓰기는 없었다.

## E2E 시나리오 결과

- 조직 관리자: mock한 최상위 2건을 영업팀·개발팀에 매핑하고 수집 시작 뒤 `발견/완료/대기/실패/제외` 카운트를 확인했다. 페이지 HTML과 mock 네트워크 응답 모두 `비밀 하위 페이지 제목`을 포함하지 않았다.
- 미동의 부서: 인사팀 매핑은 `동의하지 않은 멤버 1명` 안내로 차단되고 진행 현황/root가 생성되지 않았다.
- 부서장: `가격·할인 승인 기준`을 제외한 뒤 재발견 체험을 실행해도 `제외됨`을 유지했다.
- 일반 멤버: 제외·부서장만으로·다시 가져오기 버튼이 0개이고 mock PATCH 응답이 403이었다. 별도 Vitest는 실제 route가 DB 접근 전에 403을 반환함을 고정했다.
- 데모: 연결·매핑·공개 범위·다시 가져오기 조작 동안 API write, Notion, Groq/OpenAI/Voyage 요청이 각각 0건이었다.
- 모바일: 390px에서 `documentElement.scrollWidth <= innerWidth`, 접이식 목록과 상태 텍스트 노출을 확인했다.

## 스크린샷

- 관리자 PC: [step7-admin-pc.png](step7-admin-pc.png)
- 관리자 390px: [step7-admin-mobile.png](step7-admin-mobile.png)
- S5 PC: [step7-s5-pc.png](step7-s5-pc.png)
- S5 390px: [step7-s5-mobile.png](step7-s5-mobile.png)

네 이미지를 원본 해상도로 다시 열어 가로 잘림·겹침이 없고 상태가 색만이 아니라 텍스트로 구분됨을 육안 확인했다.

## CRITICAL 점검과 미실행 항목

- visibility는 `sources` RLS와 새 RPC 모두 `can_see()`만 호출한다. 앱 코드에 동일 판정식을 만들지 않았다.
- `dept_id`는 요청 본문에서 받지 않고 `requireMembership` 결과를 사용한다. source/root ID도 세션 RLS와 lead RPC에서 다시 검증한다.
- 관리자 응답에 하위 페이지 제목·본문·오류 상세를 넣지 않았다. 최상위 제목은 마스킹 후 반환한다.
- 데모 화면은 브라우저 상태 전용이고 실제 DB 쓰기·Notion·LLM 호출이 없다.
- 운영 DB 적용, 운영/로컬 시드 실행, `db push`, 실제 Notion 호출, 실제 LLM 호출, 운영 배포는 지시대로 미실행했다. 0045 운영 적용과 실제 Notion 워크스페이스 검증은 별도 승인 대상이다.
- git commit·push·stash·checkout·reset을 실행하지 않았고 무관한 파일을 되돌리지 않았다.
