# web-signout-scope — Design

2026-10-05 · phase 50 · 원천 ADR-089, PRD §8. 계획: [plan](../../01-plan/features/web-signout-scope.plan.md).

## Context Anchor

| Key | Value |
|---|---|
| WHY | 웹 로그아웃이 데스크톱 세션을 끊음 |
| WHO | 웹과 데스크톱을 함께 쓰는 lead·구성원 |
| RISK | 전체 기기 로그아웃 수단 부재 → 운영자 절차 |
| SUCCESS | SC1~3 |
| SCOPE | PRD §8 / ADR-089 |

## 1. Overview

인자 하나를 바꾸는 변경이라 설계안 비교는 생략한다(A 최소 변경 외 대안은 ADR-089 대안에서 기각).

## 4. API

| ID | 경로 | 계약 |
|---|---|---|
| E1 | `POST /auth/signout` | `createServerSupabaseClient().auth.signOut({ scope: "local" })` → 303 `next`(정리) 또는 `/login`. GET 405 그대로 |
| E2 | `GET/POST /demo/access` 실패 정리 | 심사 계정 확인 실패이고 세션이 있으면 `signOut({ scope: "local" })` 후 `/demo?demo=unavailable` |

## 8. Test Plan

| ID | 파일 | 시나리오 |
|---|---|---|
| U1 | `tests/auth-signout-route.test.ts`(신규 또는 기존 확장) | signOut이 `{ scope: "local" }` 1회, 303 Location 기존과 동일 |
| U2 | 기존 demo access 테스트 확장 | 실패 경로 signOut 인자 `{ scope: "local" }` |
| P1 | 운영(병합 후) | 같은 테스트 계정으로 세션 2개 생성 → 하나로 `POST /auth/signout` → 다른 세션으로 보호 화면 200 |

## 11. Implementation Guide

### 11.1 비교 목록
모듈 없음 · 엔드포인트 E1·E2 · 테스트 U1·U2·P1.

### 11.2 Step
| step | name | 범위 |
|---|---|---|
| 0 | signout-scope | E1·E2 + U1·U2, lint·build·test |
