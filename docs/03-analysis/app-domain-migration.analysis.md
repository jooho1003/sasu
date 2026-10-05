# app-domain-migration — Analysis (PDCA Check)

2026-10-05 · phase 49 · gap-detector 독립 분석 + root 최종 리뷰. 설계: [design](../02-design/features/app-domain-migration.design.md) §11.1 비교 목록. 실행 기록: [verification](../verification/49-app-domain-migration/verification.md).

## Context Anchor

| Key | Value |
|---|---|
| WHY | 발신·링크 도메인 불일치(스팸 원인 후보)와 주소 계산 4곳의 불일치 |
| WHO | 웹 사용자(파일럿 lead·구성원·조직 관리자), Slack 사용자, 데스크톱 0.1.x 사용자, 심사위원 |
| RISK | 옛 주소 API를 리디렉션하면 데스크톱 Bearer가 빠져 세션 삭제 · 대시보드 설정 순서 오류로 로그인/Slack 중단 |
| SUCCESS | SC1~6: 새 주소 완주 · 옛 주소 화면 308/API 200 · 링크 전부 새 주소 · 메일 링크 로그인 · 0.1.3 업데이트 무재로그인 |
| SCOPE | PRD §4·§8(운영 주소 이전)·§10 #12 / ADR-088 / ARCHITECTURE §6-13 불변식 51~53 |

## 1. 일치율

| 축 | 비율 | 근거 |
|---|---|---|
| Structural | 100% (23/23) | §11.1 모듈 3·엔드포인트 4·배선 4·테스트 9·설정/문서 3 모두 존재 |
| Functional | 98% | §4·§6·§7 규칙 18개 집행. Minor M4·M5 때문에 감점(분석 후 보완) |
| Contract | 100% (4/4) | E-C1~E-C4 설계 = 서버 = 테스트 |
| Runtime | 100% | unit 186 files 1880 passed · build · lint blocking 0 · 로컬 E2E 14 passed |
| **Overall** | **99.5%** | 15 + 24.5 + 25 + 35 |

## 2. 전략 정합

- WHY 충족: 서버 절대 주소는 `metadataBase()` 하나(app·lib에서 URL env를 읽는 곳은 `lib/site.ts` 두 줄뿐). 메일 링크는 `/auth/confirm`으로 우리 도메인에서 끝난다.
- RISK 대응: `/api/*` 비이동이 단위·proxy 테스트로 고정됨. 운영 설정 순서는 setup-guide §16 T1~T12.
- 결정 준수: C 실용형(환경변수로 켜고 끔 → 병합만으로 운영 동작 무변경), 루트 도메인, 화면만 이동.

## 3. Gap 목록과 처리

| # | 심각도 | 내용 | 처리 |
|---|---|---|---|
| — | Critical/Important | 없음 | — |
| M1 | Minor | consent-route 테스트에 `VERCEL_URL` stub 잔존, 기록과 불일치 | 수정(`vi.unstubAllEnvs()`) |
| M2 | Minor | U6 interactions 테스트를 새 파일로 작성 | 차이로 기록 |
| M3 | Minor | T7 직전 발송 메일 링크 실패 안내 누락 | setup-guide §16 주의 추가 |
| M4 | Minor | `/auth/confirm/` 끝 슬래시에 no-referrer 미적용 | 수정(red→green) |
| M5 | Minor | 옛 호스트 비 API POST 308 케이스 없음 | 테스트 추가 |

root 리뷰에서 먼저 찾아 고친 것: step 1의 `//evil.example` 경로 오픈 리디렉션(origin 복사 후 pathname만 설정), step 2의 라우트 `Referrer-Policy`가 next.config 공통 헤더에 밀리는 문제(proxy에서 부여).

## 4. Plan Success Criteria

| SC | 상태 | 근거 |
|---|---|---|
| SC1 새 주소 완주·TLS·www 308 | ⏳ 운영 | T4·T10 |
| SC2 옛 주소 화면 308·API 비이동 | ✅ 코드 / ⏳ 운영 | U1·U2 / T7·T10 |
| SC3 링크 전부 새 주소 | ✅ 단위 / ⏳ 운영 | U6, `metadataBase()` 단일화 / T7 |
| SC4 메일 링크 로그인·재사용 거부 | ✅ 로컬 / ⏳ 실제 메일 | E1 2 passed / T9 |
| SC5 0.1.3 업데이트 무재로그인 | ⏳ 운영 | T11 |
| SC6 lint·build·unit·E2E·analyze ≥90%·운영 기록 | ⚠️ 운영 기록만 남음 | verification.md |

## 5. 남는 위험 (수용, ADR-088 경계)

- token_hash 링크의 로그인 CSRF(초대제 조직, 화면에 계정·부서 표시).
- 쿼리의 일회용 토큰이 Vercel 요청 로그에 남을 수 있음(첫 검증에서 소모).
- 이메일 보안 스캐너가 링크를 먼저 열면 토큰 소모 → 재요청.

## 6. 다음

일치율 ≥ 90% → iterate 불필요. 운영 전환 T1~T12(단계마다 사용자 승인) → `/pdca report app-domain-migration`.
