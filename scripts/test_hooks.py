"""
scripts/hooks/*.sh 계약 테스트.

훅 스크립트는 Claude(.claude/settings.json)와 Codex(.codex/hooks.json) 양쪽에서
공유된다. 두 CLI가 넘기는 페이로드 모양이 다르므로(아래) 양쪽을 모두 검증한다.

  Claude  Edit|Write   → tool_input.file_path = "C:/repo/lib/pipeline/card.ts"
  Codex   apply_patch  → tool_input.command   = "*** Begin Patch\n*** Add File: lib/pipeline/card.ts\n..."
  Bash    (양쪽 동일)   → tool_input.command   = "rm -rf /"

(codex 0.147.0 실측값. `.codex/hooks.json` PreToolUse 훅으로 stdin을 덤프해 확인했다.)
"""

import json

import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


def _bash() -> str:
    """git-bash 실행 파일 경로.

    Windows에서 `bash`를 그냥 실행하면 WSL bash가 잡힐 수 있다. WSL 안에는
    jq가 없어서 훅이 조용히 통과해버리고, 테스트가 가드를 검증하지 못한다.
    실제 Claude/Codex 훅은 git-bash로 실행된다.
    """
    for candidate in (r"C:\Program Files\Git\usr\bin\bash.exe",
                      r"C:\Program Files\Git\bin\bash.exe"):
        if Path(candidate).exists():
            return candidate
    return shutil.which("bash") or "bash"

HOOKS_DIR = Path(__file__).parent / "hooks"
TDD_GUARD = "tdd-guard.sh"
DANGER_GUARD = "dangerous-command-guard.sh"


def run_hook(script_name: str, payload: dict | str, cwd: Path) -> subprocess.CompletedProcess:
    # 훅 스크립트는 cwd에 복사된 사본을 상대 경로로 실행한다.
    # 리포 경로에 한글이 들어 있어(개발/바이브코딩) 절대 경로를 argv로 넘기면
    # bash가 인코딩이 깨진 경로를 받아 'No such file or directory'로 죽는다.
    return subprocess.run(
        [_bash(), f"./.hooks/{script_name}"],
        input=payload if isinstance(payload, str) else json.dumps(payload),
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def denied(result: subprocess.CompletedProcess) -> bool:
    """PreToolUse deny 판정. JSON deny 또는 exit 2 둘 다 차단이다."""
    if result.returncode == 2:
        return True
    if not result.stdout.strip():
        return False
    return json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


def edit_payload(file_path: str) -> dict:
    return {"tool_name": "Edit", "tool_input": {"file_path": file_path}}


def patch_payload(*ops: str) -> dict:
    """codex apply_patch 봉투. ops 예: "Add File: lib/a.ts"."""
    body = "\n".join(f"*** {op}\n+content" for op in ops)
    return {
        "tool_name": "apply_patch",
        "tool_input": {"command": f"*** Begin Patch\n{body}\n*** End Patch"},
    }


@pytest.fixture
def repo():
    """package.json, tests/ 미러, 훅 사본(.hooks/)을 갖춘 프로젝트 루트.

    pytest의 tmp_path는 경로에 테스트 이름(test_...)이 들어가는데, 가드는 경로에
    test가 있으면 테스트 파일로 보고 통과시킨다. 그래서 tmp_path 대신 이름을
    직접 정한 임시 디렉토리를 쓴다.
    """
    root = Path(tempfile.mkdtemp(prefix="guardrepo-"))
    (root / "lib" / "pipeline").mkdir(parents=True)
    (root / "components").mkdir(parents=True)
    (root / "tests" / "pipeline").mkdir(parents=True)
    (root / "package.json").write_text('{"name":"t"}')
    shutil.copytree(HOOKS_DIR, root / ".hooks")
    yield root
    shutil.rmtree(root, ignore_errors=True)


def posix(p: Path) -> str:
    return p.as_posix()


def test_recording_browser_boundary(repo):
    for path in ("lib/recording/browser/storage.ts", "lib/recording/browser/capture.worklet.js"):
        assert not denied(run_hook(TDD_GUARD, patch_payload(f"Add File: {path}"), repo))
    assert denied(run_hook(TDD_GUARD, patch_payload("Add File: lib/recording/pcm.ts"), repo))
    (repo / "tests" / "recording").mkdir()
    (repo / "tests" / "recording" / "pcm.test.ts").write_text("// test first")
    assert not denied(run_hook(TDD_GUARD, patch_payload("Add File: lib/recording/pcm.ts"), repo))


@pytest.mark.parametrize("script", [TDD_GUARD, DANGER_GUARD])
def test_malformed_payload_fails_closed(repo, script):
    assert run_hook(script, "{malformed", repo).returncode == 2


# ---------------------------------------------------------------------------
# tdd-guard — Claude 모양 (tool_input.file_path)
# ---------------------------------------------------------------------------

class TestTddGuardClaudeShape:
    def test_denies_source_without_test(self, repo):
        target = repo / "lib" / "pipeline" / "card.ts"
        r = run_hook(TDD_GUARD, edit_payload(posix(target)), repo)
        assert denied(r)

    def test_allows_source_with_mirror_test(self, repo):
        (repo / "tests" / "pipeline" / "card.test.ts").write_text("")
        target = repo / "lib" / "pipeline" / "card.ts"
        r = run_hook(TDD_GUARD, edit_payload(posix(target)), repo)
        assert not denied(r)

    def test_allows_windows_backslash_path_on_allowlist(self, repo):
        """Claude가 Windows 경로를 백슬래시로 넘겨도 허용 규칙이 적용돼야 한다."""
        target = str(repo / "components" / "Panel.tsx").replace("/", "\\")
        r = run_hook(TDD_GUARD, edit_payload(target), repo)
        assert not denied(r)

    def test_allows_test_file_itself(self, repo):
        target = repo / "tests" / "pipeline" / "card.test.ts"
        r = run_hook(TDD_GUARD, edit_payload(posix(target)), repo)
        assert not denied(r)

    def test_skips_when_not_scaffolded(self, repo):
        (repo / "package.json").unlink()
        target = repo / "lib" / "pipeline" / "card.ts"
        r = run_hook(TDD_GUARD, edit_payload(posix(target)), repo)
        assert not denied(r)


# ---------------------------------------------------------------------------
# tdd-guard — Codex 모양 (apply_patch 봉투)
# ---------------------------------------------------------------------------

class TestTddGuardCodexShape:
    def test_denies_added_source_without_test(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Add File: lib/pipeline/card.ts"), repo)
        assert denied(r)

    def test_denies_updated_source_without_test(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Update File: lib/pipeline/card.ts"), repo)
        assert denied(r)

    def test_allows_added_source_with_mirror_test(self, repo):
        (repo / "tests" / "pipeline" / "card.test.ts").write_text("")
        r = run_hook(TDD_GUARD, patch_payload("Add File: lib/pipeline/card.ts"), repo)
        assert not denied(r)

    def test_allows_test_file_itself(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Add File: tests/pipeline/card.test.ts"), repo)
        assert not denied(r)

    def test_allows_allowlisted_ui_layer(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Update File: components/Panel.tsx"), repo)
        assert not denied(r)

    def test_allows_nextjs16_proxy(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Update File: proxy.ts"), repo)
        assert not denied(r)

    def test_allows_app_metadata_routes(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Add File: app/robots.ts"), repo)
        assert not denied(r)

    def test_allows_app_colocated_client_component(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Update File: app/login/login-form.tsx"), repo)
        assert not denied(r)

    def test_still_denies_lib_module_named_like_framework_file(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Add File: lib/robots.ts"), repo)
        assert denied(r)

    def test_allows_delete(self, repo):
        """삭제는 구현 코드 작성이 아니므로 TDD 대상이 아니다."""
        r = run_hook(TDD_GUARD, patch_payload("Delete File: lib/pipeline/card.ts"), repo)
        assert not denied(r)

    def test_denies_when_any_file_in_multifile_patch_lacks_test(self, repo):
        (repo / "tests" / "pipeline" / "card.test.ts").write_text("")
        payload = patch_payload("Update File: lib/pipeline/card.ts",
                                "Add File: lib/pipeline/merge.ts")
        r = run_hook(TDD_GUARD, payload, repo)
        assert denied(r)

    def test_allows_when_all_files_have_tests(self, repo):
        (repo / "tests" / "pipeline" / "card.test.ts").write_text("")
        (repo / "tests" / "pipeline" / "merge.test.ts").write_text("")
        payload = patch_payload("Update File: lib/pipeline/card.ts",
                                "Add File: lib/pipeline/merge.ts")
        r = run_hook(TDD_GUARD, payload, repo)
        assert not denied(r)

    def test_allows_config_files(self, repo):
        r = run_hook(TDD_GUARD, patch_payload("Update File: next.config.ts"), repo)
        assert not denied(r)


# ---------------------------------------------------------------------------
# dangerous-command-guard (Bash 페이로드는 Claude·Codex 동일)
# ---------------------------------------------------------------------------

class TestDangerousCommandGuard:
    @pytest.mark.parametrize("cmd", [
        "rm -rf /tmp/x",
        "git push --force origin main",
        "git reset --hard HEAD~1",
        "DROP TABLE users;",
    ])
    def test_blocks_irreversible(self, repo, cmd):
        r = run_hook(DANGER_GUARD, {"tool_name": "Bash", "tool_input": {"command": cmd}}, repo)
        assert r.returncode == 2

    @pytest.mark.parametrize("cmd", ["npm run test", "git status", "ls -la"])
    def test_allows_safe(self, repo, cmd):
        r = run_hook(DANGER_GUARD, {"tool_name": "Bash", "tool_input": {"command": cmd}}, repo)
        assert r.returncode == 0

    def test_no_command_passes(self, repo):
        r = run_hook(DANGER_GUARD, {"tool_name": "Bash", "tool_input": {}}, repo)
        assert r.returncode == 0
