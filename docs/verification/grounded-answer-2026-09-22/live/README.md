# 실제 DB 연결 사용자 흐름 검증

## 실행 환경과 범위

- Docker의 실제 Supabase PostgreSQL·pgvector·Auth·PostgREST. 기존 격리 QA 인스턴스 `review-qa` 안에 실행마다 합성 검증 부서를 만든다.
- `node scripts/review-qa.mjs setup`: 로컬 DB에 0051·0052·0053 적용. 운영 DB는 변경하지 않았다.
- `SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs dev`: localhost:3011에서 실제 Next.js 서버 실행.
- `node scripts/review-qa.mjs grounded-answer-test --reporter=line`: 실제 Chromium 브라우저, Auth 비밀번호 로그인으로 받은 세션, 실제 Route Handler·jobs·Groq·Voyage 사용. API 응답 가로채기나 모의 DB는 없다.
- 초기 자료는 합성 문서 2건·회의 1건, 2020년 결정 1건·최근 무관한 결정 5건이다. 실제 Voyage 임베딩을 만든 뒤 DB에 시드했다. 업로드·Slack 수집 과정은 이번 범위에 포함하지 않았다.
- 사용자 요청은 세션 클라이언트와 RLS를 거친다. 테스트의 service client는 합성 fixture 설정과 저장 결과 검사에만 사용한다.

## 확인 항목

1. 브라우저에서 질문 입력 → HTTP 202 → `after()` 워커 자동 실행 → DB 답변과 인용 저장 → 화면 표시. 워커 API를 수동 호출하지 않는다.
2. 최신 결정 5건보다 오래된 2020년 결정을 찾아 이유와 함께 표시하고 원장 링크로 연다.
3. 문서와 회의 인용에서 각각 저장된 원문으로 이동한다. 조건과 줄바꿈된 부정어를 보존한다.
4. 새로고침 후 질문 기록을 다시 열어 답변·인용 순서를 확인한다. DB `ordinal`과 화면 번호가 일치한다.
5. 팀장에게만 비공개 예산을 표시한다. 팀원에게 예산·제외 건수를 노출하지 않는다. 공개 회의 질문은 정상 답변한다.
6. 팀원이 비공개 원문·다른 질문자의 답변을 요청하면 404. 사용자 토큰으로 직접 PostgREST를 조회해도 비공개·다른 부서 자료는 빈 결과다.
7. 팀장 권한을 팀원으로 낮추면 기존 비공개 답변과 원문이 모두 404다. `answers_current_evidence` RLS가 기존 답변 전체를 숨긴다.
8. 자료 제거 API 호출 후 해당 원문과 인용된 기존 답변은 404. 원문 화면에 오류 안내만 보이고 본문은 없다.
9. 팀원 화면 390px에서 가로 넘침이 없고 브라우저 pageerror가 없다.

**최종 통과: E2E 1개, 34.9초, 질문 워커 4건 완료.** 질문별 응답 시간은 약 3.7~8.9초다. Groq `openai/gpt-oss-120b` 5회, 입력 5,707·출력 4,094 토큰을 로컬 `llm_calls`에서 확인했다([telemetry](llm-telemetry.json)). 팀원의 혼합 질문은 근거 부족 거절, 나머지 3건은 답변 완료였다.

최종 결과와 실행 시간·fixture ID는 [result.json](result.json), Playwright 출력은 [test.txt](test.txt)에 기록한다. 합성 DB 자료는 로컬 검토용으로 보존했다. 추가한 검증 코드의 ESLint와 TypeScript 검사도 통과했다.

## 검증 도중 실패와 수정

- fixture 설정 오류: 일괄 insert의 누락 `id`가 null로 전달됐고, 재실행 때 부서 이름 고유 제약에 걸렸다. 모든 결정에 UUID·시각을 넣고 부서 이름에도 실행 UUID를 붙였다. 제품 경로의 오류는 아니었다.
- [첫 흐름 실패](first-flow-failure.txt): 팀원에게 비공개 예산과 공개 후속 작업을 함께 질문하면 모델이 근거 부족으로 거절했다. 부분 답변을 반드시 준다는 테스트 가정이 잘못됐다. 비공개 질문은 거절 또는 공개 근거만 허용하고, 공개 질문의 정상 답변을 별도로 필수 검증했다. 제품의 거절 로직은 바꾸지 않았다.
- [RLS 기대값 실패](rls-expectation-failure.txt): 권한 회수 후 `200/refused`를 예상했으나 실제 DB는 기존 답변 행을 숨겨 404를 반환했다. 0029의 정책을 확인하고 404와 일반 오류 본문을 검증하도록 수정했다.
- [화면 선택자 실패](selector-failure.txt): `role=alert`에 Next.js 경로 알림도 포함돼 두 요소가 잡혔다. 실제 오류 안내 문구로 선택자를 한정했다.

## 화면 증거

- [질문과 세 가지 근거](lead-answer.png)
- [문서 원문](document-evidence.png) · [회의 원문](meeting-evidence.png)
- [2020년 결정과 이유](old-decision.png)
- [팀원의 공개 답변·390px](member-answer-mobile.png)
- [삭제된 원문 접근 차단](deleted-evidence.png)

## 한계

실제 로컬 DB 연결 검증이다. 운영 배포 URL·운영 DB, Slack DM/채널 발송, 이메일 매직링크, 입력 파일 업로드는 이 실행에서 검증하지 않았다. 합성 사례의 성공을 일반 업무 정확도로 해석하지 않는다. Graft·Archify 실행 도구 부재는 기존 기록과 같다.
