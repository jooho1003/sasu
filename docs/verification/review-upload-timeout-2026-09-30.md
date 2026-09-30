# Phase 34 · 방치된 파일 업로드 정리 — 2026-09-30

## 범위와 실행

PRD IN-04·§8 / ADR-073의 기존 `single_file` 자료만 대상으로 한다. 시간 초과 시 상태·이유만 바꾸며 원본, 구간, 수정본, 확정 source는 삭제하지 않는다. `audio_segments` 녹음은 기존 세션 sweep에 맡긴다. migration 0065는 `npx supabase migration up --local`로 **로컬 DB에만** 적용했다.

| 검사 | 결과 |
|---|---|
| SQL TDD red | 함수 없음 `42883` 확인. 첫 fixture 오류(`audio_segments`에 세션 없음)는 기존 녹음 fixture 사용으로 고친 뒤 red 재확인 |
| 격리 SQL `node scripts/verify-security-sql.mjs D:\\바이브코딩\\.sasu-qa-db` | 282 통과, 권한 행렬 2,016 assertion. 23h/24h/25h, 녹음, 처리·확정·삭제·원본 삭제, 원본·구간 보존, 재호출, 100건 상한, 사용자 직접 실행 거절 포함 |
| UI red→green `upload-timeout.spec.ts` | 안내 없음으로 1건 실패/무관 실패 1건 통과 → 구현 후 2/2 통과 |
| `tests/pipeline/review-material.test.ts` | 36 통과, 호출 순서와 실패 중단 확인 |
| `npm run test` | 159파일·1,705건 통과 |
| `npm run e2e:review-controls` | 31건 통과 |
| `npm run build` | Next 16 컴파일·TypeScript·정적 페이지 생성 통과 |
| `npm run lint` / `git diff --check` | exit 0, 문구 차단 0(기존 경고 79) / 통과 |

## 남은 경계

운영 DB migration·배포는 실행하지 않았다. Graft와 Archify 호출 도구를 이 세션에서 찾지 못했다. [설계의 호출 흐름](../02-design/features/review-upload-timeout.design.md)을 수동으로 확인했으며 전후 그래프·시각화 도구 결과라고 주장하지 않는다. 느린 실제 네트워크에서 24시간을 채운 업로드 실측은 없다.
