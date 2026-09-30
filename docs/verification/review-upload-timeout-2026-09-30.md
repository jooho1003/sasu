# Phase 34 · 방치된 파일 업로드 정리 — 2026-09-30

## 범위와 실행

PRD IN-04·§8 / ADR-073의 기존 `single_file` 자료만 대상으로 한다. 시간 초과 시 상태·이유만 바꾸며 원본, 구간, 수정본, 확정 source는 삭제하지 않는다. `audio_segments` 녹음은 기존 세션 sweep에 맡긴다. 개발 시 migration 0065를 로컬 DB에 적용했고, 사용자 승인 뒤 아래 운영 반영도 완료했다.

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

## 운영 반영 — 2026-09-30

- 승인: 사용자의 "운영 반영 승인". 운영 기준 `main` 커밋 `2830584`에서 phase 34 SQL·워커·안내 화면만 분리한 release 커밋 `1e68f8b`를 사용했다. 녹음 phase 23·33 코드와 미커밋 파일은 배포하지 않았다.
- 사전 확인: 운영 도메인 `sasu-alpha.vercel.app`의 이전 배포 ID `dpl_6LweqgVJabEmQDfFcmLcRVBX8WrJ`. 원격 DB는 `0001`~`0057` 적용 상태였고, `original_layout`은 이미 적용된 `0052`에 있었다. 기존 `uploading` 0건, 이 중 24시간 초과 0건. 공개 스모크 `/`·`/privacy` 200. 운영 스키마 백업은 리포 밖의 비공개 release 작업 폴더 `.vercel/phase34-schema-before.sql`에 저장했다.
- 배포본 검증: 단위 139파일·1,415건, 변경 파일 ESLint 및 전체 문구 검사(차단 0), 화면 2/2, Webpack 빌드·TypeScript·정적 페이지 생성 통과. 로컬 기본 Turbopack 빌드는 외부 `node_modules` 연결을 거부했고, 운영용 Vercel 원격 Turbopack 빌드·TypeScript·정적 페이지 생성은 통과했다.
- 순서: 운영 환경에서 `--skip-domain`으로 배포 `dpl_3evfKgQbvRurLNKGSsGQgCvBab2r`를 먼저 빌드해 `/`·`/privacy`·`/demo/features` 200을 확인했다. 운영 DB 스키마 백업 뒤 `npx supabase db push --db-url … --skip-vault --yes`로 **`0065_review_upload_timeout.sql` 한 건만** 적용했다. 함수 존재, service role 실행 가능, authenticated 실행 불가, 직접·PostgREST RPC 호출 결과 모두 처리 0건을 확인했다. 그 뒤 `vercel promote`로 공개 도메인에 연결했다.
- 승격 후: `vercel inspect https://sasu-alpha.vercel.app`이 새 배포 ID를 반환했다. `/`·`/privacy`·`/demo/features` 200, 무서명 `POST /api/jobs/run`·`/api/slack/events` 401. 운영 게스트 대시보드→카드→원장→묻기 Chromium 1440px·390px 2/2 통과.

## 남은 경계

운영 DB에는 `0058`~`0064`가 아직 미적용이며 phase 23·33의 운영 승인을 뜻하지 않는다. 나중에 해당 migration을 적용할 때는 이미 기록된 `0065`보다 낮은 번호이므로 목록·`--dry-run`으로 순서를 확인하고 필요한 경우 `--include-all`을 검토한다. Graft와 Archify 호출 도구를 개발 세션에서 찾지 못했다. [설계의 호출 흐름](../02-design/features/review-upload-timeout.design.md)을 수동으로 확인했으며 전후 그래프·시각화 도구 결과라고 주장하지 않는다. 느린 실제 네트워크에서 24시간을 채운 업로드 실측은 없다.
