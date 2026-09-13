# Step 10: review-fixes

사람 코드 리뷰(R1, 2026-09-13)에서 나온 수정이다. 운영 DB에는 아직 0016~0022가 **적용되지 않았으므로** 이 step은 해당 마이그레이션 파일을 직접 고친다(0001~0015는 여전히 수정 금지).

## 읽어야 할 파일

- `docs/pilot-consent.md` 전체 (2026-09-13 개정: 2번 목적 문구, 6번 Voyage AI 항목)
- `lib/consent.ts`, `lib/slack/blocks.ts`의 `consentBlocks`, `tests/` 아래 consent·blocks 테스트
- `supabase/migrations/0017_card_decision_boundaries.sql` (citations_owner_access의 answer 분기), `0012_answer_security.sql`(answers는 질문자 본인만 조회)
- `supabase/migrations/0020_remove_source.sql` (items_active_source_guard)
- `scripts/verify-security-sql.mjs`

## 작업

1. **동의문 동기화**: `docs/pilot-consent.md`의 개정 문구를 `CONSENT_SECTIONS`에 그대로 반영한다. 문서 대조 테스트가 **제목뿐 아니라 각 항목 본문·세부 문장까지** 문서와 일치하는지 검사하도록 강화한다.
2. **슬랙 동의 DM에 필수 고지 전문**: 개인정보 수집 동의는 목적·항목·보유기간·거부 권리·국외 이전을 동의 **전에** 알려야 한다. 지금 `consentBlocks`는 항목 제목만 보여주고 [동의합니다] 버튼을 붙인다. 각 항목의 본문과 세부 문장을 모두 section 블록으로 렌더한다(section text 3,000자 제한 — 넘으면 나눈다. 블록 총 50개 제한 안). [동의합니다] 버튼은 전문 **아래** actions 블록에 둔다. 테스트: 7개 항목의 본문·세부 문장이 모두 블록 텍스트에 포함, 버튼이 마지막 actions 블록에 있음, 섹션 3,000자 이하.
3. **답변 인용 읽기 정책**: 0017의 `citations_owner_access`에서 `owner_kind='answer'` 분기가 `can_see(auth.uid(), answer.dept_id, 'dept')`라 부서원이 **남의 답변 인용**을 읽는다. 0012에서 answers를 질문자 본인만 보게 한 경계와 어긋난다. `answer.asked_by = auth.uid()`로 좁힌다(기존 item/decision 가시성 조건은 유지). 게스트 demo 읽기 정책은 건드리지 않는다. SQL 검사 추가: member A가 member B의 답변 citations 0행, 본인 답변 citations는 보임.
4. **소스 활성 트리거 범위**: `items_active_source_guard`가 `before insert or update`라서, 제거된 소스 item의 후속 update(embed job·노션 소프트 삭제 등)가 `inactive_source`로 실패한다. `before insert`로만 바꾼다. `remove_source` 이후 embed job이 해당 item을 만나면 `deleted_at`을 보고 조용히 종료하는지 확인하고, 아니면 `lib/pipeline/embed.ts`에서 deleted item을 skip한다. 테스트: inactive 소스 insert 거부 유지, 제거된 item update 허용, embed handler가 deleted item skip.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
```

## 검증 절차

1. AC 실행. 2. 체크리스트(can_see 단일 판정 · 동의문 원천은 문서 · 로그 본문 금지). 3. index.json step 10 갱신.

## 금지사항

- 동의문 문구를 요약·창작하지 마라. 이유: 원천은 `docs/pilot-consent.md`.
- 0001~0015 마이그레이션을 수정하지 마라. 이유: 운영에 적용됐다.
- 운영 DB·슬랙에 쓰지 마라. 이유: 승인 노드.
