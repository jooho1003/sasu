# 자료 검토·기록 보존 운영 절차

2026-09-16. 계약은 [PRD §3-3·§8](PRD.md), 구현 이유는 ADR-054, 실행 증거는 [검증 기록](verification/reviewed-materials-2026-09-16/README.md)이다.

> **운영 상태 (2026-09-17):** `0034`·`0035`와 phase 20~22 앱 반영을 완료했다. 배포·스모크·로그인 읽기 결과는 [운영 반영 기록](verification/reviewed-materials-production-2026-09-17.md)을 따른다. 아래 절차의 "변경하지 않았다"는 9/16 개발 검증 시점 기록이다.

## 적용 대상과 배포

1. 검증된 코드와 `0034_reviewed_materials.sql`, `0035_record_retention.sql`을 함께 반영한다. 이번 개발 검증은 격리 로컬 Supabase에서 진행했으며 운영 DB/배포는 변경하지 않았다.
   Vercel CLI가 없는 배포 환경에는 `npm i -g vercel` 설치를 권장한다. 승인된 배포와 환경 변수 확인·로그 점검에 사용한다.
2. 운영 마이그레이션 전 기존 DB 백업을 확보한다. 0034는 비공개 Storage 버킷·정확한 파일 경로별 RLS·초안/구간/이력·세션/워커 RPC와 동의 철회 트리거를 추가한다. 0035는 보존 설정/내보내기 생성 메타데이터를 추가한다.
3. 현재 Groq 키·Supabase URL/키와 기존 jobs cron을 사용한다. 새로운 유료 공급자는 추가하지 않는다. 원본은 브라우저에서 세션 권한으로 Storage에 직접 업로드하며 60초 서명 URL로 내려받아 로컬 재생한다. 권한 회수 후에도 이미 발급된 URL은 만료 또는 실제 파일 제거 전까지 최대 60초 유효할 수 있다. 이미 내려받은 사본은 원격에서 회수할 수 없다.
4. 음성 50MB·30분, 문서 20MB, 추출/편집 전문 최대 100만 문자·1,000구간을 초기 상한으로 삼는다. [Supabase 파일 한도](https://supabase.com/docs/guides/storage/uploads/file-limits)의 무료 프로젝트 50MB 제한을 고려했다. 관리자 콘솔의 전역 한도가 이보다 작으면 업로드가 실패하므로 실제 프로젝트 설정을 확인한다.
5. 워커는 구간별 실패를 남기고 2분 뒤 정리한다. Groq 사용량·Storage 사용량·실패 작업과 `purge_review_files` 완료를 확인한다. 브라우저가 지원하지 않는 코덱은 WAV/MP3/M4A로 변환하여 업로드한다.
6. 운영 승인 뒤 부서장 계정에서 합성 음성 1건으로 업로드→새로고침→재생→편집→확정→사용 중지→삭제를 재검증한다. 일반 멤버/다른 부서의 원본 접근 거부도 확인한다.

이전 앱으로 되돌릴 때 신규 자료를 삭제하는 다운 마이그레이션은 사용하지 않는다. 신규 업로드 진입을 중단하고 읽기/삭제 도구와 파일 정리 워커를 유지한 뒤 롤백 영향을 검토한다. 저장 데이터에 대한 파괴적 자동 롤백은 제공하지 않는다.

## 일상 사용

- `/d/[dept]/reviews`: 음성/문서 업로드, 참여자 동의 확인, 처리 목록. 실제 사람의 녹음은 모든 참여자가 현재 동의한 부서 멤버여야 한다.
- `/d/[dept]/reviews/[id]`: 원본 재생/다운로드, 전문 검색·교정·추가·삭제, 저장 이력, 재추출 후보 비교, 확인 후 확정, 사용 중지, TXT/MD, 원본만 또는 자료 전체 삭제.
- 원본과 최초 추출문을 비교하고 누락·구간 경계 중복·표 순서를 확인한다. 1초 중첩은 자동 화자 분리나 문장별 정밀 타임스탬프가 아니다. OCR·PPTX·XLSX는 지원하지 않는다.
- 자료 초안은 검색되지 않는다. 확정해야 문서 요약과 기존 검색/카드 파이프라인에 들어간다. 확정 후 수정한 초안을 저장하는 동안 이전 확정본이 사용 중임을 화면에 표시한다.
- 참여자의 동의 철회/탈퇴는 해당 녹음 전체를 삭제 처리한다. 원본/구간 파일은 즉시 접근 차단한 뒤 작업으로 제거한다. 저장했던 파일과 업무 기록 내보내기 사본은 담당자가 별도 파기해야 한다. 기존 결정 인용은 append-only 정책을 따른다.
- `/d/[dept]/retention`: 실제 확인한 Slack 플랜·변경 예정일·보존 기간 기록, 채널별 수집 범위, 현재 유효한 수집본의 MD/체크섬 JSON 내보내기. 한 번에 5,000건을 초과하면 기간을 나눈다. 생성 시각은 다운로드 사본 보관 성공을 의미하지 않는다.

## 암호화 백업·격리 복원 도구

`scripts/backup-vault.mjs`는 **운영자용 Docker PostgreSQL 컨테이너 기반 검증 도구**다. 실행 DB와 Storage API가 같은 환경임을 운영자가 확인해야 한다. 관리형 운영 Supabase의 원격 백업 연동·스케줄러·외부 보관소까지 설정된 도구가 아니다.

필요 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_ENCRYPTION_KEY`(32바이트 16진수). 비밀값은 시크릿 관리 도구로 주입하고 키를 백업 파일·리포·로그와 분리한다.

```powershell
node scripts/backup-vault.mjs create <database-container> <new-encrypted-file.sasubak>
node scripts/backup-vault.mjs verify-restore <database-container> <encrypted-file.sasubak>
```

- AES-256-GCM 파일 안에 public/private/auth/storage 덤프, 보관 완료된 자료의 원본/변환 파일, SHA-256 manifest가 포함된다. 평문 파일을 디스크에 쓰지 않는다. 파일 누락·키 불일치·변조 시 실패한다. 파일 합계 상한은 512MB이며 대규모 운영 백업에는 별도 스트리밍 도구가 필요하다.
- DB와 Storage 사이 원자 스냅샷은 제공하지 않는다. 일관된 복구본을 만들려면 수집·업로드·변경 작업이 정지된 유지보수 창에서 실행하고 manifest를 대조한다. 업로드가 완료되지 않은 파일은 복구 완료 대상에서 제외된다.
- 복원은 새로운 `review_restore_*` DB로만 수행한다. 원본 바이트를 격리 검증 테이블에 복원하여 체크섬을 검사한다. 현재의 삭제 목록·부서 멤버십/동의를 재적용하고 jobs 및 소스 자동 동기화를 정지한다.
- **검증 DB는 서비스 재개용이 아니다.** Storage 서비스의 실제 객체 복원/재생, Auth/DB 권한 및 조직 관리자 최신 상태, OAuth 키·설정·cron, 관계/인용·검색 인덱스 재검증을 완료해야 실제 복구가 된다. 덤프의 권한은 `--no-acl`로 제외되어 별도 재적용이 필요하다. 현재 도구는 운영 복구 성공이나 복구 시간을 보장하지 않는다.
- 검증 DB에는 인증/설치 메타데이터가 포함될 수 있으므로 운영자 접근만 허용하고 합의한 기간 뒤 폐기한다. Slack 첨부 파일 실물은 이 도구의 범위에 없다.

정기 운영을 시작하려면 실제 플랜/채널, 별도 보관 목적·기간, 백업 저장소/비용/키 관리, 실행 주기, 담당자, RPO/RTO, 검증 사본 파기 기간을 사용자와 정한다. 사용자와 합의하기 전 자동 외부 백업이나 주간 메시지 발송을 켜지 않는다.

## 로컬 검증 재현

Docker 기반 별도 Supabase 작업 디렉터리 `.vercel/review-qa`에서 실행한다. 이 디렉터리와 인증 파일·음성·암호화 백업은 git ignore 대상이다. 기존 운영 환경과 같은 프로젝트 ID/포트를 쓰지 않는다.

```powershell
node scripts/review-qa.mjs setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-review-audio.ps1
node scripts/review-qa.mjs build
node scripts/review-qa.mjs start
# 별도 터미널
node scripts/review-qa.mjs test
node scripts/review-qa.mjs backup-test
```

`setup`은 로컬 URL을 검증하고 합성 조직/멤버를 만든다. `test`는 실제 Groq 전사 비용이 발생하며 Slack 비밀값은 테스트 환경에서 제거한다. TTS 문안은 `tests/fixtures/review-tts.txt`다. SQL 권한 검증은 `scripts/verify-security-sql.mjs`에 0034/0035 검증이 연결돼 있다.
