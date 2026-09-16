# 자료 검토 편집·부분 실패 복구 검증

2026-09-17 · phase 22 · ADR-054의 기존 설계 보완. 이 문서는 개발 검증 기록이며, 같은 날 후속 [운영 반영 기록](../reviewed-materials-production-2026-09-17.md)에 배포 결과를 남겼다.

## 범위와 재현

- 원본만 삭제하는 `review_action(delete_original)`은 저장한 전사와 버전을 유지한다. 화면의 공통 `command()`가 뒤이어 `load(true)`를 호출해 미저장 제목·구간을 지우는 경로를 확인했다.
- API는 일부 구간의 timeout을 `review.status=failed`로 표시한다. 화면은 부모 상태가 processing/uploading일 때만 폴링해 다른 구간이 queued/processing이어도 진행 확인을 중단했다.
- 처리 중단 뒤 늦게 도착한 이전 조회가 최신 상태를 덮어쓰고 폴링을 다시 시작하는 경로를 재현했다.
- 저장 요청 중에는 기존 코드도 입력을 비활성화한다. 해당 잠금은 신규 구현이나 결함으로 기록하지 않는다.

## 코드 관계와 도구

수정 전 실제 파일을 읽어 `ReviewDetail.load/command/save` → `/api/d/[dept]/reviews/[id]`의 세션 조회·RPC → `0034_reviewed_materials.sql`의 `save_review/review_action` 관계를 확인했다. `review_action(delete_original)`은 편집 revision을 증가시키지 않고, `save_review`가 편집 기준 revision과 현재 revision을 비교한다.

Graft·Archify는 제공된 도구 목록과 `Get-Command graft,archify`에서 찾지 못해 실행하지 않았다. 두 도구의 그래프·시각화 산출물은 누락이다. 이번 변경은 기존 클라이언트 상태 갱신이며 서비스 구조·API 계약·SQL·권한 판정은 바꾸지 않는다. Next.js 스킬과 설치된 Next.js 16.3.4의 Server/Client Components·Playwright 문서를 확인했다.

## 검증 환경

로컬 `review-qa` Supabase의 합성 부서장 세션으로 로그인한다. 편집 복구 브라우저 테스트의 자료 조회·변경 API는 합성 fixture로 대체해 실패·지연 순서를 통제한다. 이 테스트는 실제 Storage 삭제나 SQL 버전 충돌 검증을 대신하지 않는다. 기존 실제 연동 기록은 [phase 20/21 기록](../reviewed-materials-2026-09-16/README.md)을 참조한다.

## 수정 결과

- 원본 삭제·처리 중단 뒤에는 상태만 다시 확인하고 미저장 제목·구간과 `editorRevision`을 유지한다. 명시적인 새 추출문 교체·초안 저장·편집 취소 때만 편집값을 다시 불러온다.
- 부모 상태뿐 아니라 queued/processing 구간도 확인한다. 부분 실패 중 남은 처리를 계속 조회하고 전체 종료 시 멈춘다.
- 조회 순번으로 최신 요청보다 오래된 응답을 무시한다. 다음 자동 조회는 이전 조회가 끝난 뒤 3초 후 예약하므로 느린 응답이 겹치거나 서로 무효화하지 않는다. 수동 상태 확인도 작업 중 중복 클릭을 막는다.
- 현재 부서·동의·RLS·버전 비교는 기존 세션 API/SQL이 그대로 집행한다. 새 모듈·API·마이그레이션·LLM 호출은 추가하지 않았다.

수정 후 `load()` 호출자를 다시 확인했다. 최초 조회·진행 폴링·재시도는 미저장 편집을 보존하고, `command()`는 명시적 추출문 교체만 강제 갱신한다. `save()`·편집 취소의 기존 강제 갱신은 유지한다.

## 실제 실행 결과

| 명령 | 결과·증거 |
|---|---|
| 수정 전 `node scripts/review-qa.mjs test tests/e2e/review-state-recovery.spec.ts --grep '검토 복구'` | 5개 모두 예상 동작과 불일치. [실패 기록](e2e-red.txt) |
| 수정 후 동일 명령, 개발 서버 | 5개 통과. [기록](e2e-dev.txt) |
| `npm run lint` | 오류·경고 0. [기록](lint.txt) |
| `node scripts/review-qa.mjs build` | Next.js production build·TypeScript 통과. [기록](build.txt) |
| `npm run test` | 82파일·1,027테스트 통과. [기록](unit.txt) |
| `node scripts/review-qa.mjs guest-test tests/e2e/review-state-recovery.spec.ts` | production 서버에서 9개 통과(검토 복구 5·게스트 4), 22.6초. [기록](e2e-production.txt) |
| `git diff --check` | 통과 |

처음 개발 서버를 열 때 컴파일 대기로 첫 테스트가 시간 초과했다. 준비된 서버에서 다시 실행해 제품 결함에 의한 실패 5개를 위 기록으로 남겼다. 첫 수정 후에는 Next.js의 route announcer와 제품 오류 패널이 모두 `role=alert`여서 충돌 테스트의 선택자가 모호했다. 제품 오류 패널을 명확히 선택하도록 바꾼 뒤 모든 시나리오가 통과했다. 최종 린트·빌드·단위 테스트는 마지막 제품 코드 변경 후 다시 실행했다.

브라우저 검증은 다음을 확인한다.

- 1440px·390px에서 원본 삭제 뒤 미저장 제목·교정·추가 메모 보존, 확정 차단, 저장 요청·새로고침 유지, 수평 넘침 없음.
- 다른 창의 새 revision을 조회한 뒤에도 기존 편집 기준 revision으로 저장 요청, 409 뒤 편집 유지, 명시적 편집 취소 후 최신 내용 읽기.
- 첫 구간 실패/둘째 구간 처리 중 → 둘째 구간 완료까지 조회 → 자동 조회 종료 및 확정 차단 유지.
- 처리 중 오래 걸리는 조회의 중복 방지, 중단 후 도착한 과거 응답 무시 및 폴링 재개 방지.
- 게스트 1440px·390px 완주, 실제 부서 접근/잘못된 Slack 서명 거부, 게스트 열람 전후 DB 행 수·LLM 호출 증가 없음.

## 화면 증거와 남은 범위

- [원본 삭제 후 편집 보존 — 1440px](draft-preserved-1440.png)
- [원본 삭제 후 편집 보존 — 390px](draft-preserved-390.png)

두 화면은 최종 production 빌드의 합성 fixture 캡처다. 실제 Slack 화면이나 운영 자료가 아니다. 이번 변경은 UI 상태 복구이므로 기존 SQL/Storage/TTS의 실제 연동 시험을 새로 수행했다고 기록하지 않는다.

이 문서 작성 시점에는 phase 20/21 및 이번 변경의 운영 DB 적용·원격 푸시·배포를 수행하지 않았다. 이후 운영 DB·앱 반영과 읽기 회귀는 [후속 기록](../reviewed-materials-production-2026-09-17.md)에서 완료했다. 부서 에이전트의 첫 업무·실행 권한과 장기 보존 정책은 기존 공동 설계 대상으로 남는다. PRD §11 전체와 사람의 D3 판정·실제 Slack 제출 캡처가 완료됐다는 뜻이 아니다.
