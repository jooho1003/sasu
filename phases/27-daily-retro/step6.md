# Step 6: retro-demo-export

게스트 데모 회고와 Markdown 내보내기 UI를 붙인다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-06·08) · §8 "ADR-061 공개 체험 경계" · `/docs/ARCHITECTURE.md` §4.5·§6 불변식 12·§6-4 불변식 24
- `docs/planning/개발_회고_자동화_설계.md` §6(데모)·§8(1단계)
- `scripts/seed-demo.ts` — 데모 org truncate 후 재생성, 멱등 · `supabase/migrations/0036_demo_reviewer_read_only.sql` — anon 읽기 경계
- `app/demo/page.tsx`·`app/demo/features/page.tsx`·`components/demo-notion-collection.tsx` — 게스트 라우트 관행(LLM 0·쓰기 0·React 메모리 조작)
- `components/retro-timeline.tsx`·`retro-detail.tsx` (step 5)

## 작업

1. `scripts/seed-demo.ts`: 데모 부서 2곳에 합성 회고 5일 × 2명(`visibility='dept'`, `status='confirmed'`, 활동 8~15건/일, 종류는 `git_commit`·`claude_prompt`·`memory_change`·`doc_change`·`sasu_decision`·`web_visit`(합성 도메인 `example.com`류) 섞기, revision `draft→confirm`). 시드는 service role로 직접 insert(RPC는 데모 조직을 거부하므로) — `scripts/`는 허용 범위.
2. `app/demo/retros/page.tsx` + `components/demo-retro.tsx`: anon 클라이언트로 데모 회고 읽기 → 타임라인·상세를 같은 컴포넌트로 렌더(props로 `readOnly`). [오늘 회고 만들기]·[확정]·[삭제]·공개 범위는 비활성 + "체험판에서는 만들 수 없어요" 툴팁. 제외 토글·필터는 React 메모리에서만.
3. `app/demo/features/page.tsx` 기능 지도에 "회고" 항목 추가. 게스트 내비에 "회고".
4. 내보내기 UI(로그인 화면): [내보내기 ▾] → "Markdown 복사"(클립보드, `retroMarkdown` 결과를 GET export로 받아서) · "Markdown 다운로드"(GET export) · "노션 페이지 만들기 — 준비 중"(비활성, 2단계) · "공개 링크 — 준비 중"(3단계). 데모에서는 복사만 허용(서버 기록 없음 — 클라이언트에서 `retroMarkdown` 직접 호출).
5. E2E `tests/e2e/demo-retros.spec.ts`: 시크릿 창 `/demo/retros` 완주 + 네트워크에 `/api/jobs`·Groq 호출 0 + POST/PATCH 0 + 페이지 본문에 실데이터 grep 0(기존 데모 E2E 관행).

## Acceptance Criteria

```bash
npx tsx scripts/seed-demo.ts          # 멱등: 2회 실행 후 retro_days 데모 행 수 동일
npx playwright test tests/e2e/demo-retros.spec.ts
npm run lint && npx tsc --noEmit && npm run build
```

## 금지사항

- 데모 라우트에서 LLM·`kickWorker`·쓰기 라우트를 부르지 마라. 이유: ADR-061·불변식 12.
- 데모 시드에 `visibility='self'` 회고를 넣지 마라. 이유: anon 정책은 `is_demo_department`만 보므로 `self`가 노출된다(불변식 24).
- 시드 활동에 실제 도메인·실제 커밋 제목·우리 팀 이름을 넣지 마라. 이유: 게스트 실데이터 0건.
- 노션·공개 링크 버튼을 동작하게 만들지 마라. 이유: phase 28·29.
