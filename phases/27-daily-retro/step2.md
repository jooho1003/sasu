# Step 2: retro-collector

로컬 수집기 `scripts/retro-collect.ts`를 step 1 파서 위에 배선한다. 서버 코드는 건드리지 않는다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-02·03) · `/docs/ARCHITECTURE.md` §6-4 불변식 23 · ADR-063 6항
- `docs/planning/개발_회고_자동화_설계.md` §2(경로 표)·§7 — CLI 명세
- `lib/retro/collect/*.ts` (step 1) · `lib/retro/bundle.ts`
- `scripts/seed-demo.ts`·`scripts/setup-worker-cron.ts` — 스크립트 작성 관행(`npx tsx`, 환경 변수 처리)
- `~/.claude/CLAUDE.md` "이 PC의 Python" — `py -3`만 동작한다(보조 스크립트 필요 시)

## 작업

1. `scripts/retro-collect.ts`: 인자 `--date`(기본 오늘, 로컬 tz) `--config`(기본 `~/.sasu/retro.json`) `--out`(기본 `./retro-<date>.json`) `--chrome` `--search-terms` `--dry-run`. 설정 파일이 없으면 템플릿을 만들고 종료(설계 §7의 키).
2. 소스별 배선: git(`child_process.execFile`, 리포마다) · Claude(`~/.claude/history.jsonl` 스트리밍 + `~/.claude/projects/*/` 세션 파일 중 당일 수정분의 `ai-title` 줄만 grep 수준으로 읽기 — 파일 전체를 메모리에 올리지 마라, 127MB 규모) · Codex(`~/.codex/sessions/YYYY/MM/DD/*.jsonl`) · 메모리(`~/.claude/projects/*/memory/*.md`) · 문서(설정 리포의 `git diff --stat`).
3. Chrome: `--chrome` 또는 설정 `chrome.enabled`일 때만. History 파일을 `os.tmpdir()`로 복사 → 읽기 → **복사본 즉시 삭제**(`finally`). 읽기 엔진은 `node:sqlite`가 있으면 사용, 없으면 `py -3 scripts/retro-chrome-dump.py <복사본>`(stdlib `sqlite3`로 `urls·visits·keyword_search_terms`를 JSON으로 출력)로 폴백. 폴백 스크립트도 이 step에서 만든다. 둘 다 안 되면 `chrome: unavailable(<이유 코드>)`로 건너뛰고 나머지는 계속.
4. 출력 전에 `parseRetroBundle`로 자기 검증. `--dry-run`은 종류별 건수와 앞 5건 제목 표를 stdout에, 파일 미생성. 일반 실행의 stdout은 `activities: N · masked: M · dropped(denylist): K · out: <경로>` 한 줄만.
5. `docs/setup-guide.md` §15 "개발 회고 수집기": 설치(`npx tsx scripts/retro-collect.ts`), 설정 파일 키 설명, Windows `schtasks /create /tn sasu-retro /sc daily /st 23:30 /tr "..."`, macOS launchd plist 예시, "생성된 파일을 `/d/<dept>/retros`에 드롭" 안내, Chrome 켜기 전 읽을 주의(차단 목록·검색어 별도).
6. `package.json`에 `"retro:collect": "tsx scripts/retro-collect.ts"` 추가.

## Acceptance Criteria

```bash
npx tsx scripts/retro-collect.ts --date 2026-09-19 --dry-run                    # 종류별 건수 표, 파일 없음
npx tsx scripts/retro-collect.ts --date 2026-09-19 --out "$TMP/retro.json"      # 마지막 줄 activities: N …
npx tsx -e "import('./lib/retro/bundle.ts').then(m=>console.log(m.parseRetroBundle(JSON.parse(require('fs').readFileSync(process.env.TMP+'/retro.json','utf8'))).ok))"   # true
grep -c "assistant\|toolUseResult\|pastedContents" "$TMP/retro.json"           # 0
npm run lint
```

## 금지사항

- 세션 파일의 `assistant`·`toolUseResult`·`attachment` 레코드나 `history.jsonl`의 `pastedContents`를 읽지 마라. 이유: 불변식 23.
- Chrome History 원본을 직접 열거나 복사본을 남기지 마라. 이유: 잠금 충돌·민감 데이터 잔존.
- `--dry-run` 외에 활동 제목·URL을 stdout·로그에 찍지 마라. 이유: 불변식 9.
- 수집기에서 네트워크 호출(`--push`)을 구현하지 마라. 이유: 개인 토큰은 phase 28(보안 검토 후).
- 기본 설정에서 `chrome.enabled`·`search_terms`를 true로 두지 마라. 이유: 설계 §0-2, ADR-063.
