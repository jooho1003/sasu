# 운영 적용·실기기·개발 도구 검증 — 2026-09-23

사용자가 커밋·머지, 외부 계정·실기기·사람 검수·쇼케이스 판단과 자동 배포까지 요청했다. [실행 계획](plan.md)에 따라 운영 DB와 자동 배포를 반영했다. 완료 범위와 사람·계정 입력이 필요한 범위를 구분한다.

## 실행 결과

| 확인 대상 | 결과 | 실행 근거 |
|---|---|---|
| 운영 DB | schema-only 사본 보관 후 0052→0053→0054 적용, 로컬·원격 54개 일치 | [dry-run](db-dryrun.txt), [적용](db-push.txt), [목록](db-list.txt), [권한·스키마](db-check.txt), [백업 해시](schema-backup.json) |
| Git 자동 배포 | PR #2 머지 후 main 자동 배포 Ready, 운영 alias 연결 | [배포 영수증](production-deployment.json), [PR #2](https://github.com/jooho1003/sasu/pull/2) |
| 공개 데모 | /demo 및 11개 기능 페이지 HTTP 200, 데모 안내·링크 검사 통과 | [실행 결과](production-demo-smoke.json) |
| 운영 ASK | 로그인한 파일럿 계정의 합성 질문 1건 done, 오류 없음, 인용 2개·순서 1/2·원문 문자열 일치·고정 안내 확인 | [운영 SQL 결과](db-answer.txt), [브라우저 관찰](browser-verification.json) |
| 원문 강조 | 답변의 문서 링크를 열고 인용된 연속 3문단의 강조를 화면에서 확인 | [브라우저 관찰](browser-verification.json) |
| 실제 마이크 | 사용자 직접 5,055ms 시험, peak RMS 0.3434, 신호 감지 | [사용자 결과](microphone-user-result.json) |
| 공유 소리+마이크 첫 시험 | 5,015ms, 두 트랙 연결. 공유 RMS 0, 마이크 0.2897 → 공유 신호 미감지, 재시험 요청 | [첫 결과](shared-audio-user-result-1.json) |
| 공유 소리+마이크 재시험 | 5,067ms, 공유 RMS 0.2384·마이크 0.0007, 양쪽 신호 감지. 화면 프레임 저장 0·저장/전송 없음 | [재시험 결과](shared-audio-user-result-2.json) |
| Whisper | 사용자가 운영 묻기 화면에서 녹음·전사 후 “전사 완료” 보고. 운영 Whisper 모델 호출 3건 확인 | [사용자 확인](user-verification.json), [본문 없는 호출 집계](db-telemetry.txt) |
| Slack 실계정 | 활성 설치 1개. 세션 설정 화면에서 실제 channels/users API 목록 조회 성공 | [DB 설치 수](db-inventory.txt), [브라우저 관찰](browser-verification.json) |
| Notion·회고 계정 | 활성 Notion 설치 0개, 회고 연결 0개. 실계정 수집 검증 미완료 | [DB 설치 수](db-inventory.txt) |
| Graft | 596/596 파일, 2,677 노드·6,738 관계, graph check OK, ASK 호출 관계 조회 | [build](graft-build.txt), [check](graft-check.txt), [호출자](graft-resolve-callers.json), [호출 대상](graft-answer-callees.json), [LLM API](graft-llm-api.txt) |
| Archify | validate 9/9, showcase 형식·구성 통과, deliver 완료, 실제 Chrome 4개 화면 검사 통과 | [명세](answer-flow.json), [HTML](answer-flow.html), [최종 검증](archify-validate-2.json), [배포 영수증](archify-delivery.json), [화면 검사](answer-flow.visual-check.json) |
| 쇼케이스 데이터 | 공개 데모 4개 부서에서 QA 표식 findings 0 | [읽기 전용 감사](showcase-audit.txt) |

운영 ASK는 `f22cdcb5-01d1-47b3-a090-6e29d6ebd19d`로 추적한다. 실제 질문·전사·근거 본문은 이 검증 보고서에 저장하지 않았다. Whisper 호출 집계는 성공 횟수 집계가 아니다. 전사 성공은 사용자 확인이며, 녹음 원본 비저장은 기존 ASK 구현의 동작이다.

## 도구 실행과 한계

Graft `@nanonets/graft@0.19.0`의 Windows 설치는 native tree-sitter 빌드에서 실패했다([출력](graft-install.txt)). 공식 Node 22 Debian 컨테이너에서 다시 설치해 구조 그래프와 호출 관계 분석에 성공했다. 입력은 앱 코드 커밋 `1683558ab51c3de0a07892019f10a0095439d79e`의 git archive다. 이후 PR #2는 배포 설정·계획 문서만 바꾸었다. `DO_NOT_TRACK=1`, `--deep` 미사용, LLM 비밀키 미전달로 실행했다. meaning tier 0%는 의미 요약을 실행하지 않았다는 뜻이다. 이번 기록은 **구현 후 분석**이며 과거 구현 전 Graft 실행 누락까지 소급해 충족하지는 않는다.

실제 명령: `graft --dir /work/graph build /work/repo`, `check /work/repo`, `callers resolveSelections /work/repo --depth 2 --json --no-refresh`, `callers answerQuestion /work/repo --direction out --depth 1 --json --no-refresh`, `skeleton lib/llm.ts /work/repo --no-refresh`.

Archify 공식 저장소 커밋 `8809b273c278a813a47fa37698864779c0d4cf08`으로 실행했다. 첫 명세는 mainPath의 역방향 열 배치 때문에 실패했고 [첫 실패](archify-validate-1.json)를 보존했다. 명세를 고친 뒤 validate→deliver→visual-check를 수행했다. 에이전트가 1440×900 밝은 화면의 글자·화살표·겹침을 검토했다. 이것은 독립적인 사람 검수와 다르며, 자동 영수증의 `visualReview: pending`은 그대로 유지한다. [도구 버전·파일 해시](tools-manifest.json)를 함께 보관한다.

## 잘못된 계정 검사 정정

**`external-account-health.json`과 `integration-inventory.json`은 무효 기록이다.** Vercel env pull의 Secret 값은 실제 키가 아니라 `[SENSITIVE]`였으며, 첫 REST inventory는 code 없는 error 객체를 잘못 처리했다. 두 파일을 계정 고장·설치 없음의 증거로 사용하면 안 된다. [정정 기록](account-check-correction.json), 직접 운영 SQL, 실제 앱 세션의 Slack 목록 조회를 유효 근거로 사용한다. Secret 값을 다시 쓰거나 교체하지 않았다.

## 쇼케이스 판단

공개 시연 시작 주소는 **https://sasu-alpha.vercel.app/demo** 로 선택한다. 4개 합성 부서가 있고 QA 표식 감사 및 11개 기능 진입이 통과했다. 로그인한 파일럿 부서는 실제 연동·Whisper·근거 검증에 사용하며, QA 이력이 남아 있는 내부 검증 공간이다. 공개 데모 감사 결과를 파일럿 전체 정리 완료로 해석하지 않는다. 기존 결정·질문 기록을 삭제하지 않았고 제출 자료도 임의 교체하지 않았다.

## 남은 검증

- 공유 오디오+마이크 재시험은 양쪽 신호를 감지했다. 첫 무음 결과는 보존하며 원인을 확정하지 않는다. 두 번째 마이크는 감지 기준 0.0001보다 크지만 낮은 음량이므로 음성 명료도 검증으로 보지 않는다. 5초 입력 시험을 Meet/Zoom·30분 녹음·장애 복구 성공으로 확장하지 않는다.
- 독립 비개발자의 5분 읽기 검수 미실행. 개발 참여자의 전사 확인과 별개다.
- Notion 지정 페이지의 실제 연결·수집·갱신, 회고 제공자별 실제 OAuth/API 경로 미실행. 계정·권한·선택할 자료가 필요하다.
- Slack 실계정 조회는 성공했으나 DM/채널 신규 질문→발송 검증은 미실행. 발송할 시험 대상·범위를 정해야 한다. 현재 로그인 사용자 자체의 Slack 매핑도 비어 있어 기존 파일럿 계정과 구분한다.
- 실제 업로드 전체 경로, 장시간 녹음, Meet/Zoom 완성, 독립 업무 정확도 검수 등 기존 미완료 항목은 그대로다. 형식 검사·합성 질문 성공을 모든 설계의 완료로 판정하지 않는다.

이번 변경은 운영 설정·검증 문서이며 앱 코드를 수정하지 않았다. 직전 [lint/build/단위 1,391검사 및 실제 모델 평가](../llm-style-followup-2026-09-23/README.md)를 유지하고, 이번에는 운영 DB 확인·배포·공개 스모크·로그인 ASK를 추가 실행했다.
