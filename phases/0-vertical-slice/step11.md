# Step 11: dashboard-s1

## 읽어야 할 파일

- `/docs/PRD.md` **§5 화면 구성 S1** — 요소 목록이 그대로 명세다
- `/docs/PRD.md` **§6-10 빈 상태** 표의 S1 행 · **§6-8 API 엔드포인트** 표(`GET /api/d/[dept]/items?label=`)
- `/docs/PRD.md` **§7 디자인 가이드** — "지금 결정"은 호박색(`--urgent`) 전용, 나머지 분류는 무채색. 인용 칩이 없는 문장은 렌더하지 않는다
- `/docs/ARCHITECTURE.md` **§2 디렉토리** · **§6 불변식 2·3** · **§8**(`app/**/page.tsx`·`components/`·`route.ts`는 **TDD 비대상**)
- `/docs/PRD.md` **§8-1**(실시간 스트리밍 금지 — 폴링 10초)
- 이전 step 산출물: `requireMembership()`(step 10) · `lib/supabase/server.ts`(step 4) · `classifications` 저장 형식(step 9)

## 작업

### 1. `GET /api/d/[dept]/items?label=`

- `requireMembership()`으로 dept를 확정한다. URL 값을 그대로 믿지 마라.
- **세션 클라이언트**로 조회한다. RLS가 `leads_only` 소스의 항목을 알아서 걸러 준다 — 애플리케이션에서 visibility를 다시 필터링하지 마라 (ADR-024).
- `label` 쿼리로 필터(`decision|action|info|chatter|unclassified`). 없으면 전체.
- 응답에 항목별 `id`·`author`·`spoken_at`·`content`·`label`·`confidence`·`source.title`·`source.kind`를 담는다.
- 오늘의 입력 카운트(슬랙/회의/문서)도 같은 라우트나 별도 라우트로 낸다.

### 2. `app/(auth)/d/[dept]/page.tsx` — S1 대시보드

PRD §5 S1의 요소:
- 오늘의 입력 카운트 (슬랙 / 회의 / 문서)
- **분류별 탭**: 결정 필요 / 액션 / 정보 / 잡담 / **분류 대기**(`unclassified`)
- 항목 클릭 → 원문 보기 (슬랙 permalink가 있으면 링크, 없으면 상세 패널)
- **"카드로 승격" 버튼** — `confidence < 0.6`인 항목과 lead의 수동 승격 경로다 (PRD §2-4 `D2b`). 버튼은 `POST /api/d/[dept]/cards`를 부른다(step 13에서 구현한다. 이 step에서는 버튼과 호출부만 두고, 응답 404는 허용하지 않는다 — step 13 이전이라면 버튼을 `disabled`로 두고 주석에 사유를 남겨라)
- **회의 탭은 만들지 마라.** 컷 ④ 대상이고 회의 파이프라인은 task 2다 (PRD §8-2).

### 3. 폴링

10초 간격 폴링으로 갱신한다. **SSE·WebSocket을 쓰지 마라** (PRD §8-1). 탭이 백그라운드일 때는 폴링을 멈춰 비용을 아껴라.

### 4. 빈 상태 (PRD §6-10)

- 채널이 0개면: "슬랙 채널을 연결하면 시작됩니다" + 세팅 링크
- 채널은 있는데 항목이 0건이면: "수집 채널 N개에서 첫 메시지를 기다리는 중" + [세팅으로]

세팅 화면(S5)은 task 4라서 아직 없다. 링크는 걸되 목적지가 없으면 비활성으로 두고 주석에 사유를 남겨라. **"오류가 발생했습니다"만 있는 화면을 만들지 마라.**

### 5. 표현 규칙 (PRD §7)

- "결정 필요" 항목만 호박색(`--urgent`) 좌측 보더. **다른 분류에 `--urgent`를 쓰지 마라.**
- `confidence < 0.6`인 항목에는 "확인 필요" 배지.
- 금지 서사: "감시", "대체", "평가" — 카피에 넣지 마라.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
ls app/\(auth\)/d/\[dept\]/page.tsx >/dev/null || { echo "FAIL: S1 페이지 없음"; exit 1; }
ls app/api/d/\[dept\]/items/route.ts >/dev/null || { echo "FAIL: items 라우트 없음"; exit 1; }
# 요청 경로에서 service role 금지
grep -rn "supabase/service" app/api/d/ app/\(auth\)/ && { echo "FAIL: 요청 경로에서 service role"; exit 1; }
# 스트리밍 금지
grep -rniE "EventSource|text/event-stream|new WebSocket" app/ && { echo "FAIL: SSE/WebSocket 사용 (PRD 8-1 위반)"; exit 1; }
# urgent 토큰이 결정 필요 이외에 쓰이지 않는지 눈으로 확인할 대상 목록
grep -rn "urgent" app/ components/ || true
echo "OK: dashboard S1"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 조회가 세션 클라이언트로만 이뤄지는가? 애플리케이션에서 visibility를 재필터링하지 않는가? (ADR-024)
   - `dept_id`가 `requireMembership()`을 통과한 값인가?
   - 폴링 10초인가? SSE가 없는가? (PRD §8-1)
   - 빈 상태 두 가지가 다음 행동을 알려주는가? (PRD §6-10)
   - `--urgent`가 "결정 필요"에만 쓰였는가? (PRD §7)
   - 회의 탭을 만들지 않았는가? (컷 ④·task 2)
3. `phases/0-vertical-slice/index.json`의 step 11을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 만든 라우트·페이지 경로와 탭 목록
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- service role로 조회한 뒤 애플리케이션에서 visibility를 거르지 마라. 이유: 누락 한 줄이 유출이다 (ADR-024). RLS가 이미 거른다.
- SSE·WebSocket을 쓰지 마라. 이유: PRD §8-1에서 폴링으로 확정됐다.
- S1 회의 탭을 만들지 마라. 이유: 회의 파이프라인이 task 2고 이건 컷 ④ 대상이다.
- "N건 제외" 같은 문구를 어디에도 표시하지 마라. 이유: 숨긴 정보의 존재가 드러난다 (PRD §6-5 ②, ARCHITECTURE §6 불변식 5).
- `--urgent` 색을 "결정 필요" 외에 쓰지 마라. 이유: PRD §7 — 이 색이 의미를 잃으면 대시보드가 균일해진다.
- 카피에 "감시"·"대체"·"평가"를 쓰지 마라. 이유: PRD §7 금지 서사.
- 컴포넌트에 단위 테스트를 붙이지 마라. 이유: ARCHITECTURE §8 — 표현 계층은 Playwright의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
