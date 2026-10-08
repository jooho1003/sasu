# search-observability Planning Document

> SASU · 2026-10-07 · PDCA plan · 사용자 설정 지시와 신규 생성 답변에 근거.

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 공개 검색·AI 답변에 필요한 제품 설명과 방문·오류 관측 보완. PRD §3-9. |
| Solution | 기존 Next.js metadata 확장과 GA4·Sentry 신규 연결. ADR-091. |
| Function/UX Effect | 제품 FAQ·방문 분석 선택·원문 없는 오류 수집. PRD §3-9·§8. |
| Core Value | 공개 발견 가능성과 장애 확인, 업무 자료의 경계 유지. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | PRD §3-9 공개 발견과 장애 관측 |
| WHO | 공개 방문자·운영자 |
| RISK | PRD §8 원문·인증 URL 전송 금지 |
| SUCCESS | 아래 SC 실행 기록, 실제 계정 연결·배포는 별도 기록 |
| SCOPE | PRD §3-9·§8 / ADR-091 |

## 1. Overview

원천 [PRD](../../PRD.md) §3-9·§8, [ADR](../../ADR.md) ADR-091, [ARCHITECTURE](../../ARCHITECTURE.md) §6-14. 새 결정은 원천에만 둔다.

## 2. Scope

비교 목록: metadata·robots·sitemap·llms.txt·홈 FAQ/JSON-LD·GA4 공개 분석 선택·Sentry instrumentation·CSP·개인정보 안내·설정 절차. DB·job·업무 API 변경 없음.

## 3. Requirements

| ID | 원천·비교 대상 |
|---|---|
| FR1 | PRD §3-9: 홈·demo·privacy canonical/OG, 나머지 noindex |
| FR2 | PRD §3-9: visible FAQ = FAQPage, Organization·WebSite·SoftwareApplication, llms.txt |
| FR3 | PRD §3-9·§8: GA4 새 속성·스트림, 동의·페이지 조회·공개 CTA, 비공개 수집 중단 |
| FR4 | PRD §3-9·§8: Sentry 실제 연결·원문 제거·서버/브라우저 오류 |
| FR5 | PRD §8: CSP 정확한 수집 출처, preview off, 환경 변수·개인정보 안내 |

## 4. Success Criteria

- SC1: 공개 3경로 canonical과 구조화 데이터·FAQ 일치, 절대 sitemap, 비공개 noindex HTTP 실행 검증.
- SC2: GA4 새 프로젝트·자동 측정 off·동의 전 0요청·쿼리/비공개 전송 0·공개 조회/CTA 실행 검증.
- SC3: Sentry 실제 프로젝트와 오류 수신 확인·민감 payload 제거 단위 검증.
- SC4: lint·build·unit·관련 E2E와 gap 분석 실행 기록. 운영 반영은 승인 후.

## 5. Risks and Mitigation

PRD §8의 전송 제한을 허용 목록 기반 테스트로 확인. 실제 로그인·약관·수신 미완료는 완료로 표시하지 않음.

## 6. Impact Analysis

root layout → 전 화면, proxy → noindex/CSP, 기존 security-headers 소비자 next.config/proxy, site.metadataBase → 공유·sitemap·Slack 링크(계산 변경 없음). 테스트는 관련 소비자 포함.

## 7. Architecture Considerations

Dynamic. 기존 Next.js 경계를 유지하는 ADR-091 선택안 C 사용.

## 8. Convention Prerequisites

lib 신규 모듈 TDD, node_modules/next/dist/docs 확인, 한국어 UI, 원문 로그 금지, 공용 식별자는 서버 전달.

## 9. Next Steps

design → phase 52 step → 구현 → analyze → report. Graft·Archify 도구가 없으면 누락 기록.
