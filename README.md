# 사수 (SASU) v3 — 부서별 결정 사수

> 범용 AI는 세상을 알고, Lindy는 회사를 안다고 말합니다. 사수는 우리 부서를 알고, 결정을 만듭니다.

원티드 AI Championship 2026 제출용 MVP. 참가 접수 **9/18(금)** · 과제 제출 **2026-09-20 (일) 23:59** · 심사 기간 9/21~10/5 배포 URL 유지.

## 문서

구현의 입력이 되는 확정 계획은 `docs/PRD.md` 하나다. 충돌 시 우선순위: **PRD → ARCHITECTURE → ADR → setup-guide·submission-checklist**. 규칙은 [CLAUDE.md](CLAUDE.md)(= [AGENTS.md](AGENTS.md), Codex용 동일본).

| 문서 | 용도 |
|---|---|
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | 프로젝트 헌장 — 스택, CRITICAL 규칙, 문서 우선순위, TDD·훅, 명령어 |
| [docs/PRD.md](docs/PRD.md) | **최상위.** 범위·완료 조건·컷 라인·스키마·파이프라인·API·화면·일정·가설·검증·렌즈/외부 리뷰 이력 (옛 `plan.md` 흡수) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조·디렉토리·패턴·데이터 흐름·불변식 15개·만들지 않는 것·테스트 경계 |
| [docs/ADR.md](docs/ADR.md) | 결정 27개의 이유와 포기한 대안, 기각된 안 부록 |
| [docs/setup-guide.md](docs/setup-guide.md) | 사람이 직접 해야 하는 일 — D0 확인 4건, 계정·플랜·키, 동의문, 게이트 판정(D3·D6·D8·D9) |
| [docs/submission-checklist.md](docs/submission-checklist.md) | 제출 양식 7항목, 500자 본문, 스크린샷 5장, 영상 구간, AI 활용 증거, 투표·본선 |
| [docs/01-plan/](docs/01-plan/features/sasu-mvp.plan.md) · [docs/02-design/](docs/02-design/features/sasu-mvp.design.md) | bkit PDCA용 얇은 어댑터 — PRD·ARCHITECTURE를 가리킨다. 새 결정을 적지 않는다 |
| [docs/proposal/](docs/proposal/) | 기획서 v3 (컨셉·경쟁·보안·심사 전략), 사이(SAI) 기획서 |
| [docs/submission/](docs/submission/) | 양식 원문·유의사항, 썸네일, 스크린샷 파일 |
| [docs/archive/](docs/archive/) | 폐기된 v1·v2.1 문서, 옛 제출 초안 — 참조하지 않음 |

## 착수 순서

1. `docs/setup-guide.md` §0 — D0 사람 작업 (참가 접수, Vercel 플랜, Recall.ai, 슬랙 스코프, 임베딩 키, 파일럿 섭외)
2. `.claude/commands/harness.md` §F 순서대로 `phases/0-vertical-slice` step 작성 → `python scripts/execute.py 0-vertical-slice`
3. D3(9/10) 세로 슬라이스 게이트 · D6(9/13) 회의 봇 판정 · D8(9/15) 코드 리뷰 — 사람이 판정한다
4. 구현 중 결정이 바뀌면 PRD §3·§8·§4를 먼저 고치고 ADR을 추가한다

## 도구

- 훅: `scripts/hooks/tdd-guard.sh`(lib/ 테스트 선행 강제) · `dangerous-command-guard.sh` — `.claude/settings.json`·`.codex/hooks.json` 공유. 확인: `python -m pytest scripts/test_hooks.py`
- 슬래시 커맨드: `/harness`(step 설계·실행) · `/review`(변경 리뷰 체크리스트)
- bkit: `/pdca analyze sasu-mvp` (D3 게이트 후)
