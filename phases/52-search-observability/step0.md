# 공개 검색·GA4·Sentry 설정

읽기: docs/PRD.md §3-9·§8, docs/ARCHITECTURE.md §6-14, ADR-091, docs/01-plan/features/search-observability.plan.md, docs/02-design/features/search-observability.design.md.

사용자 작업 지시와 두 서비스 신규 생성 답변에 따라 design 비교 목록을 구현한다. lib 모듈은 테스트 red를 먼저 기록한다. Graft/Archify callable 도구가 없으면 실제 import 검색으로 의존 관계를 확인하고 미실행 범위를 검증 기록에 적는다. 개인 데이터 전송 0, 동의 전 GA4 요청 0, noindex/FAQ/metadata HTTP 실행 검증, lint/build/unit/E2E 통과를 기록한다. 외부 계정 연결·수신·운영 배포를 로컬 구현 완료와 따로 표기한다.

2026-10-07 실행: 사용자 “운영 배포 승인” 후 getsasu.com에 dpl_4vZqM84jMxEyu14dVfXiPPMbwoGs를 promote했다. Vercel Turbopack build 성공, 운영 읽기 전용 공개·체험·로그인 검증과 실제 GA4 collector204/Sentry collector200을 확인했다. PDCA 재분석20/20=100%·SC4/4. 근거는 docs/verification/52-search-observability/verification.md 및 operating-results.json. 콘솔 실시간·최신 운영 오류 UI는 브라우저 연결 오류, Graft/Archify 결과는 미확보로 전체 절차 상태 Partial/in_progress를 유지한다.
