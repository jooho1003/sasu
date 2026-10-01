# 합성 영업 검토·재검토 운영 반영 — 2026-09-30

사용자 요청 “운영 배포 하고 다음단계 개발 진행”에 따라 phase 36·37을 운영에 반영했다. 입력은 고정 합성 S1~S4이며 실제 고객 자료·가격 변경·외부 발송은 여전히 연결하지 않는다. 원천은 `b222ee3`(phase 37, 부모 `de0c7cd` phase 36)이다.

## 사전 검사

| 검사 | 결과 |
|---|---|
| `npm run test` | 162파일, 1,719건 통과 |
| `npm run lint` | 종료 코드 0, 문구 차단 0건·기존 경고 80건 |
| `npm run build` | Next.js 16.3.4 컴파일·TypeScript·정적 페이지 생성 통과 |
| `npx supabase db push --dry-run --skip-vault --yes` | 원격에 없는 migration은 0066·0067 두 건뿐 |
| 배포 전 공개 사이트 | `/`·`/privacy`·`/demo/features` 200 |

운영 스키마 백업을 비공개 `.vercel/sales-review-schema-before-20260930.sql`에 저장했다. 크기 626,333바이트, SHA-256 `CB72C29D2651AD67395677733E4B7B3875ACDAA7163994E38E631A0DAC65DD94`. 리포에는 넣지 않았다.

## 반영 순서와 결과

1. 로컬 작업 폴더에서 첫 `vercel deploy --prod --skip-domain`은 작업 산출물 1.2GB에 포함된 단일 파일의 100MB 제한으로 실패했다. 공개 운영 배포는 바뀌지 않았다. `b222ee3`의 깨끗한 Git worktree에서 재실행해 업로드 338.6KB, 원격 Next.js 빌드·TypeScript 통과, 배포 `dpl_9tE1VwC7FQc4Wp7D9PriCT9LX5xt` Ready를 확인했다.
2. 새 배포 URL의 `/`·`/privacy`·`/demo/features`가 모두 200인 것을 확인했다.
3. `npx supabase db push --db-url … --skip-vault --yes`로 0066·0067을 적용했다. 원격 migration list는 0001~0067 일치. `sales_review_tasks`·`sales_review_actions`를 service role로 읽을 때 각각 0행, anon 직접 읽기는 401이었다.
4. `vercel promote dpl_9tE1VwC7FQc4Wp7D9PriCT9LX5xt --yes` 뒤 `vercel inspect https://sasu-alpha.vercel.app`에서 같은 배포 ID·Ready를 확인했다. 공개 `/`·`/privacy`·`/demo/features` 200, 무서명 `POST /api/jobs/run`·`/api/slack/events` 401.
5. 운영 URL의 `npm run e2e -- tests/e2e/guest.spec.ts`: 1440px·390px 완주, 부서 격리·서명 거절, 읽기 전후 AI/DB 무증가 포함 5/5 통과.

PR #19를 `main`에 병합한 뒤 Git 연동 배포 `dpl_AQRMrHZFi7kifBQv1bK1XEu4k2BZ`가 생성됐다. `vercel inspect https://sasu-alpha.vercel.app`에서 이 배포가 `Ready`이며 운영 도메인을 가리키는 것을 확인했다.

실제 인증 사용자로 운영 영업 검토를 생성하거나 lead 확인을 누르는 검사는 실행하지 않았다. 해당 동선의 로컬 인증 브라우저 2건과 격리 SQL 289건은 [phase 37 검증](sales-review-revision-2026-09-30.md)에 있다. 배포 후 실제 영업 자료는 아직 읽지 않는다.

코드 롤백은 이전 배포 `dpl_7XgHNdiibSh4fMefZsXMr5BGUGTL`을 승격해 수행한다. 0066·0067은 테이블·RPC를 추가하고 기존 영업 검토가 없던 DB를 확장했다. 자동 down migration은 없으며 스키마 백업을 보관한다.
