# 남은 step 개발·검증 — 2026-09-20

사용자가 phase 27 제안값 7개, phase 30 제안값 10개, phase 31 제안값 8개를 확정하고 남은 개발·커밋·머지를 요청했다. 기존 스냅샷 `b9c12dd`에서 구현과 완료 표시를 재검토하고 아래 변경을 적용했다. 운영 배포·원격 push·운영 DB migration·실제 Slack 발신은 이번 작업에 포함하지 않았다.

구현 커밋: `aa31f85`. [기계 판독 결과](remaining-steps-2026-09-20/results.json) · [TDD 가드 실행](remaining-steps-2026-09-20/tdd-guard.txt) · [비밀값 검사](remaining-steps-2026-09-20/secret-scan.json).

## 구현 결과

- **회고:** 본인 공개 기본값, 파일 업로드·Chrome 기본 off/검색어 별도 동의, 근거 검토·편집·확정·Markdown 내보내기·본인 삭제를 유지했다. 연결 ID를 포함하는 활동 응답 스키마 오류와 모델 한도 오류의 상태 저장을 고쳤다.
- **부서별 회고 연결:** 17개 제공자, 8개 형식, 본인 활동 판정·API 응답 필드 제한·OAuth·암호화·토큰 갱신·수집 임대·재시도·공개 동의/철회·해제 삭제를 구현했다. 원티드·스티비는 승인된 팀장 부서 요약 예외만 사용한다. 부서 소식은 별도 표시하고 개인 인용에서 제외한다. 새 초안에는 부서 형식을 주제로 넣으며 과거 주제를 자동 수정하지 않는다.
- **쉬운말 UI:** 이름표 단일화, 205개 파일의 문구 검사, 모바일 첫 카드, 정확한 단건 원문, 출처별 근거 검색·선택, 핵심·관리자·공개 화면, 공통 LLM 지시·Slack 문구를 정리했다. 법률 본문과 동의 전문은 유지했다.
- **지원자 링크:** 이전 스냅샷의 지원자 페이지·동의·제출/채점·철회/파기·게스트 구현을 회귀 검사하고 step 3–6 상태를 실행 기록과 맞췄다.

## 검사와 재현

로컬 QA는 `.vercel/review-qa`의 Supabase와 `http://localhost:3011`의 Next 프로덕션 빌드를 사용했다. 운영 키를 인수로 넘기지 않으며 하니스가 loopback 대상을 검사한다. PGlite는 파일·환경변수·외부 DB를 읽지 않는 격리 DB다.

| 명령 | 실제 결과 | 기록 |
|---|---|---|
| `npm run lint` | ESLint 오류 0, 문구 차단 0·검토 경고 77 | [lint](remaining-steps-2026-09-20/lint.txt) |
| `node scripts/review-qa.mjs build` | 타입 검사 포함 Next 프로덕션 빌드 통과 | [build](remaining-steps-2026-09-20/build.txt) |
| `npm run test` | 133개 파일·1,319개 테스트 통과 | [unit](remaining-steps-2026-09-20/unit.txt) |
| `node scripts/verify-security-sql.mjs <PGlite 설치 폴더>` | 236개 통과, 4조직·12부서·24actor·72항목의 권한 조합 2,016건 통과 | [SQL](remaining-steps-2026-09-20/sql.txt) |
| `node scripts/review-qa.mjs ui-regression` | 63개 통과 | [UI](remaining-steps-2026-09-20/ui.txt) |
| `node scripts/review-qa.mjs trailer-regression` | 14개 통과·3개 skipped | [예고편](remaining-steps-2026-09-20/trailer.txt) |
| `node scripts/review-qa.mjs plain-language-test` | 4개 통과, 19화면 × 2크기·원문 RLS·근거 선택 | [최종 화면](remaining-steps-2026-09-20/plain-language.txt) |
| `node scripts/review-qa.mjs connector-test` | 1개 통과, 2부서 × 3일·주제 필터·확정/철회/해제 | [최종 회고](remaining-steps-2026-09-20/connectors.txt) |
| `node scripts/review-qa.mjs rls-test` | 로컬 Supabase 6개 통과 | [RLS](remaining-steps-2026-09-20/rls.txt) |
| `node scripts/review-qa.mjs access-test` | 실제 로컬 Storage 8개·동시 접근 61건 경계 통과, LLM 0회 | [Storage](remaining-steps-2026-09-20/storage.txt) |
| `npm run e2e:review-controls` | 모의 API 컴포넌트 브라우저 8개 통과. 실제 Storage 검사와 구분 | [접근 UI](remaining-steps-2026-09-20/access-ui.txt) |
| `npm run check:demo-release` | 통과 | [데모](remaining-steps-2026-09-20/demo-release.txt) |

전체 UI 회귀 뒤 새 제공자·부서 표시 변경을 반영한 프로덕션 빌드로 회고·쉬운말 E2E를 추가 실행했다. 마지막 주제 연결 변경은 워커 단위와 회고 주제 필터 E2E로 확인했다. SQL의 `0004_worker_cron.sql`은 PGlite에 pg_cron/pg_net이 없어 제외했다. CI/운영 스케줄 실제 실행을 통과로 계산하지 않는다.

새 `lib/` 모듈은 테스트를 먼저 작성했다. 제공자 테스트를 `tests/retro/connectors/`로 정리해 TDD 가드의 파일 미러 규칙과 맞췄다. [실패→수정 기록](remaining-steps-2026-09-20/red-green.txt)은 상태 응답 스키마, 사용 한도 상태 보존, 부서 주제와 신규 제공자 테스트의 실행 이력을 담는다. 스냅샷 테스트만으로 실제 외부 연동이 검증됐다고 보지 않는다.

## 완료하지 못한 step

| phase·step | 남은 조건 |
|---|---|
| 0·15 | 사람의 5분 세로 흐름 확인 |
| 14·1 | 실제 Slack 질문·인용 캡처와 운영 반영 |
| 23·4-A/0, 후속 1/2/4-B/3 | 자료 보호의 운영 확인, 실제 마이크·Meet·Zoom·복구 검증이 남음. 명세상 step 1은 step 0 실제 통과 뒤 수행. 합성 입력을 실기기 증거로 바꾸지 않음 |
| 25·8 | Notion OAuth 앱·credential·웹훅 실측 |
| 26·7 | 법률 확인·조직 개시·운영 승인 |
| 27·7 | 제출 이후 운영 반영 승인. 기존 [실제 로컬 회고 생성 기록](daily-retro-2026-09-19/live-results.json)은 보존 |
| 30·4/5/6 | 채널톡·Greenhouse·Lever 개인 인증 경계, Workable 파트너 사용자 계약, Meta 앱 권한. [제공자별 근거·재개 조건](retro-connectors-2026-09-19/setup-and-api-evidence.md) |
| 30·7 | 제공자 sandbox 실측, 실제 모델로 개발·기획 초안 생성, 사람 파일럿. 현재 2부서 흐름은 **수동 검토 저장**이며 AI 생성 성공 0회 |
| 30·8 | VoIP 법률 자문 |
| 31·6/7 | Groq 사용 한도 복구 후 11개 실제 문체 표본, 비개발자 읽기, 쇼케이스 정리 판단, 운영 반영 |

Groq는 실제 호출에 `spend_limit_reached`를 반환했다. 결제나 사용 한도를 바꾸지 않았고 성공한 문체 표본은 0개다. 쇼케이스 SELECT 감사에서 기존 QA 표식이 발견되었지만 운영 자료나 append-only 결정을 삭제하지 않았다. 자세한 결과는 [외부 조건 기록](plain-language-audit-2026-09-19/external-gates.md)에 있다.

Graft·Archify 호출 도구가 없어 실제 자동 분석·시각화 출력은 없다. [커넥터 수동 검토](retro-connectors-2026-09-19/dependency-review.md)와 [UI 수동 검토](plain-language-audit-2026-09-19/dependency-review.md)에 파일·관계와 누락 범위를 남겼다. 이러한 외부·사람 조건을 충족하지 않은 phase 전체를 완료로 표시하지 않았다.

Vercel CLI 미설치 상태다. 후속 환경변수·배포·로그 작업에는 `npm i -g vercel` 설치를 권장한다.
