# Step 7: collection-ui

조직 관리자의 범위 매핑 화면, 부서장의 수집 문서 트리, 데모 시드를 만든다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-02·03·07), §5 화면 구성(S5), §6-7 게스트 모드, §7 디자인 가이드, §8 ADR-055·ADR-060 경계
- `/docs/ADR.md` ADR-044·048·055·060
- `/docs/planning/노션_전체수집_설계.md` §8(와이어프레임)
- `app/admin/sources/page.tsx`, `components/admin/**`, `app/api/admin/_shared.ts`, step 2의 연결 카드
- `components/settings-s5.tsx`의 노션 카드(862행·1119행 부근), `app/api/d/[dept]/settings/notion/route.ts`
- step 4의 RPC: `admin_upsert_notion_root`, `admin_notion_roots`, `lead_upsert_notion_root`, `set_notion_exclusion`
- `scripts/seed-demo.ts`, `tests/seed-demo.test.ts`, `lib/demo-access.ts`, `tests/e2e/demo-reviewer.spec.ts`
- `node_modules/next/dist/docs/`의 관련 가이드(이 저장소의 Next.js는 학습 데이터와 다르다)

## 작업

1. 조직 관리 › 자료 연결 › 노션:
   - 공유된 최상위 항목 목록은 서버 라우트(`GET /api/admin/notion/top-level`)가 설치 토큰으로 `searchNotion` 결과 중 `parent.type==='workspace'`인 것만 골라 **마스킹한 제목·id·종류**로 돌려준다. 저장하지 않는다. 하위 항목은 조회·반환하지 않는다.
   - 행마다 부서 선택·공개 범위·새 문서 포함, `나머지 전부를 한 부서로`(workspace root), [수집 시작]. 저장은 `admin_upsert_notion_root`. `consent_required`면 "○○팀에 동의하지 않은 멤버 N명이 있어 시작할 수 없습니다"(이름 없음)와 멤버 화면 링크.
   - 고지 문구(필수): "노션에서 일부만 보던 문서도 선택한 부서의 전원(또는 부서장)에게 검색됩니다." "회의록처럼 발언이 담긴 문서도 수집됩니다. 부서 구성원 전원의 동의가 필요합니다."
   - 진행 현황: `admin_notion_roots()`의 부서별 카운트·상태·미배정 수. 10초 간격 폴링, 영원한 스피너 금지(상태 문구로 표시).
2. 부서 설정(S5) 노션 카드:
   - 여러 줄 붙여넣기(step 3)에 `하위 페이지 포함` 체크(step 4 연결).
   - `자동 수집된 문서` 접이식 목록: 제목·상태·마지막 수집·오류 코드별 한국어 안내(`notion_not_found` 공유되지 않았거나 삭제됨 / `notion_page_too_large` 너무 큼 / `notion_database_unsupported` 지원하지 않는 데이터베이스 / `notion_rate_limited` 호출 제한으로 지연 중). 행 동작: [제외](하위 포함 선택)·[부서장만으로]·[다시 가져오기]. 200행 넘으면 페이지네이션. 데이터는 세션 클라이언트 + RLS로 읽는다.
   - root별 `카드 후보로도 사용` 토글(기본 off, 켜면 "과거 문서에서 결정 카드가 만들어질 수 있습니다" 경고).
3. 데모: `seed-demo.ts`에 합성 root 2개와 카운트, 합성 소스 목록을 추가하고 `/demo` 기능 지도에 연결한다. 데모에서는 연결·매핑·제외가 브라우저 상태로만 동작한다.
4. 접근성·모바일 390px: 표는 카드형으로 접히고, 상태는 색 외에 텍스트로 구분한다. UI 문구는 한국어 단일.

## 코드 관계와 구조 확인

관리자 화면이 부르는 RPC·라우트와 S5가 읽는 테이블을 `docs/verification/notion-collection/step7.md`에 기록하고, 두 화면의 스크린샷(PC·390px)을 같은 폴더에 남긴다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test
npm run e2e -- --grep "notion"
```

E2E(`tests/e2e/notion-collection.spec.ts`, 노션 API는 라우트 수준에서 mock):
- 조직 관리자: 연결됨 상태 → 최상위 2건을 두 부서에 매핑 → 수집 시작 → 현황 카운트 표시. **페이지 HTML과 네트워크 응답에 하위 페이지 제목 문자열이 없다.**
- 미동의 멤버가 있는 부서로 매핑 → 차단 문구, root 미생성.
- 부서장: 목록에서 1건 제외 → 비활성 표시, 재발견 후에도 복구되지 않음. 일반 멤버는 노션 카드의 쓰기 버튼이 없고 API도 403.
- 데모 계정: 전 과정 동안 DB 쓰기·노션 호출·LLM 호출 0건(기존 데모 검증 방식으로 전후 카운트 비교).

## 검증 절차

AC → CRITICAL 점검(버튼 숨김이 아니라 서버·RLS 집행, 요청 경로 service role 없음 — 최상위 목록 라우트의 토큰 복호화는 step 2의 `withNotion…` 경로만) → `index.json` step 7 갱신.

## 금지사항

- 조직 관리자 화면·응답에 하위 페이지 제목·본문·오류 상세를 넣지 마라. 이유: ADR-044.
- i18n 프레임워크나 새 UI 라이브러리를 도입하지 마라. 이유: CLAUDE.md 규칙, ADR-048 시각 언어 유지.
- 데모에서 실제 쓰기·노션 호출을 하지 마라. 이유: ADR-055.
- 운영 시드·운영 배포·커밋 금지.
