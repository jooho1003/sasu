# 실계정에서 발견한 Notion 단일 페이지 수집 정체

사용자 요청에 따라 Chrome의 기존 사수 Notion 통합 키를 사수 관리자 화면에 입력했다. 키를 발급·교체하거나 권한을 확장하지 않았다. 실제 연결과 QA 페이지 목록 조회는 성공했지만, 선택한 QA 페이지의 발견 작업은 done인데 root는 discovering, 등록된 문서는 0인 상태가 발생했다. [수정 전 운영 상태](../db-followup.txt)에 비밀값·본문 없이 기록했다.

## 원인과 수정

`cursorFrom()`이 모든 subtree 초기 상태를 database로 만들었다. page 분기는 database 상태를 하위 데이터베이스 후속 작업으로 간주해 원본 페이지 등록을 건너뛰었다. 단일 페이지의 초기 상태를 page로 구분했다. 기존 database 재개 경로는 유지한다.

`settle_notion_root()`가 미배정 페이지 집계 단계로 넘어갈 때 현재 발견 작업이 running이라 SQL의 중복 방지 조건이 새 작업 예약을 막았다. 발견 함수가 수집 완료를 확인한 뒤 집계가 아직 끝나지 않은 subtree만 후속 작업을 예약하도록 수정했다. 수집 대기·동의·권한 판정과 SQL은 바꾸지 않았다. 명세의 완료 조건을 복구하는 오류 수정이며 새 제품 범위를 추가하지 않는다.

## 실행 근거

- 테스트 먼저: [red](red.txt)에서 새 단일 페이지 등록과 후속 예약 두 검사가 실패했다.
- [첫 구현 후 검사](first-green-attempt.txt): 새 검사는 통과했으나 기존 database 검사 두 건이 종전 `continued:false` 기대값과 충돌했다. 새로 예약하는 동작에 맞춰 true와 enqueue 호출을 검증하도록 고쳤다.
- [집중 검사](targeted.txt): 발견·수집·폴링·관리 라우트 4개 파일 27개 통과.
- [lint](lint.txt): 차단 0, 기존 문구 경고 77. [build](build.txt): Next.js 프로덕션 빌드·TypeScript 통과. [전체 단위](unit.txt): 139개 파일·1,393개 통과.
- Graft [수정 전 호출 관계](graft-before.json), [수정 후](graft-after.json), [build](graft-build.txt), [check](graft-check.txt). 기존 앱 스냅샷에 이번 구현·테스트 2개 파일을 반영해 다시 분석했다. 실제 구조 그래프 확인이며 LLM 의미 요약은 실행하지 않았다.
- Archify [명세](flow.json), [검증](archify-validate.json), [deliver](archify-delivery.json), [HTML](flow.html), [실제 Chrome 검사](flow.visual-check.json). 1440×900 밝은 화면의 글자·화살표·겹침을 에이전트가 확인했다. 독립 사람 시각 검수는 아니다.

## 운영 재검증 완료

[PR #4](https://github.com/jooho1003/sasu/pull/4)를 머지하고 [운영 배포 Ready](production-deployment.json)를 확인한 뒤 같은 QA 페이지 범위를 다시 시작했다. [첫 수집 결과](production-first-pass.txt): 원본 1개·임베딩 1개, 두 발견 작업·수집·임베딩 모두 done, root idle, 오류 없음. 관리자 화면도 ‘가져옴 · 완료 1 / 대기 0 / 실패 0’을 표시했다.

설정의 자동 수집 문서에서 **다시 가져오기**를 실행했다. [최종 SQL 결과](../db-notion-final.txt)에서 수동 import와 자동 notion_poll 작업 모두 done, 마지막 수집 시각은 07:48:08Z → 07:49:54Z로 갱신, 문서·임베딩 수는 각각 1개로 유지됐다. 실제 원문을 수정하는 편집→변경 감지 시험은 하지 않았으므로 이 결과는 재조회·주기 작업·멱등 수집 확인이다. QA 페이지 하나의 내부 통합 경로 검증이며 공개 OAuth·webhook·다른 제공자 완료를 뜻하지 않는다.
