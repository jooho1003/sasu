# 자료 검토·기록 보존 운영 반영 — 2026-09-17

phase 20~22의 검증된 코드와 마이그레이션을 운영에 반영했다. 운영 URL은 <https://sasu-alpha.vercel.app>이다. 장기 보존 정책과 범용 부서 에이전트의 업무·실행 권한은 별도 공동 설계 대상이며, 이번 배포가 그 미정 정책을 임의로 활성화했다는 뜻은 아니다.

## 반영 결과

- 운영 전 `0034_reviewed_materials.sql`, `0035_record_retention.sql`만 대기 중임을 dry-run으로 확인했다.
- 운영 DB schema/data dump를 git 제외 경로 `.vercel/rollout-20260917-reviewed-materials/`에 보관했다.
  - `pre-schema.sql`: 285,656 bytes, SHA-256 `9BB6C5DD02E0786C4DAC7FB5336C3C192BA847BD2745ADDB0FC530E3F568EB96`
  - `pre-data.sql`: 1,596,397 bytes, SHA-256 `DD00B8E8B741A4E62B1AE4CB7A51F3A5F32F7E7740197F3FED2805A96254055F`
  - `decisions`·`answers`의 순환 FK 때문에 data-only 복원에는 trigger/FK 처리 계획이 필요하다. 이 덤프를 무검증으로 운영 DB에 덮어쓰지 않는다.
- `0034`·`0035`를 순서대로 적용했다. migration list에서 로컬/원격 `0001`~`0035`가 일치한다.
- service role의 `reviewed_materials`, `retention_settings`, 비공개 `review-materials` 버킷 조회는 200이었다. anon의 `reviewed_materials` 직접 조회는 401이었다.
- 최종 배포 `dpl_C2dsyEN4xKXaTM4jwUWApjChBmkN`은 Ready 확인 뒤 운영 도메인으로 승격했다.

## 배포 경로와 발견한 문제

로컬 Git 메타데이터를 포함한 첫 후보 `dpl_Dm7pTHJ9Lcsf52x4rL2nRfW1DbX1`은 커밋 작성자에게 Vercel 프로젝트 배포 권한이 없다는 이유로 차단됐다. Git 메타데이터 없는 격리 스냅샷에서 다시 빌드했다. Windows의 prebuilt 산출물 배포는 `_global-error.segments/__PAGE__.segment.rsc.func` 누락으로 실패해, 같은 스냅샷 소스를 Vercel 원격 빌드로 전환했다. 최종 원격 빌드는 Next.js 16.3.4 compile·TypeScript·정적 페이지 28개 생성을 통과했다.

운영 승격 전 GitHub 웹의 `main` 커밋 목록에서 최신 커밋이 로컬 `origin/main`과 같은 `70a521a`임을 확인했다. GitHub CLI 토큰은 만료되어 기기 인증을 시작했으며, CLI `git pull --ff-only` 완료 여부는 인증 결과와 함께 별도로 기록한다.

## 운영 검증

| 검사 | 결과 |
|---|---|
| 최종 로컬 검증 | lint 0건, Next.js production build·TypeScript 통과, Vitest 82파일·1,027개 통과. [lint](reviewed-materials-production-2026-09-17/lint.txt) · [build](reviewed-materials-production-2026-09-17/build.txt) · [unit](reviewed-materials-production-2026-09-17/unit.txt) |
| 운영 별칭 | `sasu-alpha.vercel.app` → `dpl_C2dsyEN4xKXaTM4jwUWApjChBmkN`, Ready |
| 마이그레이션·DB·공개 스모크 | `0001`~`0035` 일치, 신규 테이블·버킷 service 200, anon 직접 조회 401, 공개 4개 경로 200. [마이그레이션](reviewed-materials-production-2026-09-17/migration-list.txt) · [체크 결과](reviewed-materials-production-2026-09-17/production-checks.json) |
| 무인증 경계 | `/api/jobs/run`, `/api/slack/events` POST 401. [체크 결과](reviewed-materials-production-2026-09-17/production-checks.json) |
| Playwright 운영 회귀 | 게스트·사이트·반응형 12/12 통과, 1.6분. [실행 기록](reviewed-materials-production-2026-09-17/production-e2e.txt) |
| 신규 화면 로그인 읽기 | `/reviews`, `/retention`을 포함한 공통 탐색 1440px·390px 2/2 통과, 쓰기 요청·브라우저 오류 0. 위 Playwright 기록에 포함 |
| Vercel 오류 로그 | 배포 뒤 최근 30분 error 로그 0건. [실행 기록](reviewed-materials-production-2026-09-17/vercel-errors.txt) |

실제 Groq 전사·Storage 업로드·편집·확정·원본 삭제와 암호화 격리 복원은 앞선 [개발 검증](reviewed-materials-2026-09-16/README.md)에서 합성 데이터로 통과했다. 이번 운영 점검은 새 스키마·버킷·배포·로그인 읽기 경로를 확인했으며 운영 DB에 합성 자료를 새로 쓰지 않았다.

## 상태

- phase 20 reviewed materials: 개발 검증·운영 반영 완료
- phase 21 record retention: 개발 검증·운영 반영 완료
- phase 22 review state recovery: 개발 검증·운영 반영 완료
- 정기 외부 백업 저장소·주기·보관 기간·RPO/RTO와 부서 에이전트의 첫 업무·실행 권한: 미정 정책으로 유지
