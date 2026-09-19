# Step 1: retro-contracts-lib

회고의 Zod 계약과 순수 로직(번들 검증·인용 검증·Markdown·로컬 소스 파서 6종)을 **테스트 먼저** 만든다. 파일 I/O·SQLite·네트워크는 이 step에 없다(step 2 배선).

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-02·03·04·08) · `/docs/ARCHITECTURE.md` §3.5·§3.6·§8(TDD 표)·§6-4 불변식 23·25
- `docs/planning/개발_회고_자동화_설계.md` §2(소스 표)·§3·§5·§7·§8 — 계약·파서 명세
- `lib/contracts.ts` — `Citation`·`CardDraft`·`ReviewCreate`·`toStrictJsonSchema`. strict 규칙: 모든 필드 required, nullable은 union
- `lib/pipeline/card.ts:165-185` `verifyCitations` · `lib/pipeline/document-summary.ts:24-66` `verifyDocumentSummary` — 인용 검증 원형
- `lib/pipeline/meeting-summary.ts` `chunkMeetingItems`·`mergeMeetingSummaries` — 청크·병합 원형
- `lib/mask.ts` — `mask()`
- `scripts/hooks/tdd-guard.sh` — `lib/` 신규 파일은 `tests/<path>/<name>.test.ts`가 먼저 있어야 편집된다

## 작업

### 1. 계약 (`lib/contracts.ts`)

설계 §3·§5의 `RetroActivityKind`·`RetroActivity`·`RetroBundle`·`RetroCitation`·`RetroItem`·`RetroBody`·`RetroDraft`를 추가한다. 추가로 서버 행 타입 `RetroDayRow`·`RetroActivityRow`·`RetroRevisionRow`, 편집 입력 `RetroEdit { revision, title(≤60), body: RetroBody, topics(≤5) }`. `toStrictJsonSchema("retro_draft_response", RetroDraft)`가 `additionalProperties:false`·전 필드 required로 나오는지 테스트.

### 2. `lib/retro/bundle.ts`

- `parseRetroBundle(json: unknown): { ok: true; bundle } | { ok: false; code }` — Zod + 추가 규칙: `sasu_*` kind 거부(`server_only_kind`), 직렬화 크기 1MB(`bundle_too_large`), `(kind, ref)` 중복(`duplicate_ref`), `date`가 오늘±7일 밖(`date_out_of_range`).
- `normalizeActivity(a)` — `title`·`text`에 `mask()`, 공백 정리, 500/200자 절단.

### 3. `lib/retro/verify.ts`

`verifyRetroDraft(draft: RetroDraft, activities: {id, title, text, excluded}[]) : { body: RetroBody; title; highlight; topics; dropped: number; valid: boolean }` — 설계 §5 규칙. `highlight`는 본문에 남은 항목의 인용 중 하나와 같은 `activity_id`를 공유해야 유지. 항목 0개면 `valid=false`.

### 4. `lib/retro/chunk.ts`

`chunkRetroActivities(activities, limit=120)` (kind별 정렬 후 시각순) · `mergeRetroDrafts(parts: RetroDraft[]): RetroDraft`(섹션 concat, topics 빈도순 상위 5, title은 첫 부분, highlight는 첫 non-null).

### 5. `lib/retro/export.ts`

`retroMarkdown(day, revision, activities): string` — 제목·날짜·작성자·하이라이트·4섹션. 인용은 각주 `[^A12]: git_commit · feat(...) · 14:02`. `web_visit`는 도메인만, URL 경로·`text` 미포함.

### 6. 파서 `lib/retro/collect/*.ts` (전부 순수: 입력은 문자열/행 배열, 출력은 `RetroActivity[]`)

| 파일 | 입력 | 규칙 |
|---|---|---|
| `git.ts` | `git log --since=<date 00:00> --until=<date+1 00:00> --author=<email> --format='%H%x1f%aI%x1f%s' --shortstat` 출력 문자열 | `kind='git_commit', ref=hash, title=subject(200), text='', meta={files, insertions, deletions, repo}` |
| `claude.ts` | `history.jsonl` 줄 배열 + 세션 jsonl 줄 배열(선택) | history: `display`의 첫 줄 200자 → `claude_prompt`(ref=`${sessionId}:${timestamp}`), `[Pasted text` 토큰은 제거. 세션 파일: `type==='ai-title'` 레코드만 → `claude_session`(ref=sessionId, title=aiTitle). `type==='assistant'`·`toolUseResult`·`attachment`·`pastedContents`는 **읽지 않는다**(테스트로 증명: 그 필드가 있어도 출력에 문자열이 없다) |
| `codex.ts` | rollout jsonl 줄 배열 | 첫 사용자 입력 첫 줄 200자 → `codex_session`(ref=파일명의 uuid) |
| `memory.ts` | `{path, mtime, content}[]` | 당일 mtime만, frontmatter `name`·`description` → `memory_change`(ref=파일명, title=name, text=description) |
| `docs.ts` | `git diff --stat <since>..HEAD -- docs CLAUDE.md AGENTS.md .claude` 출력 + `docs/ADR.md` 헤딩 목록 전/후 | `doc_change`(ref=파일 경로, title=경로, meta={insertions, deletions}) · 새 `### ADR-0NN:` 헤딩 → `doc_change`(ref=`adr:NNN`, title=헤딩) |
| `chrome.ts` | `{url, title, visit_time, visit_count}[]` + `keyword_search_terms[]` + 설정 | WebKit 마이크로초 → ISO, 당일 필터, `new URL(url)` → `origin+pathname`(쿼리·fragment 제거), denylist/allowlist(`chrome-denylist.ts` 기본 목록: 메일·은행·카드·메신저·SNS·성인·의료·localhost·127.0.0.1·chrome://), 같은 정규화 URL은 1건(`meta.visits` 합산), `web_visit`(ref=정규화 URL, title=제목 200, meta={domain, visits}). 검색어는 `search_terms=true`일 때만 `web_search`(ref=`q:${term}`) |

각 파서의 테스트 픽스처는 `tests/fixtures/retro/`에 **합성** 데이터로 둔다(이 PC의 실제 로그를 복사하지 마라). Chrome 테스트에 `?token=…`·`#frag`가 출력에 0건인지, 은행 도메인이 걸러지는지 포함.

## Acceptance Criteria

```bash
npm run test -- tests/lib/retro tests/lib/contracts.retro.test.ts   # 전부 통과
npm run lint && npx tsc --noEmit
```

## 금지사항

- 테스트 없이 `lib/retro/*` 구현 파일을 만들지 마라. 이유: ARCHITECTURE §8 TDD — 훅이 막는다.
- 파서에 `fs`·`child_process`·SQLite 의존을 넣지 마라. 이유: 순수 함수여야 테스트·재사용이 된다(배선은 step 2).
- `assistant`·`toolUseResult`·`pastedContents`·diff 본문을 파싱하지 마라. 이유: 불변식 23·ADR-063 6항.
- 테스트 픽스처에 실제 세션 로그·히스토리·브라우저 기록을 넣지 마라. 이유: 리포는 공개 가능해야 한다(불변식 9).
