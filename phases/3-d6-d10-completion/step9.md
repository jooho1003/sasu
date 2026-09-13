# Step 9: local-verification

## 읽어야 할 파일

- `/docs/PRD.md` §11 완료 판정 표 전체, §8-2 D6 판정 기록
- `phases/3-d6-d10-completion/index.json`(이전 step summary)
- `docs/verification/D6-production-deploy.md`(기존 기록 형식), `docs/verification/D6-merge-similarity.md`
- `playwright.config.ts`, `tests/e2e/*.spec.ts`

## 작업

코드를 고치는 step이 아니다. 전체 로컬 검증을 실행하고 **실행 기록**을 남긴다.

1. 실행하고 출력 요약(통과/실패 수, 소요)을 수집:
   - `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`
   - `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"`
   - `npm run e2e -- tests/e2e/guest.spec.ts` (로컬 실행이 불가능하면 이유)
   - 클라이언트 번들 비밀값 검사: `.env`의 `SUPABASE_SERVICE_ROLE_KEY`·`GROQ_API_KEY`·`SLACK_BOT_TOKEN`·`VOYAGE_API_KEY`·`NOTION_TOKEN` 각 앞 8자를 `.next/static`에서 검색 → 0건. **키 값 자체를 문서·출력에 쓰지 마라** — "키 이름: 0건"만.
2. `docs/verification/D10-completion.md` 작성:
   - 표: 명령 | 결과 | 비고
   - PRD §11 행별: 이번 phase로 로컬에서 판정 가능한 것(병합 단위·SQL, 충돌 배지, 채널 제거, ask 상한, 동의 흐름, 전사 줄 번호)과 **운영에서만 판정 가능한 것**(실제 슬랙 E2E, 운영 lead/member 답변 차이, 시크릿 창 `/demo`)을 구분. 운영 항목은 "미실행 — 운영 반영 노드 O1~O6"으로 적는다.
   - 새 마이그레이션 목록(0016~)과 운영 적용 순서: DB 마이그레이션 → 결정 임베딩 백필 → 앱 배포 → 게스트 시드.
3. 실패가 있으면 고치지 말고 기록한 뒤 step을 `error`로 닫는다(원인 step 번호 추정 포함).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

`docs/verification/D10-completion.md`가 존재하고 위 결과가 기록돼 있다.

## 검증 절차

1. AC 실행. 2. 문서에 비밀값·실데이터 문자열이 없는지 확인. 3. index.json step 9 갱신(summary에 통과 수 요약).

## 금지사항

- 운영 DB·Vercel·슬랙에 어떤 쓰기도 하지 마라. 이유: 승인 노드.
- 실패한 테스트를 skip·삭제하거나 기대값을 결과에 맞추지 마라. 이유: 완료 판정은 실행 기록이다.
