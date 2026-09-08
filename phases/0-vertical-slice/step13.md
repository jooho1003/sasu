# Step 13: card-web-ledger

## 읽어야 할 파일

- `/docs/PRD.md` **§5 S2 결정 카드** · **§5 S3 결정 원장** — 요소 목록이 명세다
- `/docs/PRD.md` **§6-3 ④⑤⑧⑨** — 웹에서 결정할 때의 동작과 **결정 멱등성**
- `/docs/PRD.md` **§6-4 LEDGER** — 원장 항목·직접 기록·충돌 배지·근거 클릭 시 원문 이동
- `/docs/PRD.md` **§6-8 API**(`POST /api/d/[dept]/cards` · `POST /api/cards/[id]/decide` · `GET /api/d/[dept]/ledger` · `POST /api/d/[dept]/decisions`)
- `/docs/PRD.md` **§6-12 상태 전이표** — 표 밖의 전이는 서버가 거부한다 · **§6-10 빈 상태** S2·S3 행
- `/docs/ARCHITECTURE.md` **§4.2 결정 한 건의 여정** · **§6 불변식 3·6·13·14** · **§8**
- `/docs/ADR.md` **ADR-023**(append-only, `supersedes_id`)
- `/docs/PRD.md` **§11 엣지·에러 행** — "결정 버튼 연타 → decisions 1건 + '이미 결정됨' 응답"
- 이전 step 산출물: `requireMembership()`(step 10) · `GET /api/d/[dept]/items`(step 11) · `decision_requests`·`citations`·`conflicts` 저장 형식(step 12)

## 작업

이 step은 **웹에서 결정이 완료되고 원장에 남는 지점**이다. D3 세로 슬라이스의 마지막 두 칸("웹에서 결정" → "원장")이 여기서 닫힌다.

### 1. `POST /api/d/[dept]/cards` — 수동 승격

step 11의 "카드로 승격" 버튼이 부른다. `origin_item_id`를 받아 `make_card` job을 enqueue하고 `kickWorker()`. `one_open_request_per_item`에 걸리면 기존 카드 id를 반환한다(에러가 아니다). lead 또는 해당 부서 member면 허용한다.

### 2. `app/(auth)/d/[dept]/cards/[id]/page.tsx` — S2 카드 상세

PRD §5 S2의 요소:
- "지금 결정" 배지(`--urgent`) · 마감(없으면 "마감 미정") · **마감 지남 배지**(PRD §6-3 ⑧)
- 배경
- **근거 인용** — 발언자·시각·출처. 클릭하면 원문(슬랙 permalink)으로 간다
- 충돌 경고 — `conflicts`가 있으면 과거 결정 인용과 함께
- 추천 방향
- **[결정] [보류] [반려]** + 사유 입력

**인용 칩이 없는 문장을 렌더하지 마라** (PRD §7·ARCHITECTURE §3.5). `needs_review` 카드는 인용이 없으므로, 본문 대신 "근거를 확인하지 못했습니다 — lead 검토 필요" 상태로 보여준다.

### 3. `POST /api/cards/[id]/decide`

이 라우트가 지켜야 할 것:

- `requireMembership()`으로 dept·role 확정. **`decided_by`를 요청 본문에서 읽지 마라** — 세션에서 온다 (ARCHITECTURE §6 불변식 3).
- **역할표 재검증**: 담당자 본인 또는 lead만 결정할 수 있다. 남의 카드를 member가 결정할 수 없다 (PRD §6-9 역할표).
- 상태 전이 검증: `open → decided|deferred|rejected`, `deferred|rejected → open`(lead), `needs_review → open|rejected`(lead). **표 밖의 전이는 서버가 거부한다** (PRD §6-12).
- `decisions` insert. `decided_by_name`은 **결정 당시 표시명 스냅샷**으로 함께 저장한다 (ADR-023).
- `lead_time_min` = `decision_requests.opened_at` → `decided_at` 분 단위.
- **멱등**: `decisions.request_id unique`에 걸리면 에러 화면이 아니라 **"이미 {이름}이(가) {시각}에 결정했습니다 → 원장 #N"**으로 응답한다 (PRD §6-3 ⑨). 더블클릭·동시 결정·재전송이 전부 이 경로를 탄다.
- 슬랙 스레드 공지는 **하지 마라** — task 1이다. (붙일 때 규칙은 "결과 한 줄 + 원장 링크만"이다. ARCHITECTURE §6 불변식 6)

### 4. `GET /api/d/[dept]/ledger` + `app/(auth)/d/[dept]/ledger/page.tsx` — S3 원장

- 목록: 최신순. 필터(상태·담당자·기간). 상태·담당자·**리드타임** 표시
- 상세: 누가·언제·왜(사유)·근거 링크. 근거 클릭 → 원문
- 충돌 배지: 해당 결정에 `conflicts`가 있으면
- 정정 이력이 있으면(`supersedes_id`) **최신 행만 기본 표시**하고 이력은 펼침 (ADR-023). 정정 UI는 만들지 마라 (PRD §8-0)
- 빈 상태: "첫 결정을 직접 기록해보세요" + [직접 기록]

### 5. `POST /api/d/[dept]/decisions` — 직접 기록

결과·사유 필수, 근거 선택. 근거 없는 직접 기록도 허용하되 **"근거 없음" 배지**를 붙인다 (PRD §6-4). `request_id`는 null이다.

### 6. 조회는 전부 세션 클라이언트

RLS가 `leads_only` 카드·인용을 걸러 준다. 애플리케이션에서 다시 필터링하지 마라.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
ls app/\(auth\)/d/\[dept\]/cards/\[id\]/page.tsx >/dev/null || { echo "FAIL: S2 없음"; exit 1; }
ls app/\(auth\)/d/\[dept\]/ledger/page.tsx >/dev/null      || { echo "FAIL: S3 없음"; exit 1; }
ls app/api/cards/\[id\]/decide/route.ts >/dev/null          || { echo "FAIL: decide 라우트 없음"; exit 1; }
ls app/api/d/\[dept\]/ledger/route.ts >/dev/null            || { echo "FAIL: ledger 라우트 없음"; exit 1; }
# decided_by 를 본문에서 읽지 않는가
grep -rnE "body\.(decided_by|decidedBy)" app/ && { echo "FAIL: decided_by 를 클라이언트가 정한다"; exit 1; }
# 요청 경로에서 service role 금지
grep -rn "supabase/service" app/api/cards/ app/api/d/ app/\(auth\)/ && { echo "FAIL: 요청 경로에서 service role"; exit 1; }
# 멱등 응답 문구가 있는가
grep -rq "이미" app/api/cards/\[id\]/decide/route.ts || { echo "FAIL: 중복 결정 안내 응답 없음"; exit 1; }
echo "OK: S2 + S3"
```

PRD §11 "엣지·에러" 행: **결정 버튼 연타 → `decisions` 1건 + "이미 결정됨" 응답.** 실제 DB 대상 검증은 step 14/15에서 하고, 여기서는 멱등 경로가 코드에 있는지 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `decided_by`가 세션에서만 오는가? (불변식 3)
   - 역할표를 서버에서 재검증하는가? 버튼 숨김에 의존하지 않는가? (PRD §6-9)
   - 상태 전이표 밖의 전이를 서버가 거부하는가? (§6-12)
   - 중복 결정이 에러가 아니라 안내 응답으로 처리되는가? (§6-3 ⑨)
   - `decisions`에 update·delete 경로가 없는가? (ADR-023 append-only)
   - 인용 칩 없는 문장을 렌더하지 않는가?
   - 슬랙 공지를 붙이지 않았는가? (task 1)
3. `phases/0-vertical-slice/index.json`의 step 13을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 만든 라우트·페이지 경로와 결정 멱등 처리 방식
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- `decisions`에 update·delete 경로를 만들지 마라. 이유: ADR-023 — 결정은 append-only이고 정정은 `supersedes_id` 새 행이다.
- 중복 결정을 500이나 "오류가 발생했습니다"로 처리하지 마라. 이유: PRD §6-3 ⑨ — "이미 {이름}이 {시각}에 결정 → 원장 #N"이 정해진 응답이다.
- 상태 전이표 밖의 전이를 허용하지 마라. 이유: PRD §6-12 — 표 밖의 전이는 서버가 거부한다.
- 슬랙 스레드 공지·DM을 붙이지 마라. 이유: task 1의 범위다. 붙일 때도 스레드에는 결과 한 줄 + 원장 링크만 쓴다 (불변식 6).
- 결정 정정 UI를 만들지 마라. 이유: PRD §8-0에서 제외됐다. 스키마만 있다.
- `decision_metrics` 뷰를 만들지 마라. 이유: PRD §8-0. `lead_time_min`을 insert 시 계산해 넣는다.
- 요청 경로에서 service role을 쓰지 마라. 이유: ADR-024.
- 기존 테스트를 깨뜨리지 마라.
