# 운영 쓰기 경계 보완 — 로컬 검증 기록

- 실행: 2026-09-15 03:20~03:27 KST
- 근거: PRD 1.7 §3-2, ARCHITECTURE §6-2, ADR-042, 상세 설계 §B-4.
- 상태: phase8 step0 로컬 구현·검증 완료. **운영 DB 적용과 쓰기/LLM 연동 E2E는 미실행·승인 대기. 운영의 경계가 이미 수정되었다는 뜻이 아니다.**
- 사용자의 “클로드가 설계 완료하면 개발 이어서” 요청에 따라 파일 변화를 확인했고, Claude 앱의 SASU 세션에서 설계 완료 및 step 작성 대기를 확인했다. 메시지·승인을 대신 전송하지 않았다. `computer-use`는 이 상태 확인에만 사용했다.

## 변경

1. `0025_ingestion_write_boundaries.sql`: departments authenticated 정책을 SELECT 전용으로 교체, anon/authenticated INSERT·UPDATE·DELETE 회수. items INSERT도 회수. can_see(), 원장, 기존 SELECT RLS 및 service_role 수집 권한은 유지.
2. 문서·전사 라우트: 기존 세션 멤버십의 lead 검증, 세션 RPC `is_demo_department`의 명확한 false 확인 후에만 저장. 판정 오류/null은 500, 데모는 403. 소스·메타데이터는 세션으로 쓰며 source 생성이 실패하면 우회하지 않는다.
3. `lib/adapters/upload.ts`: mask() 적용 후 items INSERT·id 반환만 수행. 서비스 클라이언트의 조회나 임의 테이블 쓰기는 없음. 라우트의 service role 직접 import 금지 lint 규칙을 유지한다. 전사 미동의·미등록 발언 제외 유지.
4. 하니스: 0001 직후 Supabase 기본 GRANT를 명시적으로 재현한 뒤 보안 마이그레이션을 적용. 기존 코드에도 ALTER DEFAULT PRIVILEGES가 이미 있었으므로 설계의 “기본 GRANT 미재현”은 현재 코드와 일부 달랐다. 핵심 누락은 두 경계의 거부 테스트였다. 마이그레이션 이후 재GRANT해 REVOKE를 취소하는 방식은 사용하지 않았다.

`bkit:phase-7-seo-security` 체크리스트의 서버 권한·입력 검증·실패 시 정보 노출 제한을 적용했다. Next.js 스킬은 카탈로그 경로의 파일이 없어 기존 프로젝트 패턴을 사용했다. 새 서비스·패키지·환경 변수는 추가하지 않았다.

## 실제 실행 결과

| 실행 | 결과 |
|---|---|
| 수정 전 `npm run test -- tests/upload-write-boundaries.test.ts` | 17개 중 8개 실패: 데모 차단·새 수집 경계 미구현 재현 |
| 수정 전 격리 SQL 하니스 | `Missing expected rejection`: member의 departments.org_id 변경이 거부되지 않음 |
| 신규 어댑터 구현 전 `npm run test -- tests/adapters/upload.test.ts` | 모듈 없음 실패 — 테스트 먼저 작성 |
| 최종 `npm run lint` | exit 0, 오류·경고 없음 |
| 최종 `npm run build` | exit 0, TypeScript 및 프로덕션 빌드 성공 |
| 최종 `npm run test` | 49파일 **773개 통과** (새 업로드/어댑터 테스트 19개 포함) |
| 격리 SQL 하니스 | **67개 통과**, 4조직·12부서·24사용자 읽기/검색 행렬 **2,016개 assertion** |
| `npm run e2e:trailer` | **6개 통과**, 1.4분. 실제 이동·3퀘스트·목록·모바일·비활성404 |
| 기존 guest + team-coverage E2E | **8개 통과**, 25.9초. 1440/390px, 기획·디자인·개발, 실부서 차단, 잘못된 서명 거부 |
| `git diff --check` | exit 0 (CRLF 변환 안내만) |

게스트 E2E는 로컬 새 프로덕션 서버(3112) + 설정된 Supabase의 **읽기 전용** 게스트 조회/행수 확인을 사용했다. 열람 전후 `llm_calls`, `jobs`, `items`, `answers`, `decisions`, `citations` 행 수 불변을 확인했다. 예고편 E2E는 자체 서버 3107/3108 및 메모리 합성 데이터만 사용했다.

SQL 재현 명령 (기존 임시 설치 재사용, 네트워크·env 로드 없음):

```powershell
node scripts/verify-security-sql.mjs 'C:/Users/이주호/AppData/Local/Temp/sasu-qa-db-331add36c77142e9b2e8f09b0ad3d79d'
$env:E2E_BASE_URL = 'http://127.0.0.1:3112'
npm run e2e -- tests/e2e/guest.spec.ts tests/e2e/team-coverage.spec.ts --output=test-results/security-guest
```

하니스 최종 출력:

```json
{"passed":67,"failed":0,"matrix":{"organizations":4,"departments":12,"actors":24,"items":72,"assertions":2016},"database":"isolated PGlite","excluded":["0004_worker_cron.sql (pg_cron/pg_net not available)"]}
```

증거: [게스트 데스크톱](security-guest-1440.png), [게스트 모바일](security-guest-390.png). 각 E2E의 세부 산출물은 `test-results/security-guest/`에 있다(ignored, 다음 실행 시 교체 가능).

## 쓰기 경계 표의 의미와 한계

모든 public 테이블을 열거해 anon/authenticated의 INSERT·UPDATE·DELETE에 대해 테이블/컬럼 GRANT와 허용 RLS 정책이 함께 열려 있는 표면을 고정했다. anon 쓰기 표면은 0개. authenticated의 기존 허용 표면은 다음과 같다:

| 명령 | 기존 허용 표면 |
|---|---|
| INSERT | agent_roles, answers, document_summaries, meetings, sources |
| UPDATE | agent_roles, document_summaries, members(동의·Slack 연결 3컬럼만), sources |
| DELETE | document_summaries, sources |

이는 **각 테이블의 모든 값 변경이 안전하다는 판정이 아니다**. 세부 RLS·트리거 검증은 기존 행위 테스트로 수행한다. 특히 document_summaries의 넓은 기존 쓰기 정책은 이번 두 건 수정 범위에 포함되지 않으며 후속 보안 검토 대상이다. 새 단계가 테이블을 추가하면 기대 표도 명시적으로 검토해야 한다.

## 다음 게이트

- `phases/8-security-hotfix/step1.md`: 사용자가 승인한 환경에서 실제 업로드·세로 슬라이스·권한·역할 E2E. 이들은 DB 쓰기와 LLM/워커 실행을 포함하므로 이번에는 실행하지 않았다.
- 승인 및 검증 후 **0025만** 운영 DB에 반영. 운영 적용 전 코드의 업로드 경로와 마이그레이션을 함께 점검한다.
- phase9~12는 아직 미구현이며 step 파일도 Claude에서 인계되지 않았다. phase7 기존 메타버스형 합성 체험은 그대로 유지한다.
- commit, push, 배포, 운영 마이그레이션, 실제 조직 예고편 발행은 수행하지 않았다.
