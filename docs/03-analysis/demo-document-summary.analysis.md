# demo-document-summary — Analysis (PDCA Check)

2026-10-07 · phase 53 · gap-detector 독립 분석(정적 약 95%, Critical·Important 0) + root 최종 리뷰. 설계: [design](../02-design/features/demo-document-summary.design.md) §2·§3·§8. 실행 기록: [step0](../verification/53-demo-document-summary/step0.md) · [step1](../verification/53-demo-document-summary/step1.md).

## Context Anchor

| Key | Value |
|---|---|
| WHY | 데모 "문서 정리" 소개와 화면 불일치, phase 51 결과가 데모에 안 보임 |
| WHO | 로그인 없는 데모 방문자 |
| RISK | 익명 읽기 범위 확장 · 재시드 회귀 |
| SUCCESS | SC1 SQL · SC2 단위 재검증 · SC3 E2E · SC4 lint·test·build·회귀 |
| SCOPE | PRD §6-7·§8 / ADR-092 |

## 1. 일치율

| 축 | 비율 | 근거 |
|---|---|---|
| Structural | 100% | §3 비교 목록: 정책 1·모듈 5·컴포넌트 3·화면 1·시드 1 모두 존재 |
| Functional | 97% | FR1~FR6 집행. M9 소스 id `…0110`(설계 `…0107` 충돌, 설계 문서 갱신) |
| Contract | 100% | 저장 형식·엔드포인트·job 변경 없음, 실제 문서 화면 출력 불변(공유 컴포넌트 추출) |
| Runtime | 90% | SQL 321 · unit 1916 · seed 14 · lint 0 · tsc 0 · 로컬 E1 2/2. E2 61/65(실패 4건은 로컬 DB의 빈 데모 부서 — 환경). 데모 스타일 보완은 정적 하니스로만 확인, 실제 화면 재캡처와 E2 재확인은 운영 반영 후 |
| **Overall** | **96%** | 15 + 24.3 + 25 + 31.5 |

## 2. 전략 정합

- WHY 충족: 데모 「문서」에서 합성 "배포 점검 회의록"이 한눈에 보기·결정·정책·다음 할 일·확인이 필요한 질문·원문 근거를 보여 주고, 한눈에 보기는 원문 두 문장이다(E1).
- RISK 대응: 익명 읽기는 `is_demo_department(dept_id)` + 같은 부서 활성 소스, 쓰기 거부(S1). 데모 로더는 소스별 원문으로 재검증해 다른 소스 문장을 근거로 인정하지 않는다(U4). 시드는 데모 조직만 truncate.
- 결정 준수: 설계안 A(사용자 선택), 쓰기 정책·RPC·새 테이블 없음, 게스트 LLM 0·쓰기 0.

## 3. Gap 목록과 처리

| # | 심각도 | 내용 | 처리 |
|---|---|---|---|
| — | Critical/Important | 없음 | — |
| M1 | Minor | 데모 요약 구역 간격·인용 카드 스타일 누락(캡처 검토에서 발견) | 수정: `.demo-document-summary` 래퍼 + CSS 2줄, 정적 하니스 전후 비교 |
| M2 | Minor | 설계 M9 소스 id 충돌(`…0107` = 개발 부서 노션 소스) | `…0110` 사용, 설계 문서 갱신 |
| M3 | Minor | M2 모듈이 `sectionKey`·`SummaryGroup`도 export | 병합 함수 중복 제거 목적, 유지 |
| M4 | Minor | E2 4건 실패 | 로컬 QA DB의 2026-10-05 빈 "데모 부서" 2개 때문(SQL로 확인). 운영 반영 후 운영 E2E로 재확인 |
| M5 | 참고 | `readDemoWorkspace`를 쓰는 데모 결정 기록·설정·보관 화면도 요약 조회 1회 증가 | 실패해도 빈 요약으로 처리, 유지 |
| M6 | 참고 | Graft·Archify 미실행(세션에 CLI 없음) | 기록 |

## 4. Plan Success Criteria

| SC | 상태 | 근거 |
|---|---|---|
| SC1 SQL 익명 데모 요약만 읽기·쓰기 불가 | ✅ | SQL 하니스 321 passed(신규 5) |
| SC2 읽기 시 재검증, 시드 dropped 0 | ✅ | `tests/demo-document-summaries.test.ts` U1~U4, `tests/seed-demo.test.ts` 14 passed |
| SC3 데모 문서 화면 요약 구역·원문 문장 overview | ✅ 로컬 / ⏳ 운영 | E1 2 passed(1440·390) |
| SC4 lint·test·build·기존 데모 회귀 | ⚠️ | lint·test·tsc·preview 빌드 성공, E2 환경 실패 4건 → 운영 E2E 재확인 필요 |

## 5. 다음

일치율 ≥ 90% → iterate 불필요. `/pdca report` → 운영 반영(migration 0070 → 데모 재시드 → PR #46 병합 → 운영 E1·E2), 단계마다 사용자 승인. worktree에서 `db push`는 `--workdir .` 필수(dry-run에서 대상 `0070` 한 건 확인).
