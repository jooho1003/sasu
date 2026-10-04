# desktop-question-followup — Gap Analysis

2026-10-03 · bkit PDCA analyze · [설계](../02-design/features/desktop-question-followup.design.md) · [실행 기록](../verification/44-desktop-question-followup/verification.md)

## 정적 비교와 보완

독립 `desktop_gap_check` 에이전트가 구조·기능·API/IPC 계약을 대조했다. 최초 U5 pending 표시 결함 1건과 테스트 배선 오류 2건을 발견해 수정한 뒤 재검토했다. 최종 **U1~U6/S1~S4 10/10 정적 일치(100%)**. 이 수치는 모든 런타임/운영 조건의 보증이 아니다.

| 항목 | 근거 | 결과 |
|---|---|---|
| U1 자동 조회·상태 | HistoryTab load/effect, loading/ready/error 분리 | 일치 |
| U2 페이지·현재 답 | HistoryTab cursor/Map 병합·busy ref·answer.get | 일치 |
| U3 명시적 부모 | App answerQuestion·AskTab parent/포커스 | 일치 |
| U4 새 질문 | 부모/답/폴링 초기화, draft 보존 | 일치 |
| U5 전송·오류 | sendingRef·초안 보존·접수/보관 초기화·취소 폴링 안내 | 수정 후 일치 |
| U6 cleanup | HistoryTab 세대 검사·AskTab 버전/폴링 취소 | 일치 |
| S1 서버 권한 | 기존 E06/E07/E08·startAsk·ask_question 재사용, SQL316 통과 | 일치 |
| S2 저장/로그 | React 메모리 상태만 추가, 이력 영구 캐시/원문 로그 없음 | 일치 |
| S3 outbox | 기존 parentId 전달·4xx 거부, 신규 unit/Electron 실행 | 일치 |
| S4 세션 경계 | 기존 SessionApp key 재마운트·콜백 폐기 | 일치 |

구조: 계획한 세 renderer 파일만 제품 코드 변경. API 계약: `ask.send(question,parent_id)`→기존 POST/E06, `answer.get`→E07, `questions.list(cursor)`→E08 그대로. 새 endpoint/job/table/module 없음. 가시성은 UI에 복제하지 않았다.

## 실행 비교

plan SC1~SC6은 개발 완료 조건 **6/6 충족**. 신규 Electron 5개 및 기존 7개, desktop 78개, root 1,834개, SQL 316개/2,016 권한 조합 통과. root/desktop lint와 production build 통과. 실행별 증거는 verification.md의 링크 참조.

직접 실행하지 않은 조합: 429 초안 보존·페이지 실패/빠른 상세 연타·지연 응답+로그아웃. 정적 경로 일치와 별도 세션/4xx/탭 이탈 테스트는 있으나 이 조합별 통과로 계산하지 않는다. Graft 자동 그래프는 실행 환경 오류로 미확보이며 수동 의존 관계 대조와 Archify 자동 검사는 확보했다.

## 판정

확인된 정적 결함 0건, 필수 개발 검증 통과로 report 단계 진행. 운영 배포/설치 파일 게시·메일 연결은 이번 개발 완료 판정에 포함하지 않는다. phase 43의 미충족 실제 메일·신규 Windows 전체 녹화 게이트를 닫지 않는다.
