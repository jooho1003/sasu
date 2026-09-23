# 개발 변경 커밋·머지 — 2026-09-23

사용자가 “커밋 머지 다 진행해줘”라고 요청했다. 완료된 ASK 근거 선택·원문 강조, 문체 개선, 회고 실제 모델 재검증, 관련 명세·실행 기록을 `feat/grounded-answer-followup`에 커밋하고 PR #1로 main에 통합한다.

- 구현 커밋: `efb75e8` (201파일). 기존 main의 원격 미반영 녹음 보안 커밋 `8bcdbcd`는 수정하지 않고 함께 포함한다.
- PR: https://github.com/jooho1003/sasu/pull/1
- 코드 검증: [문체 후속](llm-style-followup-2026-09-23/README.md)의 lint·build·Vitest 1,391검사, [ASK](grounded-answer-selection-2026-09-23/README.md)의 SQL·UI·실DB 기록. 커밋 직전 비밀 패턴 검사는 발견 0건이었다. 로컬 빌드가 생성한 `next-env.d.ts`의 `.next-verify` 참조는 추적 원본으로 복원했다.

## 소스 통합과 운영 적용

PR 생성 후 Vercel Git 연동 검사가 실제로 시작되는 것을 확인했다. 운영 DB 적용·배포는 기존 PRD §8 / ADR-049 / phase32 step4의 별도 승인 조건으로 남아 있다. 머지만으로 운영 앱이 먼저 배포되지 않도록 `vercel.json`에 `git.deploymentEnabled.main: false`를 추가했다. 다른 브랜치는 기본 설정을 유지한다.

근거: [Vercel Git Configuration — git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). 지정 브랜치의 push 자동 배포를 막는 설정이다. 이 변경은 기존 배포를 내리거나 DB를 변경하지 않는다. PR 미리보기 검사는 앱 빌드 검사이며 운영 DB 연결 검증이 아니다.

승인된 운영 적용 때 원격 migration 목록을 대조해 미반영 0052·0053·0054를 검토하고, ASK의 0053 → 0054를 앱보다 먼저 적용한다. 이후 승인된 수동 배포를 실행하거나 `main: false`를 제거하는 별도 커밋으로 자동 배포를 재개한다. 현재 작업에서는 운영 DB·환경변수를 수정하거나 운영 배포 명령을 실행하지 않는다.
