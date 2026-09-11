# D5 업무 목업·회의 전사 검증 기록

검증일: 2026-09-11 (KST)  
환경: Production `https://sasu-alpha.vercel.app` · Slack `새 워크스페이스` · `#소셜`  
목적: Lindy형 업무 입력 분류·결정 카드·DM 보조와, 회의 전사 업로드·요약·Q&A 경로를 실환경에서 확인한다.

## Slack 업무 목업

- 합성 업무 메시지 4건을 실제 `#소셜`에 게시했다. 원문은 이 기록에 복사하지 않는다.
- 목업 라벨 A(결정 신호): `decision`, confidence `1`, 결정 카드 생성 및 담당자 DM 발송 완료
- 목업 라벨 B(액션 신호): 기존 배포에서는 `info`로 잘못 수렴했으나, 규칙 보강 후 `action`으로 분류하도록 수정했다.
- 목업 라벨 C(정보 신호): `info`
- 목업 라벨 D(잡담 신호): 기존 배포에서는 `info`로 잘못 수렴했으나, 규칙 보강 후 `chatter`로 분류하도록 수정했다.
- 결정 카드 DM에는 원문 링크·웹 카드 링크·기존 원장 결정 근거가 함께 포함됐다.
- 판정: 결정 승격·카드·DM은 통과. 액션/잡담/정보 세분화 결함은 `classifyNonDecisionByRules`와 회귀 테스트로 수정했다.
- 로컬 Next.js 핸들러를 동일 production DB와 Slack 토큰으로 재검증해, 결정 후 원문 Slack 스레드에 봇 답글 1건과 원장 링크가 생성되는 것을 확인했다. DM 카드의 링크 블록에는 `localhost`가 없고 `sasu-alpha.vercel.app`가 들어갔다.

## 회의 목업 — VTT 업로드 경로

- 실제 Production `/api/d/{dept}/meetings/transcript`에 화자·시각이 있는 합성 VTT를 업로드했다.
- 응답: HTTP `202`, `accepted=4`, `skipped=0`
- 회의 상태: `summarized`
- 요약 결과: `decisions=1`, `deferred=1`, `actions=1`
- 판정: MVP의 음성 대체 경로인 VTT 전사 저장·회의 요약은 통과
- 주의: Recall.ai/실제 오디오 입력은 이번 검증 범위가 아니며, 현재 구현된 음성 경로는 VTT/TXT 전사 업로드다.

## 회의 Q&A·검색

- 회의 내용 질문 1건을 Production `/api/d/{dept}/ask`로 제출했다.
- 최초 검증에서는 HTTP `202`로 접수됐지만 answer job이 `failed(job_failed)`가 됐고, 같은 회의의 4개 발언이 모두 `embed_status=failed`였다.
- Voyage 임베딩을 재처리한 뒤 파일럿 부서 live item 16건이 모두 `embed_status=done`, `embed_model=voyage-4-lite`가 됐다.
- 같은 질문을 새 answer로 다시 실행한 결과 `status=done`, `verified=true`, 인용 2건으로 확인됐다.
- 판정: 임베딩·검색·Q&A 데이터 경로는 통과. 네트워크 예외가 안전한 `embedding_api_failed` 코드로 남도록 보강했다.

## 30분 오디오 회의 분석

- 5명 참여자(김현우 팀장·박서윤 과장·이준호 대리·최민지 사원·정다은 인턴)가 10개 안건을 세 번씩 논의하는 150개 발언을 합성했다.
- 오디오 산출물은 16kHz mono MP3, 정확히 1,800초이며 평균 음량 `-21.6 dB`, 최대 음량 `-3.8 dB`로 무음 파일이 아님을 확인했다.
- 오디오와 동일한 타임라인의 VTT를 생성해 `기획팀 사수` 데모 부서에 150개 item으로 저장하고 실제 `summarize_meeting` 파이프라인을 실행했다.
- 결과: `status=summarized`, 참여자 5명, 결정 53건·보류 15건·액션 76건.
- 30분 전사를 한 번에 strict JSON으로 요청하면 모델 스키마 오류가 발생하는 문제를 발견해 12개 발언 chunk 요약 + item_id 병합으로 수정했다.
- 일부 모델 요약 문장이 원문과 문자열 일치하지 않아 `citation_invalid_dropped`로 제외됐다. 인용 검증을 통과한 결과만 저장되므로 근거 없는 요약은 렌더되지 않는다.
- 결과 요약 파일: `outputs/mockup-data/기획팀-9월-런칭-결정회의-30분-분석결과.json`

## 기획팀 확장 목업

- 게스트 시드에 `기획팀 사수`를 추가했다.
- 역할: 김현우 팀장, 박서윤 과장, 이준호 대리, 최민지 사원, 정다은 인턴.
- 입력: Slack 채널, 회의 전사, 기획팀 원칙 문서, `런칭 예산안.xlsx`, `런칭 의사결정 자료.pptx`.
- 기획팀 item 68건을 시드했고, 현재 분류 결과는 `decision=9`, `action=22`, `info=29`, `chatter=8`이다.
- 재사용 가능한 회의 목업 파일은 `fixtures/mockup/기획팀-9월-런칭-결정회의.vtt`다.

## 자동화 세로 슬라이스

- `npm run e2e`: 1 passed
- Slack 이벤트 접수 → worker 분류/임베딩 → 결정 카드 → 웹 결정 → 원장 → 동일 이벤트 멱등성까지 한 번에 확인했다.
- 발견된 카드 표시 결함: LLM이 원본 Slack 문장의 일부만 인용하면 이벤트 식별 정보가 카드에서 사라졌다. 검증된 카드의 원본 항목은 전체 원문으로 정규화하도록 수정했고, 회귀 테스트를 추가했다.
- 발견된 카드 상태 경합: 카드 row가 인용 저장보다 먼저 `open`으로 보일 수 있었다. 먼저 `needs_review`로 저장하고 인용 저장 후 `open`으로 승격하도록 수정했으며, 최신 build에서 E2E로 재검증했다.
- 테스트 locator 결함: 원장 화면의 반복 요약 필드가 strict mode를 일으키던 부분을 첫 번째 일치 요소로 명확히 했다.

## 후속 이슈

1. 기존 배포에서 확인한 액션/잡담 분류 결함은 코드와 테스트로 수정했다.
2. 결정 DM의 원장 링크가 `localhost`를 가리키던 문제는 `NEXT_PUBLIC_APP_URL`과 Vercel fallback으로 수정했다.
3. 결정 후 원본 Slack 스레드에 결과와 원장 링크를 남기도록 수정했고 로컬 핸들러를 통한 실제 Slack 게시까지 통과했다. 새 배포가 Vercel에서 `DEPLOYMENT_BLOCKED` 상태라 `sasu-alpha.vercel.app`에 새 코드를 연결하는 마지막 단계만 배포 재개 후 필요하다.
4. 실제 Recall.ai 봇 참석과 운영 음성 업로드 연동은 아직 검증하지 않았다. 이번 검증은 합성 오디오와 동기화 VTT를 만들고, 현재 확정된 VTT/TXT 전사 업로드·요약 경로로 분석했다.
