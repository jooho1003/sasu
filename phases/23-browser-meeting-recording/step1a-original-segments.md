# Step 1-A: 구간 원본·manifest·전사 경계

원천: PRD §3-4 REC-03·04, §8, 상세 설계 §4.3·§5.1~5.3. step0 실제 기기 게이트를 완료로 바꾸지 않으며 서버/제품 연결 전 독립적으로 검증 가능한 순수 데이터 처리를 구현한다.

## 범위

- `lib/contracts.ts`: 원본 구간과 버전 1 manifest의 단일 Zod 스키마. 경로·부서·작성자는 받지 않는다.
- `lib/recording/original-segments.ts` (TDD): 연속 1초 checkpoint를 최대 60초 독립 WAV로 변환하는 async generator, canonical manifest/fingerprint, 실제 WAV·byte·샘플·해시 검증, 검증된 원본 두 구간에서 기존 60+1초 전사 WAV 생성.
- 개발 실험실: 암호화된 IndexedDB 확인 구간 → 원본 묶음 검사 → manifest 요약. 원본 준비가 서버 저장 완료처럼 표시되지 않게 한다. 실제 음성·서버 업로드·LLM은 사용하지 않는다.

## 버전 1 계약

`{ version: 1, segments: [{ index, sample_count, bytes, sha256 }] }`. 0부터 빈틈 없는 순서, 1~30개, 마지막 외 960,000샘플, 마지막 1~960,000샘플, 구간 bytes = 44 + sample_count × 2. 총 28,800,000샘플·64MiB 이하. 16kHz·mono·PCM16 LE·44바이트 WAV 헤더는 버전으로 고정한다.

canonical UTF-8은 `sasu-recording-manifest-v1\n` 뒤에 순서대로 `index:sample_count:bytes:sha256\n`을 붙인다. 소문자 SHA-256만 허용하며 마지막 LF도 해시에 포함한다. JSON 키 순서·제목·사용자·파일 경로는 fingerprint에 포함하지 않는다. 원본 경로와 권한은 이후 SQL이 결정한다.

## 검증

```powershell
npx vitest run tests/recording/original-segments.test.ts tests/contracts.test.ts
npm run e2e:recording
npm run lint
$env:SASU_VERIFY_BUILD='1'
npm run build
npm test -- --maxWorkers=2 --testTimeout=15000
```

30분 경계, partial 마지막 구간, 누락·중복·손상, 키 순서에 무관한 해시, WAV 헤더 변조, 다음 구간 검증, 기존 `validateAudioPart` 호환을 확인한다. 서버 세션 계약·migration·RLS·업로드/파기 워커는 step1의 후속이며 이번 단계의 자동 검증으로 완료 처리하지 않는다.
