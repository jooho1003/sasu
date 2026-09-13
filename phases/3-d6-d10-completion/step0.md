# Step 0: transcript-line-errors

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §2 디렉토리 · §3 패턴 · §6 불변식 · §8 테스트 경계
- `/docs/PRD.md` §6-2 WATCH "회의" 항목(파싱 실패 시 줄 번호), §6-10 엣지 케이스 표, §8-2 "D6 판정 기록"
- `/docs/ADR.md` ADR-036 (회의 입력은 전사 업로드가 유일한 경로)
- `lib/adapters/transcript.ts`, `tests/transcript.test.ts`
- `app/api/d/[dept]/meetings/transcript/route.ts`
- 전사 업로드 UI: `components/settings-s5.tsx`의 회의 섹션

## 작업

PRD §11 WATCH 행: "형식이 잘못된 .vtt 업로드 → 줄 번호가 담긴 에러". 지금 파서는 `unsupported_transcript_format` 하나만 던진다.

1. `lib/adapters/transcript.ts`
   - `export class TranscriptParseError extends Error { code: "invalid_vtt_header" | "invalid_timestamp" | "empty_cue" | "no_speech" | "unsupported_transcript_format"; line: number | null }`
   - `.vtt`: `WEBVTT` 헤더 누락 → `invalid_vtt_header`(line 1). 큐 타이밍 줄 `HH:MM:SS.mmm --> HH:MM:SS.mmm`(시 생략 `MM:SS.mmm` 허용)이 깨졌으면 `invalid_timestamp` + 해당 1-based 줄 번호. 타이밍 뒤 본문 없음은 skip(에러 아님). 유효 발언 0건 → `no_speech`.
   - `.txt`: 기존 규칙 유지, 유효 발언 0건이면 `no_speech`.
   - 줄 번호는 원본 파일 기준(BOM·CRLF 정규화 후에도 줄 수는 보존).
2. 라우트: `TranscriptParseError`를 잡아 `422 { error: code, line, message }`. `message`는 한국어 한 문장 — 예: `"12번째 줄의 시간 형식을 읽을 수 없습니다. 파일을 확인한 뒤 다시 올려주세요."`. 다른 예외는 기존 처리 유지.
3. S5 업로드 UI: 422 응답의 `message`를 그대로 보여준다(재업로드 가능 상태 유지).
4. 테스트(`tests/transcript.test.ts`에 추가, 구현보다 먼저): 헤더 누락, 7번째 줄 타이밍 오류 → `line === 7`, CRLF 파일 줄 번호, 발언 0건, 정상 파일 회귀.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트: ARCHITECTURE.md §2 구조 · 새 로직에 `tests/` 미러 테스트 · CLAUDE.md CRITICAL 규칙(로그에 전사 원문 출력 금지 포함).
3. `phases/3-d6-d10-completion/index.json` step 0 갱신: 성공 → `completed` + summary / 3회 실패 → `error` + error_message / 사용자 개입 필요 → `blocked` + blocked_reason.

## 금지사항

- 에러 메시지·로그에 전사 본문 줄 내용을 넣지 마라. 이유: CLAUDE.md — 로그에 전사 원문 금지(줄 번호·코드만).
- 미동의 화자 skip 로직을 건드리지 마라. 이유: 미동의 발언 미저장은 CRITICAL 불변식.
- Recall.ai·봇 웹훅 코드를 추가하지 마라. 이유: ADR-036으로 컷.
- 기존 테스트를 깨뜨리지 마라.
