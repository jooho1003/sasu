# Step 1: notion-chunk

노션 블록 목록을 헤딩 단위 청크로 묶는 순수 모듈을 TDD로 만든다. 아직 어디에도 연결하지 않는다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-04), §6-10 "노션 페이지 100블록 초과" 행
- `/docs/planning/노션_전체수집_설계.md` §6
- `lib/notion.ts`(`NotionBlock`, `extractNotionText`), `lib/pipeline/notion-import.ts`(`toNotionItems` — 현행 블록 단위), `lib/mask.ts`
- `supabase/migrations/0034_reviewed_materials.sql`의 확정 청크(2,400자) 부분 — 같은 상한을 쓴다

## 작업

`tests/notion-chunk.test.ts`를 먼저 쓰고 `lib/notion-chunk.ts`를 구현한다.

```ts
export const NOTION_CHUNK_LIMIT = 2_400;
export type NotionChunk = { externalRef: string; content: string };
export function chunkNotionBlocks(args: {
  blocks: NotionBlock[];                 // 문서 순서. child_page/child_database는 들어오지 않는다(step 0)
  properties?: Record<string, unknown>;   // DB 행 속성(노션 page.properties 원형)
}): NotionChunk[];
export function notionPropertyLines(properties: Record<string, unknown>): string[];
```

규칙:

1. `heading_1`·`heading_2`·`heading_3`에서 새 청크를 시작한다. 헤딩 블록은 그 청크의 첫 줄이다.
2. 청크가 2,400자를 넘으면 블록 경계에서 나눈다. 단일 블록이 2,400자를 넘으면 문장 경계(`. `·`。`·줄바꿈·`다. ` 등)에서, 그래도 안 되면 길이로 자른다. **어떤 글자도 버리지 않는다.**
3. `externalRef` = 청크의 첫 블록 id. 단일 블록을 나눈 둘째 조각부터 `#2`, `#3` 접미. 한 호출 안에서 `externalRef`는 유일해야 한다.
4. 블록 사이는 줄바꿈 1개로 잇는다. 빈 텍스트 블록은 건너뛴다. 본문은 `mask()`를 통과한 뒤 `content`가 된다(마스킹 전 텍스트를 반환값에 남기지 않는다).
5. `properties`가 있으면 `notionPropertyLines`의 `속성: 값` 줄들을 첫 청크 맨 앞에 넣는다. 허용 타입: title, rich_text, select, multi_select, status, date, number, checkbox, url. **people·created_by·last_edited_by·email·phone_number·relation·rollup·formula·files는 넣지 않는다.**
6. 전체 본문(속성 줄 제외)이 40자 미만이면 빈 배열을 반환한다.
7. 같은 입력이면 항상 같은 출력(안정성). 청크 중간 블록의 내용만 바뀌면 그 청크의 `externalRef`는 변하지 않는다.

## 코드 관계와 구조 확인

새 모듈이라 호출자가 없다. `extractNotionText`·`mask`에 대한 의존만 `docs/verification/notion-collection/step1.md`에 기록한다.

## Acceptance Criteria

```bash
npx vitest run tests/notion-chunk.test.ts
npm run lint && npm run build && npm run test
```

테스트 케이스: 헤딩 경계, 상한 초과 분할, 단일 거대 블록 분할과 `#n`, 글자 보존(모든 청크를 이으면 마스킹된 원문 텍스트와 같음), `externalRef` 유일성·안정성, 속성 허용/금지 타입, 40자 미만, 이메일·전화번호가 마스킹되어 나옴.

## 검증 절차

AC 실행 → `index.json` step 1 갱신(`summary`에 export 이름과 상한 값).

## 금지사항

- LLM을 부르지 마라. 이유: 청크는 결정적이어야 하고 `llm.ts` 밖 호출은 금지다.
- `toNotionItems`를 고치거나 지우지 마라. 이유: 기존 소스(`import_version=1`)가 계속 쓴다.
- 사람 이름이 들어가는 속성을 넣지 마라. 이유: PRD §8 ADR-060 경계(작성자·사람 속성 미수집).
- 커밋하지 마라. 다른 세션의 파일을 건드리지 마라.
