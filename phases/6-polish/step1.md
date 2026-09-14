# Step 1: error-empty-states

## 읽어야 할 파일

- `/docs/PRD.md` §5 화면 구성 · §6-10 엣지 케이스 · §9 D11
- `/docs/ARCHITECTURE.md` §2 디렉터리 · §8 테스트 경계
- `app/layout.tsx`, `app/globals.css`, `app/demo/**`

## 작업

Next.js App Router 규약에 맞는 한국어 오류 UI를 추가한다. `app/error.tsx`는 일반 route 오류를, `app/global-error.tsx`는 root layout 오류를 처리하며 둘 다 `reset()` 재시도 버튼을 제공한다. `global-error.tsx`는 `html`·`body`를 직접 렌더한다. `app/not-found.tsx`는 존재하지 않는 카드·부서에 돌아갈 경로를 제공하고, `app/demo/error.tsx`는 게스트 데모로 돌아가는 링크를 제공한다.

게스트 대시보드·원장·ASK·역할 화면에서 배열이 비었을 때 빈 컨테이너만 보이지 않도록 명시적인 한국어 빈 상태를 렌더한다. 데이터 오류와 정상적인 빈 상태를 같은 문구로 뭉개지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

- `error.tsx` 파일은 Client Component이고 재시도 버튼이 `reset()`을 호출한다.
- `global-error.tsx`는 `html`·`body`를 포함한다.
- 데모 데이터 0건 화면에 빈 상태 안내가 보인다.

## 금지사항

- 오류 메시지에 내부 에러 원문·digest·요청 내용을 표시하지 마라. 이유: 비밀값과 업무 원문이 노출될 수 있다.
- 오류 경계에서 service role을 사용하지 마라. 이유: 사용자 요청 경로 보안 경계다.
- 영문 UI 문구를 추가하지 마라. 이유: 한국어 단일 UI 규칙이다.
