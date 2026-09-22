# Phase 23 step0 — 합성 입력 기술 검증

2026-09-17 / Windows / Playwright Chromium 153.0.8010.12. **부분 구현이며 step0 완료가 아니다.** PRD 1.13·ADR-057 추가 시점부터 step4-A를 우선하고 실제 입력 버튼을 제거했다.

## 구현 및 코드 관계

- `lib/recording/pcm.ts`: 정수 위상의 스트리밍 16kHz 리샘플, 1~2개 입력 혼합 이득, PCM16 → 독립 WAV. 박스 필터 방식이며 실제 음성 청취 품질·CER 검증은 남아 있다.
- `lib/recording/session.ts`: 샘플 기준 시간, 1초 체크포인트, commit 뒤 저장 확인, 일시정지/재개, 5초 backlog 중단, 저장 실패/timeout, 29분 알림·30분 자동 종료. 두 순수 모듈은 테스트 실패를 먼저 확인한 뒤 구현했다.
- `lib/recording/browser/*`: MediaStream 입력·트랙 정리, Web Audio/AudioWorklet ↔ MessageChannel ↔ Worker, IndexedDB 트랜잭션, 해시/순서 검사, 24시간 정리, Web Locks+IDB lease+BroadcastChannel. 공유 영상은 저장하지 않고 frameRate 힌트만 최소화한다.
- `scripts/recording-lab/`: localhost 개발 전용 합성 440Hz+880Hz 입력, 복구·재생·폐기 화면과 5초 메모리 전용 마이크·공유 음성 시험. 앱 라우트·제품 기능으로 연결하지 않았다.
- Worklet은 `lib/recording/browser/capture.worklet.js`이며 `new URL(..., import.meta.url)`로 로드한다. public JS 파일 없음. Vite에서 로딩 검증했고 Next 제품 화면 통합은 아직 없다.
- ARCHITECTURE §8·TDD guard는 브라우저 SDK 어댑터만 예외로 추가했다. 순수 로직은 계속 mirrored test가 필요하다.

수동으로 확인한 실행 관계:

```mermaid
flowchart LR
  Lab[개발 전용 합성 입력] --> Audio[Web Audio 혼합]
  Audio --> Worklet[AudioWorklet]
  Worklet -->|Float32 / 전용 MessagePort| Worker[저장 Worker]
  Worker --> Session[샘플 시간 / 16k PCM / 1초 단위]
  Session -->|원자적 commit| IDB[IndexedDB]
  IDB --> Recovery[순서·해시 검사 / 첫 손상에서 중단]
  Recovery --> WAV[확인 구간 WAV / 브라우저 재생]
```

Graft·Archify 도구와 CLI를 사용할 수 없었다. 실제 파일/호출자를 수동 확인한 위 기록으로 범위를 남긴다. **Graft 결과 및 Archify 생성·레이아웃 검증 결과는 없다.**

## 실행 결과

| 검증 | 결과·증거 |
|---|---|
| 전체 Vitest | 89파일, 1,076개 통과 — `vitest.txt`. 녹음 관련 순수/입력 테스트 19개 포함 |
| 훅 회귀 | `py -3 -m pytest scripts/test_hooks.py -q`, 29개 통과 — `hooks.txt` |
| ESLint / Next 프로덕션 빌드 | 통과 — `lint.txt`, `build.txt` |
| 녹음 E2E 전체 | `$env:E2E_RECORDING_REALTIME='1'; npm run e2e:recording`, 8개 통과 — `recording-e2e.txt` |
| 최종 합성 전용 UI 회귀 | `npm run e2e:recording`, 7개 통과·3분 테스트 1개 옵션 skip — `recording-final-e2e.txt` (3분 실행은 위 전체 로그에 있음) |
| 실제 3분 합성 캡처 후 새로고침 | 180,700ms, 2,880,000개 저장 샘플 / 180개 체크포인트 복구, interrupted 표시 — `realtime-recovery.json`, `realtime-recovery.png` |
| 가속 30분 저장 | 48kHz 입력 → 28,800,000개 PCM 샘플, 1,800개 체크포인트, 불일치 0, 단일 체크포인트 최대 32,000B, 29분 경고·30분 종료 — `endurance.json` |
| 메모리 | 위 가속 테스트의 GC 후 JS heap 증가 약 130KB. 브라우저 전체 RSS나 실제 30분 기기 녹음 메모리 측정이 아니다 |
| 복구/오류 | 브라우저 IDB 실제 commit·reload·손상·누락·중복·잘못된 순번·두 탭·다른 사용자·24시간 정리·트랜잭션 abort 검증 |
| 재생 | 복구 WAV에 HTMLAudioElement.play() 성공, media error 없음 — `synthetic-recovery.png`. 사람의 실기기 청취 시험은 하지 않았다 |
| 기존 SQL 회귀 | 격리 PGlite 156개 + 권한 행렬 2,016개 통과 — `sql.txt`. pg_cron/pg_net 제외, 운영 DB 적용 없음 |

실행 중 기존 dev 서버가 `.next` 산출물을 재생성해 prod smoke 서버의 파일이 사라졌다. `SASU_VERIFY_BUILD=1`일 때 `.next-verify`를 쓰도록 분리했고 기본 개발 빌드는 `.next`를 유지한다. 기존 사용자 dev 서버는 종료하지 않았다.

SQL 하니스는 최신 0036 적용 후 예전 0026 down으로 private schema를 지우려다 실패했다. rollback 시험을 0028 직후의 트랜잭션 안으로 옮겨 당시 계약을 검증하고 rollback한 뒤 최신 스키마 전체 검증을 계속한다. migration·운영 DB를 바꾸지 않았다.

## 미충족 게이트

- V01~V06 실제 Windows Chrome/Edge의 마이크·Meet 탭·Zoom 공유 소리, 기기 분리·권한 거절 UI·절전·브라우저 프로세스 강제 종료 검증이 남았다. Track ended/권한 거절은 합성 이벤트·mock 테스트로만 확인했다.
- 실제 30분 경과 녹음·앞/뒤 청취·CER, background 장치 동작·wake lock·입력 프로파일은 미검증/미구현이다.
- IDB 체크포인트의 AES-GCM 암호화와 서버 HKDF 키 파생은 구현했다. 다만 캡처 시작 전 녹음 세션 생성 계약과 폐기 뒤 키 재발급 거부의 제품 흐름이 확정되지 않아 실제 입력을 IDB에 저장하지 않는다. 자동 테스트는 실제 대화·LLM·서버 업로드를 사용하지 않았다.
- step4-A DB 보호, step1 구간 원본·키 발급·RLS, step2 제품 UI, step4-B 정확률, step3 데모 통합은 남아 있다. 서버 업로드 구현으로 진행 가능한 완료 판정을 내리지 않았다.

## 2026-09-20 SEC-06 암호화·실기기 입력 시험 준비

### 구현

- `lib/recording/checkpoint-crypto.ts`: 32바이트 키만 허용하고, 녹음별 64비트 난수 prefix와 big-endian 32비트 순번으로 AES-GCM nonce를 만든다. 사용자·부서·녹음 ID·순번·샘플 수를 additional data로 인증한다.
- `lib/recording/browser/storage.ts`: DB version 1의 합성 평문 PCM 저장소를 version 2 전환 시 폐기한다. 새 chunk에는 `sampleCount`와 `ciphertext`만 저장하며 복구 시 인증 실패가 난 첫 구간에서 중단한다.
- `lib/recording/recording-key.ts`: `RECORDING_KEY_SECRET`과 녹음·사용자·부서 ID를 HKDF-SHA256으로 묶어 256비트 키를 파생한다. 서버는 파생 키를 저장하지 않는다.
- `supabase/migrations/0052_recording_key_context.sql`: 녹음 입력 방식·원본 배치·제한된 캡처 메타데이터·동의 확인자를 추가하고, `review_editor()`·조직 스위치·현재 참여자 동의·생성자·상태를 검사하는 `recording_key_context()`를 추가했다.
- `POST /api/d/[dept]/recordings/[id]/key`: 세션 부서장·동의와 SQL 반환 context를 다시 맞춘 뒤 no-store base64url 키를 반환한다. 요청 본문의 사용자·부서 값은 받지 않는다.
- 개발 실험실에 `마이크 5초 시험`·`공유 음성+마이크 5초 시험`을 추가했다. 입력은 메모리 analyser에서 RMS만 계산하고 5초 뒤 모든 audio/video track을 정지한다. PCM·영상·장치 ID를 IDB·네트워크·로그에 남기지 않는다.

### TDD·검증

| 실행 | 결과 |
|---|---|
| 신규 암호화·키 테스트를 구현 전 실행 | 모듈 없음으로 2 suite 실패(red) |
| `npx vitest run tests/recording-key-route.test.ts tests/recording/checkpoint-crypto.test.ts tests/recording/recording-key.test.ts` | 3파일 10개 통과 |
| `npm run e2e:recording` | 7개 통과, 실제 3분 합성 시험 1개 옵션 skip. 암호문 크기·손상·새로고침·30분·두 탭·transaction abort 확인 |
| `npm test` | 136파일 1,329개 통과 |
| `npm run lint` | ESLint·문구 차단 0, 기존 검토 경고 77개 |
| `npm run build` | Next.js 16.3.4 프로덕션 빌드·타입 검사 통과, 신규 키 route 확인 |
| 임시 PGlite 0.5.8로 `node scripts/verify-security-sql.mjs <temp>` | migration 0052 적용 포함 237개 시나리오·권한 행렬 2,016개 통과. `pg_cron`·`pg_net`만 하니스 지원 범위 밖 |
| Windows Chrome 실제 마이크 5초 시험 | 5,026ms, 오디오 트랙 1개, peak RMS 0.0024, 신호 감지 성공. 저장·전송 0건 |

Graft·Archify 실행 파일/연결 도구는 이번 환경에도 없었다. 상세 설계 §4·§5·§13의 흐름과 `capture → storage.worker → storage → checkpoint-crypto`, `route → membership → recording_key_context → recording-key` 호출 관계를 직접 확인했다. 도구 결과와 Archify 렌더링·레이아웃 검증 결과는 없다.

### 현재 차단점

- Windows Chrome 마이크 5초 시험은 통과했다. 공유 음성+마이크 시험은 화면 공유 선택창에서 사용자가 소리가 있는 탭/창과 `탭 오디오 공유`를 선택하기를 기다린다.
- 상세 설계는 녹음 ID로 키를 발급하도록 했지만, manifest가 완성되기 전 녹음 세션 ID를 언제 영속 생성하는지 정의하지 않았다. 폐기 뒤 키 재발급을 막으려면 `reviewed_materials` 생성 전의 캡처 세션 또는 생성/finalize 2단계 계약을 PRD·ADR에서 먼저 확정해야 한다.
- migration 0052는 격리 PGlite 전체 보안 하니스에는 적용해 회귀를 통과했지만, 로컬 Supabase·운영 DB에는 적용하지 않았다. 실제 세션/RLS 검증 전에는 배포하지 않는다.
