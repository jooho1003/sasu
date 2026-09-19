# Step 7: retro-verification

phase 전체 검증 기록을 만들고, **운영 반영은 사람 판정으로 남긴 채 `blocked`로 멈춘다.**

## 읽어야 할 파일

- `/docs/PRD.md` §11 검증표 · §3-6 · §8 "ADR-063 개발 회고 경계" · `/docs/ADR.md` ADR-063·ADR-047 · `/docs/ARCHITECTURE.md` 불변식 22·23~26
- `docs/planning/개발_회고_자동화_설계.md` §11 — 검증 계획
- `docs/verification/README.md` · `docs/verification/notion-collection/`(step별 기록 형식) · `phases/26-trailer-candidate-links/step7.md`(검증 step 형식)
- step 0~6의 완료 요약과 산출물

## 작업

1. 전체 회귀: `npm run lint && npx tsc --noEmit && npm run test && npm run build` · SQL 하니스 2개 · 기존 E2E 전부(회고 추가로 기존 스펙이 깨지지 않음).
2. E2E(QA 조직, 로컬 프로덕션 서버 + QA DB에 `0046`·`0047` 적용): `tests/e2e/retros.spec.ts` — 합성 번들 드롭 → 202 → 초안(`retro_draft` 실제 LLM 1회) → 항목 제외 → 재생성 → 편집 → 옛 revision으로 저장 시 409 → 확정 → 타임라인 노출 → Markdown 다운로드 내용에 인용 각주 존재 → member B 로그인 시 A의 `self` 회고 미노출 → A가 `dept`로 전환 → B 노출. 실행 기록에 LLM 호출 수(`llm_calls` purpose=retro_draft 카운트) 포함.
3. 수집기 실측: 이 PC에서 `npx tsx scripts/retro-collect.ts --date <오늘> --dry-run` 과 `--chrome --dry-run`을 각각 실행해 종류별 건수 표 캡처. 출력에 제목·URL이 `--dry-run` 표 외에 없는지, 임시 복사본이 남지 않는지(`ls $TMP | grep -i history` 0).
4. 누출 점검(실행 기록으로): 워커·앱 로그 캡처를 `grep`해 회고 제목·활동 제목·quote 문자열 0건 · anon으로 비데모 `retro_days` select 0행 · 데모 조직 `create_retro_day` 거부 · 상세 API 응답에 남의 `self` day id 없음 · export 응답 헤더 `cache-control: private, no-store`.
5. 스크린샷: `retros-timeline-1440/390`, `retro-detail-1440/390`, `demo-retros-1440/390`, `settings-retro-1440`.
6. `docs/verification/daily-retro-<YYYY-MM-DD>/README.md` + 원시 로그(`unit.txt`·`sql.txt`·`e2e.txt`·`collector-dry-run.txt`·`build.txt`). 실행하지 않은 항목은 "미실행"으로 적는다. PRD §11 어느 행을 만족하는지 표기.
7. `phases/27-daily-retro/index.json`의 이 step을 `blocked`로 두고 사유를 적는다: **"운영 DB 적용·배포는 9/20 제출 이후 사용자 승인으로만. 설계 §0 결정 중 미확정 항목이 남아 있으면 그것도 기록."** `phases/index.json`에 `verification` 경로를 채운다.

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
node scripts/verify-retro-sql.mjs "D:/바이브코딩/.sasu-qa-db"
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
npx playwright test                                   # 기존 전부 통과
E2E_RETROS=1 npx playwright test tests/e2e/retros.spec.ts tests/e2e/demo-retros.spec.ts   # QA 조직에서만
npx tsx scripts/retro-collect.ts --date "$(date +%F)" --dry-run
```

## 금지사항

- 운영 DB에 마이그레이션을 적용하거나 운영에 배포하지 마라. 이유: ADR-047·불변식 22·설계 §0-7 — 9/20 이후 사람 판정.
- 검증하지 않은 항목을 통과로 적지 마라. 이유: 완료 판정은 실행 기록이다(AGENTS.md).
- 검증 기록에 실제 활동 제목·URL·회고 본문을 붙여 넣지 마라 — 건수·코드·캡처(합성 데이터)만. 이유: 불변식 9·23.
