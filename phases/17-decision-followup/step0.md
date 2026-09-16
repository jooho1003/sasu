# Step 0: decision-correction

## 읽어야 할 파일
- docs/PRD.md §3·§6·§8·§11
- docs/ARCHITECTURE.md §1 후속 개발·§3·§6·§8
- docs/ADR.md ADR-052
- phases/17-decision-followup/index.json
- 이전 step의 summary에 기록된 구현·테스트 파일

## 작업
세션과 SQL 권한으로 최신 결정에 append-only 정정을 작성하고 원장 이력을 제공한다.

공통 계약은 lib/contracts.ts, 텍스트 LLM은 llm.structured(), 가시성 판정은 SQL can_see()를 사용한다. 세션의 사용자/부서 권한을 재검증하며 미동의 원문·비밀값·원문 로그를 남기지 않는다. 새로운 lib 모듈은 실패 테스트를 먼저 실행한다.

## Acceptance Criteria
```powershell
npm run lint
npm run build
npm run test
node scripts/verify-security-sql.mjs <PGlite 설치 경로>
```
마지막 검증 step은 로컬 Playwright UI/보안 회귀를 실행하고 docs/verification/에 명령·결과를 기록한다. 실제 외부 서비스 실행 여부를 구분한다.

## 완료 기록
해당 index.json의 status와 summary를 실제 실행 기록에 따라 갱신한다. 운영 DB 변경·배포는 포함하지 않는다.
