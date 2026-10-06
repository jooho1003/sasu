# Graft 단계별 게이트 면제 결정 (2026-10-05)

## 1. 면제 결정

**날짜:** 2026-10-05
**결정자:** 사용자 (원티드 챌린지 제출 검증)
**사유:** Docker 장애 당시 미생성된 단계별(step 0~7) Graft 전후 그래프를 현재 상태에서 정확히 재구성할 수 없음

**결정 내용:**
- 원래 계획: `docs/01-plan/features/recording-ux.plan.md` §4.1 "Definition of Done"에 "step 0~8 `completed` (Graft 전후 결과 포함)"이 필수 게이트
- 실제 상황: phase 33 전체 코드가 `122b88d` 한 번의 커밋으로 병합되어, 단계별 Graft 스냅샷을 사후에 재생성할 수 없음
- 면제 방안: step 0~7을 `completed`로 표시하고, phase-level Graft 결과(before/after)를 단계별 그래프의 대체 증거로 제출

---

## 2. 단계별 그래프 재구성 불가능한 이유

### 2.1 커밋 구조
- **phase 23 step 4-B** (녹음 전사 정확도)와 **phase 33** (녹음 화면 UX)의 모든 구현이 하나의 커밋 `122b88d`에 포함됨
- 하네스 실행 중 각 step 완료 후 `git add -A && git commit`을 사용하지 않고 수동 커밋 방식으로 진행
  (사유: 이 시점 다른 phase의 미커밋 변경 보존 필요, `precondition` 참조)

### 2.2 Docker 장애 타이밍
- step 0~7 진행 중 Docker 컨테이너 `sasu-retention-graft-20260924`가 불가능 상태
- 각 step 완료 후 스냅샷을 생성할 수 없었고, step 요약에만 수동 관계 기록 (graft-s0-{before,after}.txt 등) 남김
- step 8 (최종 검증 단계)에서 Docker 복구 후 한 번의 최종 Graft 실행 (graft-plan.txt, graft-s8-after.txt)

### 2.3 사후 재구성 불가능성
- `122b88d^` (부모)와 `122b88d` 커밋만 존재
- step 0~7의 중간 상태가 git 히스토리에 없음
- 현재 시점에 "step 1 완료 후 상태"의 워크트리를 만들 수 없음 (커밋 경계가 없기 때문)
- Graft 출력의 before/after 차이는 단계 분해를 반영하지 않음

---

## 3. 대체 증거

### 3.1 기존 계획 그래프 (Planning)
```
파일: docs/01-plan/features/recording-ux.plan.md
내용: 설계 단계 Graft 기반 계획
  - 8개 step의 범위와 파일 영향도
  - 각 step별 예상 코드 관계
  - 실행 순서와 의존성
```

### 3.2 step별 수동 관계 기록 (Manual Snapshot)
```
파일: docs/verification/recording-ux-2026-09-29/graft-s{0..7}-{before,after}.txt
내용: 각 step의 코드 변경 범위를 수작업 리뷰한 기록
  - Modified file list
  - Related function/component count
  - Expected edge changes
```

### 3.3 최종 Graft 결과 (Final Snapshot)
```
파일: docs/verification/recording-ux-2026-09-29/graft-s8-after.txt
내용: phase 33 구현 완료 후 전체 프로젝트 상태
  - 전체 노드: 2,912 → 3,025 (+113)
  - 전체 엣지: 7,352 → 7,636 (+284)
  - 함수 추가: +71개
  - 파일 추가: +24개
```

### 3.4 phase-level before/after (신규 생성)
```
파일: docs/verification/recording-ux-2026-09-29/graft-phase-before.txt
      docs/verification/recording-ux-2026-09-29/graft-phase-after.txt
내용: commit b5b04d8 (before) vs 122b88d (after) 전체 비교
  - 동일한 Graft 빌드 도구와 환경 (Docker container, @nanonets/graft@0.19.0)
  - 변경 파일 176개
  - 코드 관계 및 영향 범위 정량화
```

### 3.5 구현 검증 기록
```
디렉토리: docs/verification/recording-ux-2026-09-29/
포함 내용:
  - README.md: 검토 기록 및 테스트 결과
  - step8.summary.md: 최종 검증 요약
    · unit 151 파일, 1,664 cases
    · 합성 녹음 E2E 20 통과, 1 skip
    · 검토 UI E2E 27 통과
    · 로컬 제품 E2E 9/9 통과
  - 캡처 및 검증 스크린샷 (s1~s8 화면)
  - 키보드 흐름 및 접근성 테스트 (keyboard-recorder.spec.ts)
```

---

## 4. 대체 증거의 한계 및 검증 불가 범위

### 4.1 단계별 설계 대비 구현 일치율 검증 미충족
- 원래: 각 step에 대해 "step 설계 → step 구현 → Graft 검증" 3단계 체크
- 현재: step 0~7의 설계 대비 구현을 Graft로 다시 검증할 수 없음
- 미충족 항목: `/pdca analyze recording-ux` 시 step별 추적 미완료
  (현재: phase 전체 분석만 가능, step 단위 비교 불가)

### 4.2 중간 상태의 코드 관계 추적 불가
- "lib/recording/recorder-copy.ts 구현 후 다른 모듈과의 호출 관계" 검증 불가
- step 3 (step 표시·폐기 분리) 직후의 컴포넌트 그래프 불가
- 각 step이 실제로 영향을 미친 엣지 범위를 정량화할 수 없음

### 4.3 규제·감사 용도로 부족할 수 있음
- "각 단계의 변경이 독립적이고 사이드 이펙트 없는지" Graft로 입증 불가
- 금융/보안 도메인에서 단계별 검증을 요구할 경우, 이 면제는 부족함
- 원티드 챌린지 기술심사: 개발 절차 투명성 채점에서 "도구 실패"로 기록될 수 있음

### 4.4 향후 반복 불가능
- 같은 구조 (한 번의 큰 커밋에 여러 단계)가 재현되면, 사후 검증은 여전히 불가능
- Graft 도구 재실행 불가능성이 고착되지 않으려면, 다음 phase부터 step별 커밋 강제 필요

---

## 5. 검증 기록 및 링크

| 항목 | 상태 | 위치 |
|---|---|---|
| Plan (계획 단계 Graft) | ✓ 완료 | `docs/01-plan/features/recording-ux.plan.md` |
| Design 문서 | ✓ 완료 | `docs/02-design/features/recording-ux.design.md` |
| step 0~7 수동 기록 | ✓ 보존 | `docs/verification/recording-ux-2026-09-29/graft-s{0..7}-*.txt` |
| step 8 최종 Graft | ✓ 생성 | `docs/verification/recording-ux-2026-09-29/graft-s8-{before,after}.txt` |
| Phase-level Graft | ✓ 신규 생성 | `docs/verification/recording-ux-2026-09-29/graft-phase-{before,after}.txt` |
| Unit test | ✓ 1,664 통과 | `npm run test` |
| E2E (합성) | ✓ 20/21 통과 | `tests/e2e/recording-product.spec.ts` |
| E2E (검토 UI) | ✓ 27/27 통과 | `tests/e2e/recording-controls.spec.ts` |
| 최종 검증 | ✓ 기록 | `docs/verification/recording-ux-2026-09-29/step8.summary.md` |

---

## 6. 결론

**면제 승인:** `yes`

**사용자 결정 사유:**
- phase 33 구현 전체가 한 번의 커밋으로 병합되어 단계별 Graft 재구성 불가능
- 대체 증거: 계획 그래프 + step별 수동 기록 + phase-level Graft + 검증 테스트 기록
- 실제 기능 (녹음·검토·권한) 검증은 완료 (unit 1,664 + E2E 47/48 통과)
- 원티드 AI Championship 기술심사 제출 일정: 2026-09-20 → 2026-10-05 승인

**다음 phase 개선사항:**
- step별 커밋 강제 (phase 33 이전에 사후 회고로 반영 불가)
- 장기: Graft 빌드의 사전 실행 타이밍 조정 (step 병합 → 즉시 graft build, 사후 재실행 최소화)

---

**생성 날짜:** 2026-10-05
**Graft 버전:** @nanonets/graft@0.19.0
**대체 증거 환경:** Docker container `sasu-retention-graft-20260924`, node:22-bookworm
