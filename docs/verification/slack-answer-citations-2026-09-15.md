# Claude 인수인계 — Slack 답변 인용 보완

## 변경 결과

- 채널 `@사수` 답변을 본문 → 검증된 인용문 → 작성자·KST 시각·출처 링크 순서로 게시하도록 구현했다. 알림·스크린리더용 text에도 같은 근거를 포함한다.
- 검색된 Slack 인용 ID에 한해 worker가 `id, external_ref`를 조회하고 `chat.getPermalink`로 원문 주소를 얻는다. DB 메타데이터 조회는 3초, Slack 링크 조회는 5초로 제한한다. 링크 실패 시 인용문과 부서 페이지 안내를 유지한다.
- 원문·모델 텍스트는 plain_text로 보내 자동 멘션과 마크업 해석을 막는다. 외부 링크 미리보기도 끈다. section 3,000자·50 blocks·fallback 39,000자 이하로 제한하며 원문을 손실 없이 나눈다. 전체가 너무 길면 생성 본문 없이 질문 분리 안내를 보낸다.
- `complete_answer` 저장 성공 전에 Slack 전송이나 추가 메타데이터 조회를 하지 않는다. `search_channel_as`와 `recent_channel_decisions_as`가 결정한 공개 범위를 확장하지 않는다. RLS·SQL·마이그레이션 변경이나 추가 LLM 호출은 없다.
- 별도 인수인계 수정: 예고편 생성 시 회사·제품의 고유 이름을 짓지 않고 일반 명칭을 사용하도록 지시했다. 기존 데모 스냅샷과 운영 시드는 변경하지 않았다. 프롬프트 수정은 실명 충돌 완전 방지를 보장하지 않으며 기존 공개 검토를 유지한다.

## 실행 기록 — 로컬

| 검증 | 결과 |
|---|---|
| 새 Slack 포매터 TDD | 모듈 없음으로 실패 확인 후 구현 |
| 게시 연결·링크 API TDD | 8개 실패 확인 후 구현 |
| 긴 한글 URL 인코딩 경계 | 새 회귀 테스트 실패 확인 후 보완 |
| 예고편 이름 생성 지시 | 새 테스트 1개 실패 확인 후 보완 |
| ESLint | 전체 통과, 마지막 URL 경계 변경 파일도 별도 통과 |
| `npm run build` | Next.js 16.3.4 프로덕션 빌드·TypeScript 통과 |
| `npm run test` | **68개 파일, 937개 테스트 통과** |
| 격리 PGlite 보안 하니스 | **109개 검증 + 권한 조합 2,016개 통과**; 운영 DB 미접속 |
| 브라우저 회귀 | **26/26 통과, 1.1분** — 데스크톱 1440px·모바일 390px |

브라우저 검증은 새 빌드 미리보기 `http://127.0.0.1:3003`을 사용한다. 로컬 프로세스에만 `SASU_ORG_ADMIN_MODE=on`을 설정한다. `site`, `guest`, `team-coverage`, `ui-refresh`, `workspace-polish` 5개 suite를 실행하며 설정·문서 UI는 합성 API 응답, 관리자/게스트는 기존 계정·합성 부서 읽기 경로를 검증한다.

## 코드 검토

- 추가 service-role 조회는 이미 SQL 검색과 문자열 인용 검증을 통과한 ID의 timestamp만 가져온다. 원문·다른 항목·권한 판정은 재조회하지 않는다. 웹 질문에는 추가 조회/Slack 호출이 없다.
- 저장 실패·중복 완료·스윕 완료는 게시하지 않는다. 검색 밖 ID·부분 불일치 초안은 재생성 후 거절되며 Slack에 남지 않는다.
- 출처 링크는 http(s)·자격 증명 없음·인코딩 후 길이 상한을 확인한다. 링크 구분자를 인코딩하고 `&`를 escape한다. 원문 내 멘션·링크는 plain_text다.
- 설정·문서·관리 UI는 기존 서버/RLS 권한 집행을 유지한다. 상태 처리와 접근성·모바일 변경 상세는 [워크스페이스 검증](workspace-polish-2026-09-15.md)에 있다.
- 새 스키마·의존성·환경 변수는 없다. 이 검토는 Claude 인수인계 후 Codex가 수행했다.

## 아직 실행하지 않은 운영 단계

새 코드의 운영 배포, 실제 Slack `@사수` 질문·LLM 호출·답변 게시, 원문 링크 클릭 확인, 제출 Slack 스크린샷 교체는 미실행이다. [phase 14 step 1](../../phases/14-slack-answer-citations/step1.md)에 실행 순서를 준비했다. 현재 제출 이미지는 실제 Slack 인용 답변을 검증한 이미지라고 주장하지 않는다.

Slack DM 묻기·진행 메시지·미연결 사용자 안내·실패 전송 재처리는 이 단계에 포함하지 않았다. 기존대로 저장 후 Slack 전송 실패가 발생하면 웹 답변은 남지만 자동 재전송은 하지 않는다.

## 참조

- [Slack section 블록](https://docs.slack.dev/reference/block-kit/blocks/section-block/)
- [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/)
- [Slack 메시지 서식·자동 파싱](https://docs.slack.dev/messaging/formatting-message-text/)
- [Slack chat.getPermalink](https://docs.slack.dev/reference/methods/chat.getPermalink/)
- PRD §3·§6-5·§8, ADR-035·049·050.
