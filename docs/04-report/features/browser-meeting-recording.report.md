# browser-meeting-recording Completion Report

> **Status**: Partial · **Project**: sasu 0.1.0 · **Date**: 2026-09-29 · **PDCA**: browser-meeting-recording (phase 23 step4-A·0~3)
>
> 범위 원천은 [PRD §3-4·§8·§11](../../PRD.md)과 [웹 회의 녹음 설계](../../planning/웹회의_녹음_설계.md)다. 이 보고서는 새 결정을 담지 않는다.

## Executive Summary

설계 일치율은 **96%**다([분석 v1.2](../../03-analysis/browser-meeting-recording.analysis.md)). 유일한 Important 차이였던 G-1(한 탭 판정에 IndexedDB lease가 남음)은 `659f131`에서 고쳤다. 실행한 검증 607건이 모두 통과했다(skip 1 제외). 실제 기기 V01~V06, 정확률·보안 V13~V20, 운영 DB 반영과 배포가 남아 있어 phase 23은 완료가 아니다. 일치율과 완료 판정은 별개다.

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | 웹 직접 회의 녹음 → 구간 원본 검증 → 전사 검토·확정 |
| Start Date | 2026-09-17 (Plan Plus 설계) |
| End Date | 2026-09-29 (이번 PDCA 범위의 분석·보고) |
| 구현 커밋 | `374faf5`(step0) · `176320c`(step1) · `5ea2952`(step2 일부) · `d52c002`(녹음 화면·심사 데모) · `113a703`(Archify) · `659f131`(G-1) |

### 1.2 Results Summary

```
┌─────────────────────────────────────────────┐
│  Design Match Rate: 96% (analysis v1.2)      │
├─────────────────────────────────────────────┤
│  ✅ 충족:     7 / 7 판정 가능 묶음 (v1.1)     │
│  ✅ V12:      낡은 ASK 테스트 수정 완료 (v1.2) │
│  ⏸ 게이트:   V01~V06 실제 기기 · V13~V20      │
└─────────────────────────────────────────────┘
```

### 1.3 Value Delivered

| Perspective | 실제 결과 |
|---|---|
| **Problem** | 대면·온라인 회의 내용을 파일 작업 없이 남기고, 녹음 도중 끊겨도 확인된 구간은 잃지 않아야 한다(REC-01~03). |
| **Solution** | 서버 녹음 세션을 먼저 만들고 키를 받은 뒤에만 브라우저에 암호화해 저장한다. PCM을 독립 WAV 구간으로 나눠 INSERT로만 올리고, 서버가 모든 구간을 검증한 뒤 전사를 한 번만 예약한다(ADR-056·070). |
| **Function/UX Effect** | 단위·route 1,624, 격리 SQL 277(권한 조합 2,016), 합성 브라우저 21 통과·1 skip, 실험실 UI 13, 로컬 제품·데모 E2E 8/8. 합성 음성으로 로그인 → 녹음 → 저장 → 구간 검증 → Groq 전사 → 확정 → 인용 있는 요약까지 이어졌고 CSP 위반은 0건이었다. |
| **Core Value** | 권한·동의·원본 검증을 거친 회의 기록이 결정·질문의 근거가 된다. 심사위원 데모는 60초 메모리 녹음을 서버·DB·LLM 없이 체험한다(REC-05, V11). 실제 마이크와 Meet·Zoom 탭 소리는 아직 확인하지 않았다. |

## 1.4 Success Criteria Final Status

Plan에는 성공 기준 표가 없다. 그래서 design Context Anchor의 SUCCESS(상세 설계 V01~V21)를 기준으로 삼았다.

| 묶음 | 상태 | 근거 |
|---|:---:|---|
| V01~V06 실제 기기 | ⏸ 사람 게이트 | 이번 범위 밖, 설계상 사람이 판정 |
| V03·V05·V06 합성 입력 | ✅ | `e2e:recording` 21 통과 · 1 skip. 트랙 정리, 3분 새로고침 복구, quota, 두 탭, 복호화 실패, 6초 메인 스레드 정지 |
| V07·V10·V21 SQL | ✅ | 격리 SQL 277 통과. attempt 이동, 완료 1회, 만료 sweep, 폐기 파기 |
| V08·V17 접근권 | ✅ | `e2e:review-controls` 13 통과, SQL "segment tickets". 구간 재생·61회 제한·내려받기 게이트 |
| V09 권한 우회 | ✅ | SQL 권한 행렬(조합 2,016) |
| V11 데모 | ✅ | `demo-meeting-recorder.spec.ts` 2 통과. 로컬 DB·Storage·jobs·llm_calls 증가 0 |
| V12 회귀 | ✅ (v1.2) | 2026-09-30 현재 작업 트리 스냅샷에서 unit 1,704 · 자료 검토(음성·문서) 4/4 · 문서·VTT 업로드 경계 6/6 · 권한 인지 답변 1/1. 낡은 `ask-permission.spec.ts`는 v1.2에서 검토함 → 확정 흐름으로 고쳐 8/8·반복 2/2 통과([기록](../../verification/browser-meeting-recording/v12-regression-20260930.md)) |
| V13~V20 정확률·보안 | ⏸ | step4-B는 다른 세션이 진행 중. V13 제공사 확인·V14 CSP 강제는 사람 게이트 |

**Success Rate**: 판정 가능한 7묶음 중 v1.0 6 충족 · 1 부분(86%) → v1.1 7 충족(100%, V12 조건부) → v1.2 조건 해소. 전체 V01~V21 기준으로는 완료 판정을 내리지 않는다.

## 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|---|---|:---:|---|
| ADR-056 | 웹 직접 녹음, PCM → 독립 WAV 구간, 공유 음성이 없으면 컴퓨터 소리 모드는 시작하지 않음 | ✅ | 합성 입력으로 구간 저장·복구 확인 |
| ADR-070 결정 1~4 | 시작할 때 세션, 키 거부 조건, fingerprint 저장, INSERT 전용 구간 업로드·attempt+1 | ✅ | SQL 277·route 테스트 통과 |
| ADR-070 결정 5 | 전사 창은 메모리에서 조립, `parts/` 저장 없음 | ✅ | `review_storage_allowed`가 `parts/`·`windows/` 쓰기 거부 |
| ADR-070 결정 6 | 구간당 접근 허가 1건, 60초 단회 접근권, 분당 60건 | ✅ | 61번째 요청 거부 확인. 관리자 화면의 구간 묶음 표시는 불확실(U-1) |
| ADR-070 결정 8 | 스위치가 꺼지면 새 시작·키·저장·업로드 거부 | ✅ | SQL·제품 E2E |
| ADR-070 "영향" | `revoke_participant_reviews`·`queue_review_part` 교체 | ⚠️ 문서 차이 | 실제로는 trigger `members_revoke_recordings`와 `private.review_original_available` 교체로 대체됐다. SQL "consent withdrawal" 통과. 문서 정정 대기(D-1) |
| 설계 §4.2 | 한 탭 녹음은 Web Locks(`ifAvailable`)로만 판정 | ✅ (v1.1) | G-1 해결. `BroadcastChannel`·`capture_lease_lost`·heartbeat 0건, 옛 lease DB는 정리 때 삭제 |

## 2. Related Documents

| Phase | Document | Status |
|---|---|---|
| Plan | [browser-meeting-recording.plan.md](../../01-plan/features/browser-meeting-recording.plan.md) | ✅ 어댑터 (원천 PRD·상세 설계) |
| Design | [browser-meeting-recording.design.md](../../02-design/features/browser-meeting-recording.design.md) | ✅ step4-B 절 + 구현 대조 목록 병합 |
| Check | [browser-meeting-recording.analysis.md](../../03-analysis/browser-meeting-recording.analysis.md) | ✅ v1.2, 96% |
| Act | [step0-capture-lock-20260929.md](../../../phases/23-browser-meeting-recording/step0-capture-lock-20260929.md) · [실행 기록](../../verification/browser-meeting-recording/capture-lock-20260929.md) | ✅ `659f131` |
| L3 | [l3-20260929/README.md](../../verification/browser-meeting-recording/l3-20260929/README.md) | ✅ 8/8 |
| Report | 현재 문서 | ✅ |

## 3. Completed Items

### 3.1 기능

| 범위 | 내용 | 근거 |
|---|---|---|
| step0 | PCM 단절·워커 무응답 감지, AES-GCM/IndexedDB 사전 검사, 새로고침 복구 | `374faf5`, 합성 브라우저 |
| step0 후속 | 한 탭 판정을 Web Locks 하나로 정리, 옛 lease DB 삭제 | `659f131` |
| step1 | 녹음 세션(0059), 구간 원본 저장·서버 검증·1회 완료·전사 창·구간 접근권·파기(0060), 0061·0062 이어서 녹음·프로필 | `176320c`, SQL 277 |
| step2 | 녹음 화면, 5초 입력 테스트, 구간 재생·재시도, 검토 화면 연결 | `5ea2952`·`d52c002` |
| step3 | 심사위원 60초 메모리 녹음 데모(fetch·Supabase·IndexedDB·LLM 0) | `d52c002`, V11 |
| step4-A | CSP 요청별 nonce 렌더링, 원본 보존 검증(기본 Report-Only) | `8e3c96a` |

### 3.2 불변식·CRITICAL 규칙

불변식 30~34와 설계 §4.2가 모두 ✅다. 요청 경로(`app/api/d/**`)에서 `lib/supabase/service`를 import하는 곳은 0건이고, 게스트 데모는 쓰기·LLM 호출이 없다. 근거는 분석 §2.4에 있다.

## 4. Incomplete Items

### 4.1 이어서 할 일

| 항목 | 이유 | 선행 조건 |
|---|---|---|
| V01~V06 실제 기기(마이크·Meet/Zoom 탭 소리) | 사람이 판정하는 게이트 | 실제 기기 세션 |
| ~~`ask-permission.spec.ts` 재작성, `upload-boundaries.spec.ts`의 파일럿 시드 이름 고정 제거~~ | 완료(v1.2) | — |
| ~~`reviewed-materials.spec.ts:184` 문구 수정 커밋~~ | 완료(`a1410a3`) | — |
| V13~V20 정확률·보안(CSP 강제, 제공사 확인, 실제 모델 지시문 문서, 정량 실측) | step4-B1~B8 로컬 구현은 `122b88d`로 커밋. V13·V14·V16·V20은 사람·운영 게이트 | 실제 기기·제공사 확인 |
| ~~운영 DB 0058~0064 적용, 운영 배포~~ | 완료(2026-09-30, 조직 녹음 스위치 꺼짐, [기록](../../verification/recording-production-2026-09-30/README.md)) | — |
| ~~phase 23 `index.json`에 capture-lock 기록~~ | 완료(`122b88d`) | — |
| ~~문서 정정 D-1~D-5~~ | 완료(`122b88d`, D-3는 2026-09-30) | — |

### 4.2 판정 보류 (신뢰도 < 80%)

U-1 관리자 접근 기록의 구간 묶음 표시 · U-2 `reextract` 뒤 `kickWorker()` 미호출 · U-3 키 404일 때 완료 이동 경로 · U-4 클라이언트 `Session.state`에 `revoked` 없음. 분석 §3을 보면 된다. 결함으로 확정하지 않았다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | v1.0 | Final (v1.2) |
|---|:---:|:---:|
| Structural | 97% | 100% |
| Functional | 93% | 93% |
| Contract | 89% | 89% |
| Runtime | 100% (599) | 100% (607) |
| **Overall** (15/25/25/35) | 95% | **96%** |
| Critical 차이 | 0 | 0 |

### 5.2 Resolved Issues

| Issue | Resolution | Result |
|---|---|---|
| G-1 heartbeat 쓰기 실패나 5초 넘는 타이머 정지가 `capture_lease_lost`로 녹음을 끊음 | lease·BroadcastChannel·heartbeat 제거, release를 한 번만 동작하게 함, 실행 공백은 `capture-watchdog`가 계속 감지 | ✅ `659f131` |
| D-6 분석 도중 design 문서가 step4-B 29줄로 교체됨 | step4-B 절은 두고 "구현 대조 목록" 절을 병합 | ✅ |
| L3 미실행 | `659f131` worktree + 로컬 `review-qa`에서 8/8 | ✅ |

## 6. Lessons Learned

### 6.1 Keep

- 다른 세션의 미커밋 변경이 있을 때 HEAD에서 딴 격리 worktree로 검증했다. 커밋과 검증 기록이 섞이지 않았다.
- 정적 분석이 "철회 테스트 없음"으로 본 항목을 SQL 하니스 실행으로 다시 판정했다(분석 §4). 실행 근거가 정적 추정보다 정확했다.

### 6.2 Problem

- 여러 세션이 같은 bkit 문서(design)를 동시에 고쳐 분석 기준이 도중에 바뀌었다.
- worktree에서 `node_modules`를 junction으로 이으면 Turbopack이 "points out of the filesystem root"로 build를 거부한다. `npm ci`로 따로 설치해야 했다.
- `e2e:recording`·제품 E2E는 `docs/verification/`의 기존 스크린샷·JSON을 다시 쓴다. 다른 세션의 같은 파일과 부딪혀 매번 되돌리거나 옮겨야 했다.
- 로컬 `review-qa`에 번호 정리 전 migration 이름이 남아 있어 `setup`이 멈췄다. 함수 본문을 비교한 뒤 적용 기록만 보정했다.

### 6.3 Try

- bkit 문서 하나는 한 세션만 쓴다. 동시 작업이면 절 단위로 담당을 먼저 나눈다.
- E2E 기록 경로를 실행 폴더별로 받게 해 기존 기록 덮어쓰기를 없앤다.

## 7. Next Steps

1. ~~다른 세션 커밋 뒤 phase 23 `index.json` 기록 → D-1~D-5 정정~~ 완료(v1.2)
2. ~~V12 ASK·VTT E2E 실행~~ 완료(v1.1). ~~낡은 ASK 테스트 재작성~~ 완료(v1.2)
3. 실제 기기 V01~V06 → 조직 녹음 스위치 켜기(운영 DB·배포는 2026-09-30 완료)
4. step4-B 완료 뒤 V13~V20을 반영해 `/pdca analyze browser-meeting-recording` 재실행

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 1.0 | 2026-09-29 | 완료 보고(부분) 작성. analysis v1.2 기준 | wadelee1005@gmail.com |
| 1.1 | 2026-09-30 | V12 회귀 E2E 반영(analysis v1.4) | wadelee1005@gmail.com |
| 1.2 | 2026-09-30 | 커밋·문서 정정·V12 조건 해소 반영(analysis v1.5) | wadelee1005@gmail.com |
| 1.3 | 2026-09-30 | 운영 반영(DB 0058~0064·코드, 조직 스위치 꺼짐) | wadelee1005@gmail.com |
