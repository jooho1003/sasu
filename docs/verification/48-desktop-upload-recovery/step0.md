# step0 — 업로드·웹 인계 복구 완료

2026-10-04 · desktop-upload-recovery · 제품 WorkReviewUpload.tsx 한 파일.

## 입력과 변경

[plan](../../01-plan/features/desktop-upload-recovery.plan.md)·[design](../../02-design/features/desktop-upload-recovery.design.md), PRD DC-09·§8/ARCHITECTURE §6-12/ADR-087을 읽고 phase step 작성 후 red→구현→green 순서로 실행했다. API/IPC/main/preload/DB/SDK·외부 모델 변경 없음.

준비부터 ref 잠금·입력/드롭 handler 동결, 접수 성공 응답 ID만 링크 표시, 실패 초안·동의 보존 및 수동 retry, 각 read/decode/hash/upload/close await 뒤 current 검사, 링크 단일 openWeb→onSeen(id,current), 참여자 조회 loading/empty/error·단일 조회·종류 세대/retry를 구현했다. 접수된 같은 초안의 제출은 비활성이며 명시 파일/종류/메타데이터 편집이 결과 링크를 지우고 새 제출을 허용한다. 식별자 없는 전역 progress는 소비하지 않고 로컬 준비·업로드·접수 단계로 안내한다(구간별 상세 진행 소실은 ADR-087).

## 실제 실행 근거

| 실행 | 결과 | 기록 |
|---|---|---|
| 기존 제품 targeted red3 | 모두 결함 재현: 접수 전/실패 링크 1 vs 0, 이탈 후 hash가 upload 생성 1 vs 0 | [red](step0-red.txt) |
| 최초 fixture TLS | Electron net certificate verifier 누락·link:create network. 제품 red로 계산하지 않음 | [fixture 수정 전](step0-fixture-tls.txt) |
| 첫 green 전체 시도 | 첫2개 자동화 timeout. 중단 후 관련 Electron 0 확인. 통과 기록으로 계산하지 않음 | [보존](step0-green-first-timeouts.txt) |
| 원인 분리 진단 | 첫case 1 PASS; 둘째case 1 PASS, close 0.8초/profile 0.014초. 소유 panel show/focus, stage trace 보완 | [첫 진단](step0-green-diagnostic.txt)·[둘째](step0-green-retry-diagnostic.txt) |
| 최종 production Electron | 14/14 PASS, 1.1분, exit 0 | [green](step0-green.txt) |
| 실제 development React | 3/3 PASS, 15.6초, exit 0 | [dev](strict-green.txt) |
| desktop lint | tsc + ESLint exit 0 | [lint](step0-lint.txt) |
| standalone production build | exit 0 | [build](desktop-build.txt) |
| desktop unit | 12 files / 78 tests PASS, exit 0 | [unit](desktop-test.txt) |

UI/동작 단언 및 API의 기존 timeout을 유지했고 머신 부하를 반영해 테스트 전체 budget만 90→150초로 조정했다. 최종 suite에는 실제 합성 WAV/동의 참여자 계약, decode 이탈, AudioContext.close 실패, 지연 웹/읽음 이탈, 식별자 없는 progress 주입을 포함했다. 실제 [accepted 화면](screenshots/upload-accepted.png)을 view_image로 확인했고 가로 overflow 0을 단언했다.

dev hook은 bundleType 1 / WorkReviewUpload Fiber StrictEffects true / mounted view cleanupGeneration 1을 관측했다. 초기 document 뒤 audio로 전환할 때 members effect는 update로 시작하므로 members 요청 effect 자체의 setup→cleanup→setup replay를 직접 실행했다고 주장하지 않는다. 해당 개발 경로의 단일 읽기·오류/retry·종류 전환·WAV 제출은 실제 통과했다.

## 관계·구조 도구

Graft 전/후 실제 query는 native tree-sitter-kotlin Win32 ERR_DLOPEN_FAILED, exit 1이다([전](graft-before.txt)·[후](graft-after.txt)). 수동 범위: App workKey/SessionApp cleanup→WorkTab→WorkReviewUpload→preload members/upload/app/settings→main IPC→ApiClient/storage-upload E17/E12/Storage/E13→기존 companion routes/RLS. 자동 전역 의존 그래프는 누락이다.

Archify [flow](flow.json)→실제 [deliver](archify-deliver.json)·[automated browser](archify-visual.json)를 실행했다. 타입/schema, route가 다른 node를 관통하는 오류, label 겹침 및 crossing 보완 과정의 receipt를 별도 보존했다. 구조는 명시 제출·준비/비동기 업로드·웹 성공 후 읽음·오류 초안/수동 retry·종료 current 폐기를 표시한다. HTML은 .vercel/desktop-upload-recovery.html의 검증 산출물이고 원천 JSON을 보존한다.

## 인계

desktop_verify에게 build/Electron IDLE 슬롯을 명시적으로 넘겼다. step1의 기존41 최종 회귀·독립9개 비교/SC5 분석·report 후 완료 판정한다. root의 최신 root lint/build/1834 unit·SQL316/권한 matrix2016·production guest5는 [릴리스 검증](../desktop-release-2026-10-04/README.md)을 연결한다. 합성 Auth/API/Storage 통과가 실제 Storage/RLS·고객 문서/음성 의미 정확도를 증명하지 않는다. 커밋/배포/게시 없음.
