# 녹음 원본 구간 처리 — 2026-09-25

Phase 23의 [step1-A 명세](../../../phases/23-browser-meeting-recording/step1a-original-segments.md)에 따라 순수 원본 처리 모듈과 개발 실험실 검증을 구현했다. 원천은 PRD §3-4 REC-03·04, §8과 [상세 설계 §4.3·§5](../../planning/웹회의_녹음_설계.md)다. 제품 화면·서버 세션·RLS·Storage 업로드·검증 job 연결과 실제 기기 게이트는 완료하지 않았다.

## 구현

- `lib/contracts.ts`: `RecordingOriginalSegment`와 `RecordingManifest`를 단일 Zod 스키마로 정의했다. 순번 0~29·빈틈 없는 순서·마지막 외 60초·30분·64MiB·정확한 WAV 바이트 수·소문자 해시를 검사한다. 경로·부서·작성자 등 추가 필드는 거부한다. 기존 50MiB 파일 업로드 제한은 그대로다.
- `lib/recording/original-segments.ts`: 1초 체크포인트를 최대 60초 독립 WAV로 순차 변환한다. 전체 원본을 모으지 않고 하나씩 반환하며, 소비자가 중단하면 원본 iterator도 닫는다. 중간 누락·중복·짧은 체크포인트 뒤 추가 데이터·30분 초과는 거부한다.
- canonical manifest는 상세 설계 §5.1.1에 명시한 정확한 UTF-8 바이트로 해시한다. JSON 키 순서는 영향을 주지 않는다. 준비 함수는 처음 확인한 연속 샘플 수와 실제 변환 결과를 비교하여 읽기 중 손상·만료로 짧아진 기록을 완료로 표시하지 않는다.
- `verifyRecordingOriginal`은 RIFF 크기·fmt 크기·PCM 형식·채널·샘플 레이트·byte rate·block align·bits·data 길이·실제 바이트 수·샘플 수·SHA-256을 모두 검사한다. 선언된 해시가 맞아도 잘못된 WAV 헤더는 거부한다.
- `createRecordingTranscriptionPart`는 현재 원본과 다음 원본의 전체 검증 후 다음 구간의 처음 최대 1초만 붙인다. 기존 `validateAudioPart`의 60+1초 계약을 통과한다. 짧은 마지막 구간은 있는 샘플만 사용하고 무음으로 채우지 않는다. 비동기 해시 검사 전에 입력을 복사해 검사 도중 caller가 바이트를 바꿔도 전사 파일에 섞이지 않는다.
- 개발 실험실의 `원본 구간 검사`는 합성 녹음의 로컬 검사 결과·manifest·fingerprint를 보여준다. 서버 저장 완료로 표시하지 않는다. 실제 입력은 기존 5초 메모리 시험만 유지했다.

## 테스트 과정과 결과

테스트를 먼저 작성했다. [첫 red 실행](unit-red.txt)은 계약 export가 없는 상태에서 38개 실패·10개 통과였다. 이 실행이 종료되기 전에 초기 구현이 진행되어, 완전한 미구현 트리에서 실행한 결과로 간주하지 않는다. 이어 복구 수 불일치 테스트를 추가하고 **실행 종료·실패를 확인한 다음** 준비 함수를 구현했다([복구 red](unit-recovery-red.txt), 1개 실패·49개 통과).

첫 단위 재검증의 실패는 큰 Uint8Array에 대한 일반 deep equality 검사 시간 초과였다([로그](unit-targeted.txt)). 테스트에서 동일 바이트 전체를 `Buffer.compare`로 비교하도록 바꿨다. 타임아웃을 늘려 숨기지 않았다. 첫 브라우저 실행은 독립 Vite 실험실에 `@/` 별칭이 없어 실패했다([로그](browser-targeted.txt)). 녹음 브라우저 모듈의 기존 규칙대로 상대 import를 사용했다.

| 검사 | 결과 | 근거 |
|---|---|---|
| 새 모듈·기존 계약 | 2파일 79개 통과 (새 모듈 50개) | [로그](unit-targeted-final.txt) |
| 녹음 Playwright 전체 | 17개 통과·선택적 3분 검사 1개 제외 | [로그](browser-all.txt) |
| 암호화 IDB → 원본 2개 → 전사 경계 → 실제 재생 | 976,073샘플·원본 1,952,234B, 전사 61초·1,952,044B, media error 없음 | [수치](original-bundle.json)·[화면](original-bundle.png) |
| 새로고침·동일 fingerprint·전송 금지 | 동일 해시·네트워크 쓰기 0 | [수치](original-bundle.json) |
| 손상된 중간 체크포인트 | 완성 원본 검사 결과를 표시하지 않음 | [Playwright](browser-all.txt) |
| 기존 30분 분량 가속 저장 | 28,800,000샘플·1,800구간·불일치 0 | [수치](endurance.json) |
| lint | 결과 기록 대기 | [로그](lint.txt) |
| 프로덕션 빌드 | 결과 기록 대기 | [로그](build.txt) |
| 전체 Vitest | 결과 기록 대기 | [로그](unit-all.txt) |

모든 음성은 합성 PCM이다. 실제 마이크·Meet·Zoom이나 STT 정확률 검사가 아니다. 기존 가속 저장 검사는 로컬 저장 엔진의 메모리 측정이며 새 원본 변환 전체의 최대 메모리를 실측한 결과가 아니다. 새 원본 변환의 지연 소비·취소는 단위 테스트로 확인했다. 3분 실시간 검사는 직전 step0 후속에서 통과한 [기록](../recording-capture-2026-09-25/README.md)을 유지하고 이번에 다시 실행하지 않았다. 기존 경로에 생성되는 endurance JSON·합성 복구 화면은 이번 폴더로 복사한 뒤 실행 전 파일을 복원했다.

```powershell
npx vitest run tests/recording/original-segments.test.ts tests/contracts.test.ts
npm run e2e:recording -- --reporter=line
npm run lint
$env:SASU_VERIFY_BUILD='1'
npm run build
npm test -- --maxWorkers=2 --testTimeout=15000
```

## 코드 관계와 Archify

수정 전에 기존 `pcmWav`, `RecordingSession`, `openRecordingStore.read/inspect`, `validateAudioPart`, `processReviewPart`와 녹음 세션 키 RPC를 직접 읽었다. 변경 후 `store.read → streamRecordingOriginals → pcmWav/SHA-256 → RecordingManifest`와 `createRecordingTranscriptionPart → verifyRecordingOriginal → canonical WAV`를 대조했다. 기존 전사 워커는 아직 새 함수를 호출하지 않는다. 서버 작업은 업로드 권한·전 구간 검증·lease·파기를 연결한 후에만 활성화해야 한다.

Graft CLI·연결 도구가 없고 Docker 엔진도 응답하지 않아 Graft 전후 그래프는 없다. `docker version --format '{{.Server.Version}}'`는 `docker_engine` named pipe 없음으로 exit 1이었다. 수동 소스 검토를 Graft 결과로 표시하지 않는다.

Archify 2.17을 사용한 [실행 흐름 HTML](originals-flow.html) · [명세](originals-flow.json) · [검증](archify-validate.json) · [delivery 영수증](archify-delivery.json) · [브라우저 영수증](archify-visual.json).

- diagram_type: `sequence`
- specification_sha256: `60b7f4bda3bf14e3052e60d3aeac9caa346ae964807b20d6ffd6d4621e60dbb7`
- artifact_sha256: `d49c6b889a7e9a3a0850bc6856f4c15f7ff245f7a12cb47c1f3aa4eafc3cbff5`
- validation: showcase 9/9, 오류·경고 0
- browser_evidence: passed (1440×900·1600×1000·1920×1080·2048×1320)
- visual_review: 실제 1440×900 라이트·2048×1320 다크 이미지를 도구로 확인했다. 노드·라벨·화살표·범례 잘림이나 겹침은 보이지 않았다. 자동 영수증의 `visualReview: pending`은 유지한다. 별도 사람 검수·전체 뷰어 기능 검사는 아니다.

다이어그램은 함수 간 데이터 처리 경계이며 운영 서버 수집 흐름의 구현 완료를 의미하지 않는다. 작성 문구는 한국어이고 고정 뷰어 UI·HTML lang은 영어다.

## 후속 경계

녹음 시작 전 영속 세션 생성 계약, SQL에서 같은 canonical bytes 검증, 원본 구간 RLS·검증 job·전사 job 허용 시점·전체/원본 삭제·철회·늦은 업로드 파기를 연결해야 한다. 실제 입력 영속 녹음과 제품 화면은 기존 step0·step4-A 게이트를 유지한다. 이번에는 migration·운영 배포·커밋·외부 메시지 발신을 하지 않았다.
