# Step 4: supabase-clients

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` **§2 디렉토리**(`lib/supabase/{server,rls-client,service}.ts` 3종) · **§3.4 권한은 SQL에서 판정한다** · **§6 불변식 2·3·12** · **§8**(이 계층은 **TDD 비대상**이다 — SDK 어댑터라 테스트하면 SDK를 테스트하는 꼴이 된다)
- `/docs/PRD.md` **§6-9 권한 모델** — 특히 "service role (서버 내부)" 행의 "못 하는 것"
- `/docs/ADR.md` **ADR-024**(요청 경로에서 service role 금지)
- `/.env.example` — 변수 이름 3개
- 이전 step 산출물: `eslint.config.mjs`(step 0) — 여기에 import 제한 규칙을 추가한다

## 작업

### 1. 클라이언트 팩토리 3종

| 파일 | 용도 | 키 |
|---|---|---|
| `lib/supabase/server.ts` | 서버 컴포넌트·Route Handler에서 **사용자 세션**으로 조회 (`@supabase/ssr`의 쿠키 기반) | anon key |
| `lib/supabase/rls-client.ts` | 브라우저 클라이언트 컴포넌트에서 사용자 세션으로 조회 | anon key |
| `lib/supabase/service.ts` | 수집 어댑터 insert · 워커 내부 · 게스트 시드 **전용** | service role key |

전부 **함수로 만들어 호출 시점에 생성한다**. 모듈 최상위에서 `createClient(...)`를 실행하지 마라 — 이유: `.env.local`이 비어 있어도 `npm run build`가 통과해야 하는데, import 시점에 env를 읽으면 빌드가 죽는다. 키가 없으면 **호출될 때** 명확한 에러를 던진다(`SUPABASE_SERVICE_ROLE_KEY is not set`처럼 — 키 값 자체는 절대 로그에 넣지 마라).

`lib/supabase/service.ts` 파일 맨 위에 이 주석을 넣어라:

```
// service role 클라이언트. RLS를 통째로 우회한다.
// 허용: lib/adapters/* · lib/pipeline/* · lib/jobs.ts · app/api/jobs/* · scripts/*
// 금지: 사용자 요청 경로(대시보드·카드·원장·묻기·슬랙 Q&A) — 필터 누락 한 줄이 유출이다 (ADR-024)
```

### 2. import 제한을 ESLint로 집행한다

주석은 규칙이 아니다. `eslint.config.mjs`에 `no-restricted-imports`를 추가해 **기본적으로 `@/lib/supabase/service` import를 금지**하고, 아래 경로에서만 예외로 허용한다:

- `lib/adapters/**` · `lib/pipeline/**` · `lib/jobs.ts` · `lib/llm.ts`
- `app/api/jobs/**` · `app/api/slack/**` · `app/api/meetings/**` · `app/api/notion/**`
- `scripts/**` · `tests/**`

메시지는 구체적으로: `"요청 경로에서 service role 금지 (ADR-024). 웹은 lib/supabase/server.ts, 슬랙 경유는 search_as를 써라."`

이 규칙이 실제로 동작하는지 확인하는 방법: `app/` 아래 아무 파일에 임시로 import를 넣고 `npm run lint`가 에러를 내는지 본 뒤 되돌린다. 되돌리는 것을 잊지 마라.

### 3. 타입

DB 타입 자동 생성(`supabase gen types`)은 하지 마라 — 프로젝트 연결이 필요한 사람 작업이고 step 14 이전이다. 지금은 `any` 대신 최소한의 수동 타입이나 제네릭 없는 형태로 두고, 필요하면 step 14 이후에 생성한다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
# 3종이 존재하고 전부 함수 export 인가
for f in server rls-client service; do
  test -f lib/supabase/$f.ts || { echo "FAIL: lib/supabase/$f.ts 없음"; exit 1; }
done
# 모듈 최상위 즉시 생성 금지 — export const xxx = createClient( 패턴이 없어야 한다
grep -nE "^export const [A-Za-z]+ *= *create(Client|ServerClient|BrowserClient)\(" lib/supabase/*.ts \
  && { echo "FAIL: 모듈 로드 시점에 클라이언트를 만들고 있다"; exit 1; }
# ESLint 규칙이 등록됐는가
grep -q "no-restricted-imports" eslint.config.mjs || { echo "FAIL: service role import 제한 규칙 없음"; exit 1; }
grep -q "lib/supabase/service" eslint.config.mjs  || { echo "FAIL: 제한 대상이 service 가 아니다"; exit 1; }
echo "OK: supabase clients"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - ARCHITECTURE §6 불변식 2를 코드가 아니라 **린트가** 집행하는가?
   - 세 파일 모두 호출 시점 생성인가? (빌드가 env 없이 통과하는 것이 증거다)
   - `NEXT_PUBLIC_` 접두사가 URL·anon key 둘에만 붙었는가? service role key에 붙이지 않았는가?
   - 에러 메시지에 키 값이 들어가지 않는가?
3. `phases/0-vertical-slice/index.json`의 step 4를 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 export한 함수 이름 3개와 ESLint 규칙 요약
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- `SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 접두사를 붙이지 마라. 이유: 클라이언트 번들에 들어가 전부 샌다.
- 모듈 최상위에서 클라이언트를 생성하지 마라. 이유: env 없는 환경에서 `npm run build`가 죽는다.
- 사용자 요청 경로에서 쓰라고 service role 클라이언트를 export하지 마라. 이유: service role로 조회한 뒤 애플리케이션에서 필터링하는 코드는 누락 한 줄이 유출이다 (ADR-024).
- `supabase gen types`를 실행하지 마라. 이유: 프로젝트 연결이 필요하고, 여기서 막히면 뒤 step이 전부 멈춘다.
- 이 파일들에 테스트를 붙이지 마라. 이유: ARCHITECTURE §8 — SDK 어댑터는 TDD 비대상이고, 붙이면 SDK를 테스트하는 꼴이 된다.
- 기존 테스트를 깨뜨리지 마라.
