# D11 폴리싱·부하 검증 실행 기록

- 실행 시각: 2026-09-14 22:54~23:04 KST
- 실행 대상: 로컬 production build (`next start -p 3100`)
- 기준 문서: PRD §9 D11 · §11 게스트

## 변경 사항

- `scripts/load-test-demo.mjs`: 100명의 동시 게스트가 `/demo`와 실제 4개 부서의 대시보드·원장·ASK·역할·첫 카드 상세를 GET으로 순회한다.
- `app/error.tsx`·`app/global-error.tsx`·`app/demo/error.tsx`·`app/not-found.tsx`: 내부 오류 원문을 노출하지 않는 한국어 오류·404 화면과 재시도 경로를 추가했다.
- 게스트 대시보드·원장·ASK·역할 화면: 정상 조회 결과가 0건일 때 명시적인 빈 상태를 추가했다.

## 실행 결과

| 검증 | 결과 | 실행 기록 |
|---|---|---|
| ESLint | PASS | `npm run lint` |
| Next.js production build + TypeScript | PASS | `npm run build` |
| Vitest | PASS | 44 files · 730 tests |
| Playwright 파싱 | PASS | 5 files · 12 tests listed |
| 게스트·부서 커버리지 E2E | PASS | 8 tests · 22.0s |
| 로컬 production 동시 부하 | PASS | users 100/100 · requests 601 · failures 0 · elapsed 6,279ms · p50 814ms · p95 2,488ms · max 2,784ms |

부하 검증 명령:

```powershell
$env:LOAD_TEST_BASE_URL='http://127.0.0.1:3100'
$env:LOAD_TEST_USERS='100'
npm run test:load:demo
```

## 판정 범위

이 기록은 로컬 production 서버와 연결된 데모 데이터에 대한 판정이다. PRD §11의 “동시 100명 무사”에 필요한 재현 가능한 검증기를 만들고 로컬에서 통과했지만, Vercel 운영 환경의 동시 100명 검증으로 과장하지 않는다.

남은 사람/운영 작업:

1. 배포 후 공개 URL을 `LOAD_TEST_BASE_URL`로 명시해 운영 부하 검증 실행 여부를 결정한다.
2. 슬랙 DM 결정·동의 버튼을 실제 워크스페이스에서 클릭한다.
3. 실제 채널 20건을 수동 라벨링해 결정 필요 재현율을 채점한다.
4. 참가 접수와 제출 폼의 최종 제출 버튼을 사람이 확인한다.
