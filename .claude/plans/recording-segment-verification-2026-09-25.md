# 녹음 구간 저장·검증·전사 연결(step1-C) — 2026-09-25

"지금 codex 한도 없으니까 너가 다음 착수 사항 개발 진행해줘."

다음 착수 사항은 phase 23 step1의 남은 서버 단계다. step1-A(순수 모듈)와 step1-B(녹음 세션 수명 주기)는 구현·검증 기록이 있다. step1b 명세는 "자료 전환·구간 업로드/검증은 다음 서버 단계에서 연결한다"고 남겼다. step1-B 검증 폴더에는 실행 결과만 있고 README가 없어서 이번에 같이 마감한다.

범위: 저장(manifest v1 → `reviewed_materials`·`review_original_segments`) → 구간 INSERT 정책 → finalize → `verify_review_segment` 워커 → 전 구간 검증 1회 전이(전사 창 예약, 세션 `completed`) → 전사 창 메모리 조립 → 구간 접근권·재생 → 폐기·만료·취소·철회 파기.

범위 밖: 녹음 화면과 ReviewDetail 구간 재생(step2), 단어 타임스탬프 경계(step4-B), 운영 DB 적용, 배포, 커밋, 실제 Groq 호출.

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| P0 | step1-C 명세·구현 결정 | general | 1/2/0/2=5 | powerful | main (아키텍처, 위임 금지) |
| S1 | 계약 Zod(TDD)·migration 0060 | security | 1/2/1/2=6 | powerful | main |
| T1 | 격리 PGlite SQL 하니스 | security | 1/1/1/1=4→floor | powerful | main |
| B1 | 워커 TDD(검증·전사 창·파기) | general | 0/1/1/1=3 | balanced | claude 서브에이전트 (sonnet) |
| B2 | 라우트·lib/review-access TDD | general | 0/1/1/1=3 | balanced | claude 서브에이전트 (sonnet) |
| V1 | 실제 로컬 Storage 통합 | qa | 1/1/1/1=4 | balanced | claude 서브에이전트 (sonnet), Docker 기동 시에만 |
| A1 | Archify 흐름도·Graft 시도 | general | 1/0/0/1=2 | balanced | claude 서브에이전트 (sonnet) |
| R1 | 최종 리뷰·검증 기록 | review | 2/2/0/2=6 | powerful | main (최종 리뷰, 위임 금지) |

## 게이트

- G1 완전성: PASS
- G2 오버라이드: PASS. B2는 SQL이 집행하는 권한 계약을 잇는 얇은 배선이다.
- G3 클램프: PASS. T1은 security floor로 승격.
- G4 비용: PASS(근거 부착). powerful 4/8 = 50%. P0 아키텍처, S1 보안·권한 설계, T1 security floor, R1 최종 리뷰. 강등 가능한 노드가 없다.
- G5 안전: PASS. D3=2 노드 없음.

결과: **PASS**

## 실행 규칙

- B1·B2는 S1의 계약(Zod)이 저장된 뒤 병렬로 시작한다. 서로 다른 파일만 고친다. 서브에이전트는 `npm run build`를 돌리지 않는다(같은 `.next` 충돌). 빌드는 R1 전에 메인이 한 번 실행한다.
- 서브에이전트 결과는 R1에서 메인이 다시 읽고 검토한다. 자기 보고를 완료 판정에 쓰지 않는다.
- V1은 Docker 엔진과 로컬 Supabase가 뜰 때만 실행한다. 실패하면 blocked 사유를 기록한다.

## 실행 결과 (2026-09-25)

모든 노드 완료. 티어 변경 없음. 기록: `docs/verification/recording-segments-2026-09-25/README.md`.

- 검증: 격리 SQL 277(새 18)·돌연변이 6/6, 단위 145파일·1,592, lint·build, 실제 로컬 Supabase Storage 18(LLM 0·외부 요청 0), Archify 9/9, Graft 전후 그래프.
- 바로잡은 것: 마지막 전사 창의 `least()` NULL 버그(테스트 전 재검토), SQL fixture 두 건, 무효였던 첫 돌연변이 실행, B2의 TDD 가드 우회(→ `lib/recording/recording-routes.ts` TDD 정리), 워커 구현 전에 찍힌 Graft 스냅샷(→ 재실행).
- 하지 않은 것: 운영 DB 적용·배포·커밋, 녹음 화면(step2), 실제 동시 트랜잭션 경합, 실제 Groq 전사.
