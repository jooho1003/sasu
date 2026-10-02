# Step 5 — shared-card-transcript 검증 기록

- 실행일: 2026-10-02 KST
- 범위: 카드 조회·결정·회의 받아쓴 글 업로드의 공용 함수 추출. 운영 DB, 배포, 외부 발신, LLM 호출은 수행하지 않았다.

## 변경 내용

- `lib/card-view.ts`: 현재 세션의 `ActorContext` 부서에 한정해 카드·근거·충돌·자료 검토 메타를 읽는다. 원문에 포함되지 않은 인용은 기존과 같이 결과에서 제외한다.
- `lib/card-decide.ts`: 카드 부서 조회, 담당자·팀장 권한, 중복 결정 응답, `decide_request` 호출과 기존 오류 코드 변환을 공용 함수로 옮겼다.
- `lib/transcript-upload.ts`: 팀장·파일 형식/크기·데모·동의 화자 확인, 마스킹 수집 어댑터, 분류/임베딩/회의 요약 작업 등록 순서를 공용 함수로 옮겼다.
- 웹 카드 페이지와 두 Route Handler는 세션 멤버십을 `ActorContext`로 바꾸고 공용 함수를 호출하는 얇은 경로만 남겼다. 기존 HTTP 상태와 오류 본문, 전사 형식 오류의 `line`, 성공 응답을 유지했다.

## TDD 및 경계 확인

1. `tests/card-view.test.ts`는 원문에 없는 인용 제거와 다른 부서 카드 404를 확인한다.
2. `tests/card-decide.test.ts`는 `decide_request` 인자와 다른 부서 카드 404를 확인한다. 기존 `write-boundaries-route.test.ts`까지 함께 통과해 결정 연타의 기존 중복 결정 경계를 보존했다.
3. `tests/transcript-upload.test.ts`는 미동의 화자의 본문이 `insertUploadedItems()`로 전달되지 않음을 확인한다. 이 함수만 service role 수집 어댑터를 사용하며, 소스·회의 메타는 세션 클라이언트가 쓴다.
4. 카드 보기에서는 인용이 0개면 기존 화면의 `needs_review` 경고가 유지되고, 결정 기록은 기존 `decide_request` RPC의 append-only 경계를 그대로 사용한다.

## 의존 관계 확인

Graft 실행 파일은 PATH와 저장소 도구 검색에서 찾지 못했다. Docker는 로컬 Supabase 컨테이너만 보였고 Graft 컨테이너는 없었다. 따라서 Graft 결과로 표시하지 않고, `rg`와 `git show HEAD`로 다음 전후 관계를 직접 확인했다.

- 이전: 카드 페이지가 `decision_requests`·`citations`·`conflicts`·`items`·`decisions`·`reviewed_materials`를 직접 조회했고, 두 Route Handler가 결정 RPC와 전사 수집/작업 등록을 직접 소유했다.
- 이후: 카드 페이지 → `loadCardView()`; 결정 Route → `readCardDept()` → 멤버십 → `decideCard()`; 전사 Route → 멤버십 → `ingestTranscript()`.
- 공용 모듈은 `next/headers`·`next/navigation`을 import하지 않는다. `can_see()` 판정을 TypeScript에 복제하지 않았고 `insertUploadedItems()` 밖에 service role 호출을 추가하지 않았다.

## Acceptance Criteria

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/card-view.test.ts tests/card-decide.test.ts tests/transcript-upload.test.ts` | 3 files, 5 tests passed |
| 기존 카드·업로드·쓰기 경계 회귀 | 6 files, 26 tests passed |
| `npm run lint` | 성공. 기존 ESLint 경고 2개와 wording 비차단 경고만 출력 |
| `npm run build` | 성공. TypeScript와 Next.js production build 통과 |
| `npm run test` | 180 files, 1,823 tests passed |
| `node scripts/review-qa.mjs ui-regression` | 로컬 QA DB 시드·QA 환경 빌드 후 65 tests passed |
| `git diff --check` | 통과 |

UI 회귀는 로컬 QA 전용 `seed-demo`·`demo-auth`·`build`·`start` 순서로 실행했다. 첫 실행의 연결 거부와 일반 빌드의 운영 환경 참조는 테스트 준비 문제였고, 소스 변경 없이 로컬 QA 빌드/서버를 다시 띄운 뒤 통과했다.
