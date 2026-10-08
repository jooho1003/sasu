# search-observability Design Document

> 2026-10-07 · PDCA design · [Plan](../../01-plan/features/search-observability.plan.md)

## Context Anchor

WHY/WHO/RISK/SUCCESS/SCOPE는 plan과 PRD §3-9·§8, ADR-091 참조.

## 1. Overview

PRD §3-9 공개 검색 노출·방문·오류 관측, §8 비공개 정보 경계를 구현한다.

## 2. Architecture Options

| 안 | 비교 | 판단 |
|---|---|---|
| A 최소 변경 | metadata+각 파일 inline 설정, 빠르지만 privacy 로직 중복 | 미선택 |
| B 독립 서비스 | 분석 proxy·추적 DB·수집 파이프라인 추가 | 범위 초과 |
| C 기존 경계 확장 | 공개 콘텐츠와 전송 허용 목록을 lib에, SDK는 instrumentation/컴포넌트에 | ADR-091 선택 |

구조: metadataBase → metadata/sitemap/llms/JSON-LD; 공개 layout → 동의 → GA4; root instrumentation → Sentry → 전송 필터; proxy → CSP+X-Robots-Tag.

## 3. Data Model

새 테이블·job 없음. 방문 분석 선택은 브라우저 로컬 저장소의 granted/denied 값. 값 손상·저장 오류는 미동의로 처리.

## 4. API Specification

- GET /llms.txt: 공개 제품 요약·공개 링크만, text/plain.
- GET /api/telemetry/config: 공개 Sentry DSN·환경·활성 여부만, no-store. 비밀 토큰 포함 금지. 초기화 실패는 무수집.
- /robots.txt·/sitemap.xml: 기존 Next metadata route 확장.

## 5. UI/UX Design

홈 FAQ는 semantic details/summary로 서버 렌더. GA4 설정이 있을 때 공개 화면에서만 방문 분석 허용/거절·변경 제공. 선택 전 스크립트 로드 없음. privacy 안내에 Google Analytics·Sentry 목적과 제한 고지.

## 6. Error Handling

미설정·잘못된 식별자·관측 서버 오류는 전송하지 않고 제품 화면 유지. 오류 본문 화면·콘솔 출력 금지.

## 7. Security Considerations

PRD §8·ARCHITECTURE §6-14. 공개 3경로만 GA4 허용, 자동 향상 측정 off, 내부 링크 이동 전 전체 문서 이동으로 GA4를 제거. private noindex는 인증 대체 수단이 아니다. Sentry beforeSend는 허용 필드만 재구성, replay/tracing/logs/breadcrumbs off. CSP nonce 유지, 실제 GA/Sentry 수집 origin만 connect-src 추가.

## 8. Test Plan

TDD: 검색 공개/preview 정책, safe Sentry payload, GA4 식별자·public page payload·CSP 출처. E2E: metadata·FAQ 일치·robots/llms/sitemap·비공개 헤더, 동의 전/후 GA4 스크립트와 CTA, 거절·철회. 계정 수신·배포는 실제 증거 별도.

## 9. Clean Architecture

lib/search-discovery와 lib/telemetry는 순수 로직; components와 instrumentation은 SDK/프레임워크 배선. 기존 권한 SQL과 업무 API 변경 없음.

## 10. Coding Convention Reference

AGENTS.md·PRD §8. 서버 환경 변수 GA4_MEASUREMENT_ID·SENTRY_DSN·SENTRY_ORG·SENTRY_PROJECT·SENTRY_AUTH_TOKEN, 개발 검증만 SASU_TELEMETRY_TEST_ENABLED. 비밀값 커밋 금지.

## 11. Implementation Guide

비교 목록: lib/search-discovery.ts·lib/telemetry.ts; app layout/home/privacy/robots/sitemap/llms/config; components/public-analytics.tsx; instrumentation.ts·instrumentation-client.ts·sentry.server.config.ts; error/global-error; proxy/security-headers/next.config; tests/설정 문서.

순서: 신규 테스트 red → 순수 구현 green → 공개 검색 → 실제 GA4 생성·연결 → 실제 Sentry 설치·연결 후 SDK → lint/build/unit/E2E → analyze/report.

Session Guide: search, analytics, errors, verification 네 모듈을 phase 52 step0 한 세션에서 연결. 계정/약관 게이트는 독립 진행 가능 작업을 계속한 뒤 기록.
