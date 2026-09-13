#!/bin/bash
# TDD Guard Hook — PreToolUse[Edit|Write|apply_patch]
# 구현 코드를 작성하려 할 때, 해당 모듈의 테스트 파일이 먼저 존재하는지 체크.
# 테스트 없이 구현 코드를 작성하려 하면 차단.
#
# Claude .claude/settings.json 과 Codex .codex/hooks.json 양쪽에서 공유하는 스크립트다.
# 두 CLI가 넘기는 페이로드 모양이 다르다 (codex 0.147.0 실측):
#   Claude  Edit|Write   → tool_input.file_path = "C:/repo/lib/pipeline/card.ts"
#   Codex   apply_patch  → tool_input.command   = "*** Begin Patch\n*** Add File: lib/pipeline/card.ts\n..."
# file_path만 읽으면 codex에서는 항상 빈 값이라 가드가 통째로 무력화된다.
#
# 허용 목록은 docs/ARCHITECTURE.md §8 테스트 경계를 그대로 옮긴 것이다. 표를 바꾸면 여기도 바꾼다.
# 이 리포는 src/ 없이 app/ · components/ · lib/ 이 루트에 있고, 테스트는 tests/ 가 lib/ 를 미러한다
# (lib/pipeline/card.ts ↔ tests/pipeline/card.test.ts).

# PowerShell에서 비로그인 Git Bash를 직접 실행해도 기본 유틸리티를 찾는다.
export PATH="/usr/bin:/bin:$PATH"
set -o pipefail
for required_command in cat jq sed dirname basename; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'BLOCKED: TDD guard dependency missing: %s\n' "$required_command" >&2
    exit 2
  fi
done
INPUT=$(cat) || exit 2
# 파싱 실패를 빈 입력으로 오인해 허용하지 않는다.
if ! jq -e 'type == "object"' >/dev/null 2>&1 <<< "$INPUT"; then
  printf 'BLOCKED: invalid TDD guard payload\n' >&2
  exit 2
fi

# 프로젝트가 아직 스캐폴딩되지 않았으면(package.json 없음) TDD 가드를 건너뛴다.
# 테스트 프레임워크가 깔리기 전(D1 부트스트랩)에는 강제할 대상이 없기 때문.
# package.json이 생기면 이후 모든 lib/ 편집에 TDD가 적용된다.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

# --- 편집 대상 경로 수집 -----------------------------------------------------

FILE_PATHS=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATHS" ]; then
  # codex apply_patch 봉투에서 추가·수정 대상만 뽑는다.
  # 삭제(Delete File)는 구현 코드 작성이 아니므로 TDD 대상이 아니다.
  FILE_PATHS=$(echo "$INPUT" | jq -r '.tool_input.command // empty' \
    | sed -n 's/^\*\*\* \(Add\|Update\) File: //p')
fi

if [ -z "$FILE_PATHS" ]; then
  exit 0
fi

# --- 파일 하나에 대한 판정 ---------------------------------------------------
# 반환: 0 = 허용, 1 = 테스트 없음(차단)

needs_test() {
  # Windows 경로는 백슬래시로 들어온다. 아래 case 패턴이 전부 슬래시 기준이라
  # 정규화하지 않으면 허용 규칙(*/components/* 등)이 하나도 안 걸린다.
  local FILE_PATH="${1//\\//}"

  # apply_patch 경로는 워크스페이스 루트 기준 상대 경로다. 절대 경로로 맞춘다.
  case "$FILE_PATH" in
    /*|[A-Za-z]:/*) ;;
    *) FILE_PATH="$ROOT/$FILE_PATH" ;;
  esac

  # 테스트 파일 자체를 수정하는 건 허용
  case "$FILE_PATH" in
    *test*|*spec*|*.test.*|*.spec.*|*__tests__*)
      return 0
      ;;
  esac

  # .claude/·.codex/ 인프라(설정·훅·슬래시 커맨드)와 phases/ step 파일, scripts/ 는 TDD 비대상 — 허용.
  # 이유: 오케스트레이션·시드·훅이지 lib/ 비즈니스 로직이 아니다. seed-demo.ts는 데이터를
  #       실제 파이프라인(lib/)에 넣을 뿐이고, 파이프라인은 자기 테스트가 있다.
  case "$FILE_PATH" in
    */.claude/*|*/.codex/*|*/phases/*|*/scripts/*)
      return 0
      ;;
  esac

  # 설정/타입/스타일/SQL 파일은 테스트 불필요 — 허용
  # (RLS·SQL 함수는 tests/rls/ 가 검증하지만 파일별 미러가 아니라 D8 사람 리뷰 + 시나리오 테스트다)
  case "$FILE_PATH" in
    *.json|*.css|*.scss|*.md|*.yml|*.yaml|*.sql|*.env*|*.config.*|*tailwind*|*postcss*|*next.config*|*tsconfig*|*vercel.json)
      return 0
      ;;
  esac

  # types/ 폴더는 테스트 불필요 — 허용
  case "$FILE_PATH" in
    */types/*|*/types.ts|*/types.d.ts)
      return 0
      ;;
  esac

  # Next.js 프레임워크 파일은 허용 (layout, page, loading, error, not-found, global styles)
  case "$FILE_PATH" in
    */layout.tsx|*/layout.ts|*/page.tsx|*/page.ts|*/loading.tsx|*/error.tsx|*/not-found.tsx|*/globals.css)
      return 0
      ;;
  esac

  # 라우트 핸들러·컴포넌트·얇은 SDK 어댑터는 TDD 비대상 — 허용 (ARCHITECTURE §8 3행).
  # 이유: 비즈니스 로직은 전부 lib/ 계층에 있고 그쪽은 테스트가 선행한다.
  #       여기 걸리는 파일은 SDK 어댑터(Supabase 클라이언트 팩토리·Anthropic 게이트웨이·slack postMessage),
  #       Block Kit 프레젠테이션, 라우트 배선이라 테스트를 붙이면 우리 로직이 아니라 SDK를 테스트하는 꼴이 된다.
  #       단 lib/slack/verify.ts(서명 검증)와 lib/contracts.ts는 우리 로직이므로 여기 없다.
  case "$FILE_PATH" in
    */route.ts|*/route.tsx|*/middleware.ts|*/components/*|*/lib/supabase/*|*/lib/llm.ts|*/lib/slack/blocks.ts|*/lib/slack/post.ts)
      return 0
      ;;
  esac

  # lib/ 또는 소스 파일이면 테스트 파일 존재 여부 확인
  case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx) ;;
    *) return 0 ;;
  esac

  local DIR BASENAME EXT PARENT REL_DIR
  DIR=$(dirname "$FILE_PATH")
  BASENAME=$(basename "$FILE_PATH" | sed -E 's/\.(ts|tsx|js|jsx)$//')

  # 같은 폴더에 .test 파일
  for EXT in ts tsx js jsx; do
    if [ -f "${DIR}/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/${BASENAME}.spec.${EXT}" ]; then
      return 0
    fi
  done

  # __tests__ 폴더
  PARENT=$(dirname "$DIR")
  for EXT in ts tsx js jsx; do
    if [ -f "${PARENT}/__tests__/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/__tests__/${BASENAME}.test.${EXT}" ]; then
      return 0
    fi
  done

  # tests/ 최상위 미러 — 이 리포의 구조다 (lib/pipeline/card.ts ↔ tests/pipeline/card.test.ts).
  if [ -d "${ROOT}/tests" ]; then
    case "$FILE_PATH" in
      */lib/*)
        REL_DIR=$(dirname "${FILE_PATH##*/lib/}")
        for EXT in ts tsx js jsx; do
          if [ -f "${ROOT}/tests/${REL_DIR}/${BASENAME}.test.${EXT}" ]; then
            return 0
          fi
        done
        ;;
    esac
  fi

  MISSING_BASENAME="$BASENAME"
  return 1
}

# --- 판정 실행 ---------------------------------------------------------------

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! needs_test "$f"; then
    cat << EOJ
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TDD GUARD: '${MISSING_BASENAME}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: tests/<lib 하위 경로>/${MISSING_BASENAME}.test.ts)"
  }
}
EOJ
    exit 0
  fi
done <<< "$FILE_PATHS"

exit 0
