# Step 1: 구간 원본과 서버 검증

상태: 미실행. step0 통과 후 수행. 원천은 상세 설계 §5~§6·V07~V10, PRD §8.

## 읽을 파일

- `supabase/migrations/0034_reviewed_materials.sql`, `0036_demo_reviewer_read_only.sql`
- `lib/contracts.ts`, `lib/reviews.ts`, `lib/pipeline/review-material.ts`, `lib/worker.ts`
- `app/api/d/[dept]/reviews/**`, RLS/검토 상태 관련 기존 tests

## 구현과 검증

1. 새 migration으로 원본 형식/입력 방식과 `review_original_segments`를 추가한다. 기존 single_file 행 호환과 고정 reviewer 쓰기 차단을 보존한다.
2. recordings 생성/finalize 세션 API와 SQL을 구현한다. canonical manifest·30분/30개/64MiB·경로·현재 동의·미완료 개수·멱등 키를 SQL에서도 집행한다.
3. 실제 WAV 헤더/해시/샘플 검증 job, 전사 구간 생성, 검증 전체 성공 후 enqueue, 재시도/lease/2분 sweep을 구현한다. 구간당 작은 파일만 읽는다.
4. 원본 목록 signed URL, 재추출, 원본/전체 삭제, 동의 철회, 24시간 미완료 정리, 늦은 업로드/늦은 완료 파기를 연결한다.
5. 정상 사용자·다른 부서·member·미동의·reviewer의 직접 RPC/Storage 접근, 검증 전 전사 우회, 구간 조작/중복을 RLS 하니스에서 검증한다.

## 완료 기록

순수 모듈 TDD, SQL 권한/상태 테스트, 합성 Storage 실제 업로드/검증/삭제 결과를 `docs/verification/browser-meeting-recording/step1.md`에 남긴다. 세션 요청에 service role을 추가하지 않는다. 운영 DB migration 적용은 이 step 실행과 구분한다.
