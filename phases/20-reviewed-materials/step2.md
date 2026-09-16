# Step 2: review-pages

## 읽어야 할 파일
- docs/planning/자료검토_음성전사_요구사항.md §3~8
- components/workspace-shell.tsx, components/document-assistant.tsx
- phase 20 step 1 API 및 node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md

## 작업
음성/문서 검토 목록·편집 상세·진행/실패·재시도·재추출·확정·중지·삭제·내보내기를 구현한다. 실제 상태에 맞게 저장/확정을 표시하고 재접속·충돌·수정 중 이탈·모바일을 다룬다. 사용자 선택에 따라 원본을 비공개 보관하고 재접속 후 재생/재시도를 지원한다.

## Acceptance Criteria
`npm run lint`, `npm run build`, `npm run e2e -- tests/e2e/reviewed-materials.spec.ts`.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
