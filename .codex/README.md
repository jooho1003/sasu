# .codex

Codex CLI용 프로젝트 설정. `hooks.json`은 `.claude/settings.json`과 같은 스크립트(`scripts/hooks/*.sh`)를 공유한다.

- Codex는 편집 툴 이름이 `apply_patch`라 matcher에 `Edit|Write|apply_patch`를 모두 둔다. `tdd-guard.sh`는 두 CLI의 페이로드 모양(`tool_input.file_path` vs `tool_input.command`의 patch 봉투)을 모두 읽는다.
- 프로젝트 규칙은 루트 `AGENTS.md`(= `CLAUDE.md`)를 읽는다. 한쪽을 고치면 다른 쪽도 고친다.
- 무인 실행은 `python scripts/execute.py {task}` — `--dangerously-bypass-hook-trust` 없이는 훅 신뢰 확인에서 멈춘다 (execute.py가 넣어 준다).
- 훅 동작 확인: `python -m pytest scripts/test_hooks.py` (bash·jq 필요).
