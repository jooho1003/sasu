# 품질 개선 검증 기록

검증일: 2026-09-12 (KST)

## 대상과 실행 경계

- 로컬 소스와 `next build` 산출물. 운영 앱은 배포하지 않았다.
- 기존 Supabase RLS 테스트는 연결된 실제 Supabase의 합성 seed 계정으로 실행했다.
- 신규 `0012`·`0013` 마이그레이션은 운영 DB에 적용하지 않았다. PGlite 0.5.8 + pgvector 확장 0.0.9의 격리 PostgreSQL에서 실행했다.
- 격리 DB는 리포의 SQL을 직접 읽고, Auth 역할·JWT 함수만 fixture로 구성한다. `0004_worker_cron.sql`은 pg_cron/pg_net이 없어 제외했다. 따라서 운영 Cron, PostgREST 스키마 캐시, 실제 Auth 발급 동작은 이 결과로 보증하지 않는다.
- 실제 Slack 메시지가 나가는 기존 `vertical-slice.spec.ts`는 실행하지 않았다. 게스트 E2E의 잘못된 서명 요청은 수신 단계에서 차단된다.

## 실행 결과

| 검증 | 결과 |
|---|---|
| 수정 전 `npm test` | 24개 파일, 142개 통과 |
| 기존 `npm run test:rls` | 실제 Supabase 6개 통과; 신규 마이그레이션 적용 후의 검증은 아님 |
| 새 검색·답변 테스트, 수정 전 실행 | 6개 실패, 2개 통과 |
| 새 검색·답변 테스트, 수정 후 실행 | 8개 통과 |
| `node scripts/verify-security-sql.mjs <임시 패키지 경로>` | 신규 SQL 포함 11개 통과 |
| 최종 `npm run lint` | 통과 |
| 최종 `npm run build` | 컴파일·TypeScript·페이지 생성 통과 |
| 초기 게스트 E2E | 1440px·390px 완주 및 부서·서명 차단 3개 통과 |
| 최종 `npm test` | 25개 파일, 148개 통과 |
| 최종 게스트 E2E | 4개 통과, skip 0개. 데스크톱·모바일 완주, 실제 부서 404, 잘못된 서명 401, DB 행 수 비교 |
| 게스트 DB 관측 | `llm_calls`, `jobs`, `items`, `answers`, `decisions`, `citations` 모두 관측 전후 행 수 동일 |
| Windows 훅 검증 | 초기 8개 실패 원인은 Git Bash 비로그인 PATH에서 cat/sed 누락. 경로 보정·의존성 검사·잘못된 JSON 차단 후 훅 24개 통과 |
| 최종 Python 자동화 검증 | `py -3 -m pytest scripts/test_execute.py scripts/test_hooks.py -q`: 89개 통과 |
| `git diff --check` | 통과 |

새 SQL의 실행 검증은 검색 결과와 권한 오류를 직접 검사한다. member의 타인 답변·비공개 원장 0건, lead의 개인 검색과 채널 검색 차이, 다른 사용자 사칭 검색 차단, 일반 계정의 완료 RPC 실행 차단, FK 실패 시 답변·인용 롤백, 반복 완료 멱등, 스윕 후 늦은 결과 거부, 자기 역할 승격·타인 동의 변경 차단, 본인 동의·팀장 Slack 매핑 정상 작동, 원장 수정·삭제 거부, 완료 답변 위조 차단을 포함한다.

최종 게스트 E2E는 새 프로덕션 빌드에 대해 실행했다. 스크린샷은 아래 경로에 생성했고 모바일 화면을 직접 확인했다. `test-results`는 Git 제외 대상이며 E2E 재실행 시 교체될 수 있다.

- [데스크톱 1440px](../../test-results/guest-게스트-대시보드·카드·원장·묻기-완주-1440px-chromium/guest-1440.png)
- [모바일 390px](../../test-results/guest-게스트-대시보드·카드·원장·묻기-완주-390px-chromium/guest-390.png)

Python 테스트는 `python` 명령이 Python 2.7을 가리켜 첫 실행에 pytest를 찾지 못했다. Python 3 런처(`py -3`)로 실행했다. 전역 Python 설정은 변경하지 않았다.

## 재현 명령

```powershell
npm run lint
npm run build
npm test
npm run test:rls
npm run e2e -- tests/e2e/guest.spec.ts
py -3 -m pytest scripts/test_execute.py scripts/test_hooks.py -q
```

격리 SQL 테스트의 패키지는 리포 의존성에 추가하지 않았다. 재현 시 임시 디렉터리에 설치하고 그 경로를 인자로 넘긴다.

```powershell
$qaDbDir = Join-Path ([System.IO.Path]::GetTempPath()) ('sasu-qa-db-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qaDbDir | Out-Null
npm install --prefix $qaDbDir --no-audit --no-fund @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9
node scripts/verify-security-sql.mjs $qaDbDir
```

## 운영 반영 순서와 제한

검증용 Supabase에 `0012`·`0013`을 적용한 뒤 실제 JWT로 신규 경계를 다시 확인한다. 승인된 운영 반영에서는 DB 적용 후 앱을 배포해야 한다. 새 앱을 먼저 배포하면 `complete_answer` RPC가 없어 질문 처리가 실패한다. 기존 API의 정상 동의·Slack 계정 매핑과 원장 생성도 회귀 확인한다.

게스트 DB 행 수 비교는 관측 구간의 증가 여부를 확인한다. 동일 DB에 다른 트래픽이 있으면 무관한 증가로 테스트가 실패할 수 있고, 같은 행 수를 유지하는 UPDATE까지 증명하는 검사는 아니다. 브라우저 쓰기 요청 0건 검사와 함께 해석한다. 동시 100명 부하, 실제 Recall 봇, Slack DM 게시, 새로운 운영 DB 정책의 적용 여부는 이번 완료 항목에 포함하지 않는다.

추가 설계 과제와 공식 근거는 [품질·설계 검토](quality-design-review.md)에 정리했다.
