# 부서별 회고 커넥터 검증

2026-09-19 사용자 확정값에 따라 개발·기획 파일럿, 개인 연결, pull만, 개인정보 미수집, 연결 해제 즉시 삭제, 부서 프리셋을 구현했다.

실행 기록:

- `npx vitest run tests/retro/connectors-map.test.ts tests/retro/connection-crypto.test.ts tests/labels.test.ts`: 통과
- `node scripts/verify-retro-connections-sql.mjs`: 8/8 통과(로컬 QA PostgreSQL)
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: 통과
- 실제 외부 Figma·GitHub·Google·CRM 샌드박스 호출과 OAuth 교환은 자격 증명 미제공으로 미실행. pull API는 유효한 `https` endpoint와 암호화된 개인 키가 없으면 저장·호출하지 않는다.
- VoIP 통화 메타데이터는 법률 자문 게이트로 제외했다.

서버 로그에는 제공자 응답·활동 제목·토큰을 출력하지 않는다. 운영 DB와 배포에는 적용하지 않았다.
