#!/bin/bash
# Dangerous Command Guard — PreToolUse[Bash]
# 되돌릴 수 없는 명령을 차단한다.
#
# 훅 입력은 환경변수가 아니라 stdin JSON으로 들어온다. 이전 버전은 settings.json에서
# $CLAUDE_TOOL_INPUT을 grep했는데, 그런 환경변수는 존재하지 않아 항상 빈 문자열을
# 검사하고 통과시켰다. tdd-guard.sh와 동일하게 stdin을 읽는다.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

PATTERN='rm[[:space:]]+-rf|git[[:space:]]+push[[:space:]]+--force|git[[:space:]]+reset[[:space:]]+--hard|DROP[[:space:]]+TABLE'

if echo "$COMMAND" | grep -qEi "$PATTERN"; then
  echo "BLOCKED: 되돌릴 수 없는 명령이 감지되었습니다 — $COMMAND" >&2
  # PreToolUse에서 exit 2만 실제로 차단한다. exit 1은 non-blocking error라 그대로 실행된다.
  exit 2
fi

exit 0
