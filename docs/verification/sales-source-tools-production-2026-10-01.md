# 실제 영업 원문 검토 도구 운영 반영 — 2026-10-01

사용자 “운영 반영하고 다음 개발 진행” 요청에 따라 phase 38~40(원문 연결·견적 문구 비교·조건 확인 질문)을 운영 반영했다. 원천 `8e6078b`, [PR #22](https://github.com/jooho1003/sasu/pull/22) 병합 `43334bc`. 기존 DB 0067을 사용하며 migration·실제 고객 데이터 쓰기 없이 앱만 배포했다.

| 실행 검사 | 결과 |
|---|---|
| 배포 전 local 단위/lint/build | 168파일·1,748건, lint, webpack build 통과 |
| 인증 local E2E/회귀 | 신규 2/2, 기존 9/9 통과 |
| Git 연동 운영 빌드 | `dpl_CTujGkBq7ecdsBPzcuuqKDx7PQFw` Ready (build 1분14초) |
| 운영 alias | https://sasu-alpha.vercel.app → 같은 Ready 배포 |
| 공개 HTTP | `/`·`/privacy`·`/demo/features` 모두200 |
| 운영 guest E2E | `E2E_BASE_URL=https://sasu-alpha.vercel.app playwright test tests/e2e/guest.spec.ts` 5/5, 2분7초 |

게스트 1440/390px·부서 격리·잘못된 서명 거절·전후 DB 행 수와 AI 호출 불변을 확인했다. 실제 인증 사용자로 운영 고객 자료를 읽거나 변경하지 않았다. 인증 원문 기능과 권한 회수 검증은 [phase40 local 기록](sales-review-condition-checklist-2026-10-01.md)에 있다.

이전 운영 배포 `dpl_AQRMrHZFi7kifBQv1bK1XEu4k2BZ`를 코드 롤백 대상으로 보관한다. 새로운 스키마 변경은 없다. phase41 AI 문단 선택은 별도 개발 브랜치이며 이번 운영 배포에 포함되지 않는다.
