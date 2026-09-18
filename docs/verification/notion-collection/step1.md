# Phase 25 · Step 1 검증 기록 — notion-chunk

## 변경 파일

- `tests/notion-chunk.test.ts` — 헤딩 경계, 2,400자 상한·단일 거대 블록 분할, 글자 보존, `externalRef` 안정성·유일성, 허용·금지 속성, 40자 최소 본문, PII 마스킹을 먼저 검증했다.
- `lib/notion-chunk.ts` — `NOTION_CHUNK_LIMIT`, `NotionChunk`, `chunkNotionBlocks`, `notionPropertyLines`를 추가했다. 블록 텍스트는 `extractNotionText`로 읽고 반환 전 `mask()`를 적용한다.
- `phases/25-notion-collection/index.json` — Step 1 완료 상태와 요약을 갱신했다.

`lib/notion.ts` 및 `lib/pipeline/notion-import.ts`는 수정하지 않았다.

## 코드 관계·구조 확인

- 새 모듈은 `lib/notion.ts`의 `NotionBlock`·`extractNotionText`와 `lib/mask.ts`의 `mask`에만 의존한다. 아직 호출자는 없으며 Step 3의 import-v2가 연결 지점이다.
- Graft·Archify는 PATH에 없어 실행하지 못했다. 순수 변환 모듈 추가만으로 서비스 구조·실행 흐름 변경은 없으므로 구조도는 만들지 않았다. 위 실제 파일 읽기와 `rg` 검색으로 의존 범위를 확인했다.

## 실행 명령과 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/notion-chunk.test.ts` | 성공 — 1 파일, 6 테스트 통과 |
| `npm run lint` | 성공 |
| `npm run build` | 성공 — Next.js 프로덕션 빌드 및 TypeScript 검사 통과 |
| `npm run test` | 성공 — 95 파일, 1,118 테스트 통과 |

Vitest는 Vite 설정의 향후 `configLoader: 'native'` 전환과 `vite-tsconfig-paths` 중복에 관한 기존 경고를 출력했으나, 실패는 없었다.

## 미실행 항목

- 없음. 이 Step은 순수 모듈이라 운영 DB·배포·실제 Notion 워크스페이스 호출 대상이 없으며, 해당 외부 작업을 수행하지 않았다.

## 오케스트레이터 리뷰 (2026-09-18, Claude)

- 결함 수정: 마스킹을 청크를 자른 **뒤**에 적용하고 있어, 길이로 잘리는 경계에 걸친 이메일·전화번호가 패턴에 잡히지 않고 두 청크에 나뉘어 저장될 수 있었다(`items.content`는 마스킹 후만 저장 — CRITICAL). 블록 텍스트를 먼저 마스킹한 뒤 자르도록 바꾸고, 속성 줄도 따로 마스킹한다.
- 40자 분량 판정은 마스킹 전 길이로 한다(치환 토큰이 원문보다 짧아 판정이 흔들리는 것 방지). 마스킹 전 텍스트는 반환값에 남지 않는다.
- 회귀 테스트 추가: "청크 경계에 걸친 이메일도 마스킹되어 어느 청크에도 원문이 남지 않는다".
- 재실행: `npx vitest run tests/notion-chunk.test.ts` → 7 passed. `tsc --noEmit`·`eslint`(변경 파일) 출력 없음.
- 남긴 판단: 본문 없이 속성만 있는 DB 행은 item을 만들지 않는다(설계 §6). 업무 DB(작업 목록 등)에서 정보가 빠질 수 있어 step 4 실측 뒤 다시 본다.

