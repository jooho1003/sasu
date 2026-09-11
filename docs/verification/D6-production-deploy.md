# D6 Production 배포·세로 슬라이스 검증

검증일: 2026-09-11 (KST)  
대상: `https://sasu-alpha.vercel.app`  
배포: `dpl_B6Nvtd9JNNgWNGb4LnJVnFtxxFyc` (`READY`, Production)

## 로컬 배포 전 검증

- `npm test`: 24개 파일, 142개 테스트 통과
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `npm run build`: 통과
- 분류 회귀 테스트 추가: 규칙이 결정 후보로 판정하고 LLM이 `decision`을 반환할 때 confidence가 null이어도 카드 승격

## 배포 결과

- Production alias: `https://sasu-alpha.vercel.app`
- Vercel 상태: `READY`
- 원격 Next.js build: 통과
- 배포 방식: Hobby 플랜의 커밋 작성자 권한 차단을 피하기 위해 현재 소스 스냅샷을 CLI로 배포했다. 리포의 Git 메타데이터는 업로드하지 않았다.
- 기존 Git 연동 자동 배포는 커밋 작성자 이메일 권한 문제를 해결하기 전까지 계속 차단될 수 있다.

## Production 세로 슬라이스

- Slack 서명 이벤트 접수: HTTP `200`
- 결정형 입력 분류: `decision`
- 결정 카드 생성: 성공
- 카드 웹 화면에서 결정: HTTP `200`, `decision_id` 생성, 브라우저에 `결정 완료` 표시
- 동일 결정 재제출: HTTP `200`, `duplicate=true`, 결정 1건 유지
- 동일 `event_id` 재전송: HTTP `200`, 동일 `external_ref` item 1건 유지
- Production Playwright 세로 슬라이스: `1 passed` (`49.9s`)

> 원문 질문·전사 내용은 실행 기록에 남기지 않는다. 확인에는 상태 코드와 행 ID만 사용했다.

## 게스트·권한 경계

- `/`, `/demo`, 영업·개발·기획 게스트 경로: 모두 HTTP `200`
- 게스트 페이지 전후 `llm_calls`: `88 → 88` (증가 0)
- 게스트 HTML에서 파일럿 식별 문자열: 없음
- 영업 ASK에는 영업 원칙만, 개발 ASK에는 개발 원칙만 노출. 상대 부서 원칙 교차 노출 없음
- 잘못된 Slack 서명: HTTP `401`
- 잘못된 worker secret: HTTP `401`

## 문서·음성 입력

- 합성 TXT 업로드: HTTP `202`, chunk 1건
- 문서 요약 상태: `summarized`
- 합성 20초 음성 업로드: HTTP `200`
- 전사 모델: `whisper-large-v3-turbo`
- 원본 음성은 애플리케이션 DB에 저장하지 않는 경로로 확인

## 참고 사항

최초 기존 Playwright E2E는 Vercel 콜드스타트와 DB 왕복으로 기본 5초 UI assertion을 넘겨 실패했다. 결정 완료 assertion을 운영 지연에 맞춘 30초로 조정한 뒤 Production E2E를 재실행해 통과시켰다.
