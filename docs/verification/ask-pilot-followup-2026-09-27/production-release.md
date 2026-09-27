# ASK F2 운영 반영 — 2026-09-27

- 코드 커밋: `18720bcba2b2ef3835e90707dd583d84c8073950`
- PR: [#8](https://github.com/jooho1003/sasu/pull/8), 2026-09-27 01:21:14 UTC 머지
- main 머지 커밋: `391b412498b18b9eafd0b062323d1082d97fd584`
- Vercel 운영 배포: [5ShEuzxfb44kbi8QChao4MMxxnSh](https://vercel.com/wadelee1005-3954s-projects/sasu/5ShEuzxfb44kbi8QChao4MMxxnSh), GitHub status `success / Deployment has completed` (01:21:55 UTC)
- 공개 URL: `https://sasu-alpha.vercel.app/demo` HTTP 200; 운영 첫 화면은 Chrome에서 열림.

PR의 Vercel Preview는 `Deployment Blocked`였다. 앞선 PR #6도 Preview는 차단됐지만 main 운영 배포는 성공했다. 이번에도 운영 커밋의 Vercel 상태가 성공으로 바뀐 후에만 공개 URL을 확인했다. Preview 차단을 코드 빌드 실패로 취급하지 않는다.

## 파일럿 질문 재시험

운영 브라우저에는 파일럿의 활성 로그인 세션이 없었다. 로그인 화면을 열어 두고 사용자에게 로그인 후 알려 달라고 요청했다. 매직링크 발송 안내 화면까지 확인했으나 인증 세션은 아직 없다. 이 기록 작성 시점에는 신규 질문을 전송하지 않았으므로 인용·안내 문구의 운영 결과는 미검증이다. 로컬 대상 35건·전체 1,409건 통과 결과는 [로컬 검증](README.md)에 있다.
