# Phase 23 · step 4-B7 부서 용어집

2026-09-29. 입력: PRD ACC-02, 상세 설계 §11.3, [설계 대조 목록](../../02-design/features/browser-meeting-recording.design.md), [step](../../../phases/23-browser-meeting-recording/step4b7-glossary.md).

- `0064_dept_glossaries.sql`은 동의한 부서 구성원에게만 RLS 읽기를 허용한다. 편집·삭제는 현재 세션의 동의한 부서장을 SQL에서 재검증하는 RPC만 허용한다. `dept_id`·`created_by`를 요청 본문에서 받지 않는다. 연락처 등 마스킹 대상 입력은 저장 전에 거절한다.
- `/d/[dept]/reviews/glossary`는 용어·읽는 법·설명·최근 수정순 예산을 보여 준다. 사람 이름·연락처를 넣지 말라는 안내를 표시한다. 음성 전사 워커와 문서 요약 워커가 현재 부서 용어를 읽는다. Whisper prompt는 UTF-8 바이트 상한 224로 보수적으로 고른다. 실제 모델 토큰 수를 재는 방식은 아니므로 사용 가능한 용어 수는 더 적을 수 있다.
- TDD: `tests/recording/glossary.test.ts`를 모듈 전에 실행해 실패 확인. 이후 용어 순서·중복·예산·요약 표기 테스트 통과. `tests/glossary-route.test.ts`는 member 쓰기 차단과 세션 부서 사용을 확인했다. `tests/pipeline/review-material.test.ts`는 전사 prompt 전달을 확인했다.
- `node scripts/verify-security-sql.mjs D:\\바이브코딩\\.sasu-qa-db`: 격리 PostgreSQL 280건 통과. 신규 사례는 팀장 저장·구성원 읽기·타 부서 0건·직접 쓰기 차단·중복/이메일 차단이다. `npx supabase migration up --local`로 0064를 로컬 Supabase에 적용했다. 운영 DB는 변경하지 않았다.
- UI의 사람 이름 금지는 안내 정책이다. 일반적인 사람 이름을 자동 식별·차단했다고 주장하지 않는다. 용어집 전후 실제 녹음 정확도도 아직 측정하지 않았다.

실행 흐름은 세션 화면 → `/api/d/[dept]/glossary` → 세션 클라이언트/RLS 또는 SQL 편집 RPC → `dept_glossaries`; 워커 → service role 읽기 → `glossaryPrompt` → `llm.transcribeAudio`/문서 요약이다. 현재 세션에서 Graft·Archify 실행 도구를 찾지 못해 수동으로 대조했다. 이전 [step2 Archify 흐름도](archify-step2/recording-flow.html)는 녹음/검증 경로만 담는다.
