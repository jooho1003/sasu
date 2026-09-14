# Step 3: agent-role-ui

## 읽어야 할 파일

- `/docs/ADR.md` **ADR-038** (고정 문구·고지 조건)
- `/docs/PRD.md` §5 화면 표의 **S8** 행과 S7 행, §7 디자인 가이드
- `app/(auth)/d/[dept]/documents/page.tsx`, `components/document-assistant.tsx` (같은 톤·레이아웃·폴링 패턴)
- `app/(auth)/d/[dept]/layout.tsx`, `app/(auth)/d/[dept]/page.tsx` (내비게이션 위치)
- step 2 라우트: `app/api/d/[dept]/roles/route.ts`, `[roleId]/route.ts`, `[roleId]/runs/route.ts`
- `lib/contracts.ts`의 `AgentRoleDefinition`, `lib/agent-role.ts`의 `VerifiedCriterion`

## 작업

### 1. `app/(auth)/d/[dept]/roles/page.tsx`

`requireMembership(dept)`를 호출한 뒤 `<AgentRoles deptId role />`를 렌더한다.

### 2. `components/agent-roles.tsx` (client)

**역할 목록**

- 역할 카드: 이름, 공개 범위, 기준 개수
- 선택한 역할의 지시문과 기준표(라벨·설명·가중치)
- lead에게만 [보관] 버튼. 누르기 전에 확인 단계를 둔다 (인라인 확인 버튼 방식, `window.confirm` 금지).

**역할 만들기** (lead만)

- 입력: 이름, 지시문(textarea, 2000자 카운터), 공개 범위(기본 "팀장만"), 기준 행 추가·삭제(1~10개). 기준 행은 라벨·설명·가중치 1~5 select다.
- `key`는 라벨에서 자동 생성한다: `criterion_1`, `criterion_2`… 사용자에게 보이지 않는다.
- 400 응답 메시지는 폼 아래 `role="alert"`로 보여준다.
- 지시문 placeholder 예시: "백엔드 개발자 채용 서류를 검토합니다. 우리 인재상은 … 프로젝트에서는 Next.js·Supabase를 …"

**문서에 적용** (lead만)

- `GET /api/d/[dept]/documents`에서 `status === "summarized"`인 문서만 체크박스로 보여준다. 최대 20개.
- 바로 위에 고지 문구를 고정한다: "지원자 등 외부인의 문서는 개인정보 수집·이용 동의를 받은 경우에만 올리세요."
- [역할 적용] → `POST runs`. 429·400 메시지를 표시한다.

**점수표** (역할을 선택하면 누구나 보되, RLS 결과만)

- 표 위 고정 문구: **"AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다."**
- 열: 문서 | 가중 점수(0~5, 소수 2자리, 없으면 "—") | 기준마다 한 열 | 상태
- 기준 셀: `evidence === "ok"`면 점수, 아니면 "근거 없음"
- `processing` 행은 "평가 중". 4초 폴링은 processing이 있을 때만 한다.
- `failed` 행은 사유를 한국어로 매핑한다.
  - `no_document_chunks` → "문서에서 읽을 내용이 없습니다"
  - `citation_invalid` → "원문 근거를 찾지 못해 점수를 내지 않았습니다"
  - `llm_timeout` → "시간 초과"
  - 기타 → "평가하지 못했습니다"
- `document_truncated`는 완료 행에 "문서가 길어 앞부분 24,000자만 평가" 배지로 표시한다.
- 행을 펼치면 기준별로 보여준다: 라벨 · 점수 · rationale · 인용 quote 목록 (`/d/${deptId}#item-${item_id}` 링크).
  - `evidence !== "ok"`인 기준은 rationale을 렌더하지 않고 "근거 없음"만 쓴다.
  - summary는 `ok` 기준이 1개 이상일 때만 렌더한다.
- 합격·불합격·추천 같은 라벨·색상 뱃지를 만들지 않는다. 점수 정렬만 제공한다.
- 표는 `overflow-x-auto` 컨테이너에 넣는다 (모바일 대응).

### 3. 내비게이션

- 문서 어시스턴트 헤더 nav와 부서 대시보드 nav(문서 링크가 있는 곳)에 "역할" 링크 `/d/${deptId}/roles`를 추가한다.
- 문서 어시스턴트의 요약 카드 아래에 lead에게만 보이는 링크를 추가한다: "이 문서에 역할 적용 →" (`/d/${deptId}/roles`).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

추가로 `tests/e2e/`에 `agent-roles.spec.ts`를 만든다. 기존 e2e의 로그인·시드 헬퍼를 쓸 수 있으면 다음을 확인한다.

- lead로 `/d/<dept>/roles` 진입
- 고정 문구 "AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다."가 렌더됨
- member에게 "역할 만들기" 폼이 없음

로컬 실행 환경이 없으면 spec만 두고 index.json summary에 "e2e 미실행(사유)"를 적는다.

## 검증 절차

1. AC 커맨드를 실행한다.
2. 체크리스트: UI 문자열이 모두 한국어인가 · i18n 라이브러리를 추가하지 않았는가 · 인용 없는 rationale이 렌더되는 경로가 없는가.
3. `phases/4-agent-roles/index.json`의 step 3을 갱신한다.

## 금지사항

- 새 UI 라이브러리·차트 라이브러리를 추가하지 마라. 이유: 프리징 직전 번들·빌드 리스크.
- `window.alert`·`confirm`·`prompt`를 쓰지 마라. 이유: 기존 화면 패턴과 E2E 자동화를 깬다.
- 클라이언트에서 권한을 판단해 데이터를 거르지 마라. 서버 응답을 그대로 렌더한다.
