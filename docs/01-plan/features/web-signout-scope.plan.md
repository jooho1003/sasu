# web-signout-scope — Plan

2026-10-05 · bkit PDCA · phase 50. 사용자 결정 "웹 로그아웃을 현재 기기만으로 변경".

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 웹 로그아웃이 Supabase 기본값(global)이라 같은 계정의 데스크톱 기기 세션과 다른 브라우저 세션까지 끊는다(phase 49 운영 검증에서 확인). |
| Solution | 웹 `/auth/signout`과 `/demo/access` 실패 정리의 `signOut()`을 `scope: "local"`로 바꾼다. |
| Function/UX Effect | 웹에서 로그아웃해도 데스크톱 앱과 다른 브라우저는 로그인 상태를 유지한다. |
| Core Value | 한 곳의 로그아웃이 다른 기기의 작업을 예고 없이 끊지 않는다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 웹 로그아웃이 데스크톱 세션을 끊음 |
| WHO | 웹과 데스크톱을 함께 쓰는 lead·구성원 |
| RISK | 전체 기기 로그아웃이 필요할 때 수단 부재 → 운영자 대시보드 절차로 대체 |
| SUCCESS | SC1 웹 로그아웃 후 다른 세션 유지(단위·운영), SC2 기존 로그아웃 응답 동일, SC3 lint·build·test |
| SCOPE | PRD §8 "웹 로그아웃 범위" / ADR-089 |

## 1. Overview

원천: [PRD](../../PRD.md) §8 "웹 로그아웃 범위", [ADR-089](../../ADR.md).

## 2. Scope

`app/auth/signout/route.ts`, `app/demo/access/route.ts`의 `signOut` 호출 범위만. 새 API·UI·DB 없음. "모든 기기에서 로그아웃"은 범위 밖.

## 3. Requirements

| ID | 요구 / 비교 목록 | 우선순위 |
|---|---|---|
| FR1 | `POST /auth/signout`이 `signOut({ scope: "local" })`을 부른다. 303 리디렉션·`next` 정리 그대로 | 높음 |
| FR2 | `/demo/access` 심사 계정 확인 실패 정리가 `signOut({ scope: "local" })` | 높음 |
| FR3 | 회귀 테스트: 두 경로가 local 범위로 호출하는지 | 높음 |

## 4. Success Criteria

SC1: 단위 테스트에서 두 호출이 `{ scope: "local" }`. 운영에서 같은 계정 두 세션 중 하나를 웹 로그아웃해도 다른 세션이 200을 유지. SC2: 기존 signout·demo 테스트 통과. SC3: lint·build·test.

## 5. Risks and Mitigation

| 위험 | 완화 |
|---|---|
| 도난 기기 세션 폐기 수단 | 운영자가 Supabase 대시보드에서 사용자 세션 폐기(ADR-089 경계) |
| 쿠키만 지우고 서버 세션이 남는다는 오해 | local 범위도 그 세션의 refresh token은 서버에서 폐기된다 |

## 6. Impact Analysis

호출처는 두 파일뿐(`grep signOut(` app·lib). 데스크톱은 이미 local. proxy·세션 갱신 경로 무관.

## 7~9

새 의존성·환경변수 없음. 다음: design → phase 50 step0 → analyze → report.
