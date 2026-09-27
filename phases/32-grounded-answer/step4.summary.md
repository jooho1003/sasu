# step4 실행 요약

- 현재 상태: **blocked — 사용자 승인 후 운영 DB·자동 배포·웹 ASK/원문 강조 확인 완료. Slack DM/채널 실제 발송을 포함한 운영 검증은 남음**. 아래 초기 실행 기록과 당시 미검증 범위는 보존한다.
- 순서대로 lint → 프로덕션 build/TypeScript → 전체 unit → SQL final → UI → 로컬 실DB E2E를 실행했다.
- 결과: lint 차단 0, 단위 139파일·1,383검사, SQL 243검사·2,016권한 조합, 화면 12검사(1440/390), 실제 Groq 합성 평가 10/10, 실제 로컬 연결 E2E 1건(약 2분) 통과.
- E2E: 질문 job 5건 자동 완료, 2020년 결정·문서/회의 원문·재열람·자기 인용 강조/타인 비강조·조건/예외 연속 인용·권한 회수·삭제 차단·모바일 넘침 없음. 조건/예외는 done/error_code null이었다. 브라우저 오류 0.
- 로컬 Groq 5회, 입력 6,102·출력 3,232 토큰. 9/22는 5회·5,707·4,094이며 질문/자료가 달라 직접적인 성능 개선률은 아니다.
- 검증 중 모델 A09 최초 실패, SQL 생성 문자열 치환 실수, 콜드 Vite 탐색 제한과 UI 선택자 가정 오류를 보존하고 수정했다. 최종 기준이나 제품의 권한/거절 검증은 완화하지 않았다.
- [전체 증거](../../docs/verification/grounded-answer-selection-2026-09-23/README.md) · [실DB 기록](../../docs/verification/grounded-answer-selection-2026-09-23/live/README.md) · [코드 관계/수동 흐름도](../../docs/verification/grounded-answer-selection-2026-09-23/dependencies.md). Graft/Archify 결과는 도구 부재로 누락이다.
- 운영 적용·Slack 실제 발송·업로드 경로는 미검증이다. 9/22 기록은 보존했다. 기존 미커밋 변경과 섞이지 않도록 자동 전체 커밋 실행기를 쓰지 않았으며 이번 작업에서 커밋하지 않았다.

## 후속 운영 적용 — 2026-09-23

- 사용자의 커밋·머지·자동 배포 요청으로 ADR-049 운영 승인 조건 충족. PR #1·#2 머지 후 운영 0052~0054 적용, 54개 migration 일치, main 자동 배포 Ready 확인.
- 운영 웹 합성 ASK 1건 done, 인용 2개·순서·원문 문자열 일치·고정 안내 SQL 확인. 문서 링크에서 연속 3문단 강조를 실제 Chrome 화면으로 확인했다.
- Graft 실제 구조 분석·호출 관계와 Archify HTML·브라우저 검사를 실행했다. 구현 전 도구 실행 누락은 소급 완료로 처리하지 않는다.
- Slack 계정의 목록 조회는 성공했으나 실제 발송 검증은 남았다. [현재 운영 증거·미완료 범위](../../docs/verification/release-completion-2026-09-23/README.md).

## 2026-09-27 ASK 파일럿 후속

- 운영 재확인에서 F2의 늦은 보류 기록 누락과 기준 질문의 과도한 현재 상태 안내를 확인했다. Graft 구현 전·후 그래프와 Archify 도식·브라우저 검증을 수행하고, 두 사례를 재현 테스트로 수정했다. 대상 35건·전체 1,409건, lint·TypeScript·프로덕션 빌드 통과. [실행 결과와 남은 운영 재시험](../../docs/verification/ask-pilot-followup-2026-09-27/README.md).
- 사용자 승인에 따라 PR #8을 머지했고 Vercel 운영 배포가 성공했다. 공개 데모 URL은 HTTP 200을 확인했다. 파일럿 웹 묻기 재시험에서 기준 질문의 불필요한 현재 상태 안내는 사라졌지만, 상태 질문과 9/15 회의 결론 질문은 `근거 없음`으로 끝나 F2는 미해결이다. [운영 반영 기록](../../docs/verification/ask-pilot-followup-2026-09-27/production-release.md). 기존 step4의 Slack 실제 발송 미완료 상태는 유지한다.
- 후속으로 상태 질문의 SQL 안건 단어 검색(0055)을 구현하고 Graft 전·후 관계·Archify 흐름·단위 1,412건·lint·TypeScript·빌드를 확인했다. 운영 SQL 연결이 없어 실DB·배포·재시험은 미완료이며 코드 PR은 마이그레이션 적용 전 대기한다. [후속 로컬 검증](../../docs/verification/ask-f2-retrieval-2026-09-27/README.md).
