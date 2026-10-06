# 실제 Slack 질문·답변·인용 확인 — 2026-10-05 (phase 14 step 1 · phase 32 step 4)

사용자 승인(2026-10-05): 사수(SASU) 워크스페이스 `T0870U4PE90`의 #소셜(`C087PNU14UQ`, 사람 멤버 1명 = 본인)과 봇 DM에서 합성 테스트 질문을 보낸다. 조작은 Claude Code가 Aside 브라우저(로그인된 Slack 웹)로 했다. 질문·답변 본문은 이 기록에 옮기지 않고 ID·상태·인용 검증 결과만 적는다. 화면 캡처는 합성 테스트 내용만 담는다.

## 사전 점검 (읽기 전용)

| 항목 | 결과 |
|---|---|
| Event Subscriptions | 켜짐, Request URL `https://getsasu.com/api/slack/events` Verified, 봇 이벤트 `app_mention`·`app_uninstalled`·`message.channels`·`message.groups`·`message.im` |
| App Home | Messages 탭 켜짐, 메시지 입력 허용 체크 |
| #소셜 | 봇 참여, 사람 멤버 1명 |
| 질문자 매핑 | Slack 사용자 `U086Y3MV4LV` = 파일럿 부서 lead(동의 완료) |

## 채널 `@사수` 질문 (phase 14)

| 항목 | 결과 |
|---|---|
| 질문 | `@SASU [테스트 QA-20261005-ASK2] …` 21:58:40 KST (자동완성으로 멘션 선택, 한 메시지) |
| 처리 | `answer` job done 21:59:01, `deliver_slack_answer` done 21:59:14 |
| 답변 | `answers.id=5d0edf48-…` status `done`, `refused=false`, `verified=true`, 인용 2건, 전달 scope `channel` state `sent` |
| Slack 화면 | 스레드 답변 "사수의 답변" + 근거 2개. 근거마다 종류·작성자·KST 시각·채널 표시. 근거 1(문서)은 `https://getsasu.com/d/<부서>/evidence/<item>?answer=…`(새 도메인)로 열려 원문 확인 화면 표시, 근거 2(Slack)는 `…slack.com/archives/C087PNU14UQ/p…` 원문 메시지 링크. "이 채널에서 볼 수 있는 부서 기록만 보고 답했습니다." 안내 |
| 캡처 | [slack-channel-thread.png](slack-channel-thread.png) |

첫 시도(21:58:12)는 입력 방식 문제로 `@사수` 멘션만 담긴 메시지와 질문 메시지가 따로 전송됐다. 멘션만 있는 메시지에는 답변 job이 생기지 않았다(질문 없음). 두 번째 시도가 위 기록이다.

## 봇 DM 질문 (phase 32)

| 시도 | 결과 |
|---|---|
| DM / DM2 | 입력창에 텍스트만 쌓이고 전송되지 않음(Enter가 이 화면에서 전송으로 동작하지 않음). Slack 이벤트 0건 |
| DM3 22:06:02 | 전송 버튼으로 전송(앞의 두 문장이 함께 들어감). 답변 `refused`·`citation_invalid`(인용 원문 검증 실패 → 설계대로 거절), 전달 scope `user` state `sent` 22:06:30 |
| DM4 22:06:58 | 답변 `done`, `verified=true`, 인용 1건, 전달 scope `user` state `sent` 22:07:11. 스레드 답변에 근거(작성자·KST 시각·#소셜)와 원문 링크. "내가 볼 수 있는 부서 기록만 보고 답했습니다." 안내 |
| 캡처 | [slack-dm-thread.png](slack-dm-thread.png) |

같은 주제 질문이 채널에서는 답변되고 DM3에서는 인용 검증으로 거절됐다. 모델 인용 출력의 편차로 보이며, 거절은 "인용 없는 문장은 렌더하지 않는다" 규칙대로 동작한 것이다.

## 판정

- phase 14 step 1: 실제 Slack `@사수` 질문 1회·답변·모든 인용·작성자·시각·원문 링크 확인·ID 기록·실제 화면 캡처 완료. step 1 항목 7(제출 5장·README 웹 ASK 장면 교체)은 제출 마감(9/20)·심사 종료(10/5) 뒤라 교체하지 않았고, 캡처는 데모데이 자료로 쓸 수 있게 남긴다.
- phase 32 step 4: Slack DM·채널 신규 질문 → 답변 → 발송 운영 경로 확인 완료(채널 `sent`, DM `sent`).
- 같은 세션의 phase 0 5분 실측: [D3-vertical-slice.md](../D3-vertical-slice.md) "D3 스톱워치 판정".
