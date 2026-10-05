# Windows 0.1.2 릴리스 준비 최종 확인

2026-10-04 · 읽기 전용 상태 확인 및 문서 작성. 이 기록은 phase 48 완료·0.1.2 빌드/게시/설치 성공을 뜻하지 않는다. 코드·버전·의존성·기존 evidence를 변경하지 않았다.

## 브랜치·원격 PR 상태

확인 시 작업 브랜치는 `release/desktop-0.1.2-20261004`, HEAD `44185ca1fafce4b07a78893a974ecbfffb49911d`이다. GitHub main과 origin/main은 모두 `81f10a96cc6c2dc9ee2a6070e667508ec220f012`이며 HEAD의 조상이다. `origin/main...HEAD`는 뒤처짐 0·앞섬 2로 main의 CSP 변경을 포함한다. 릴리스 브랜치 upstream은 아직 `origin/feat/desktop-sales-flow`를 가리킨다. 릴리스 브랜치를 게시할 때 전용 원격 브랜치 upstream으로 정리해야 한다.

| PR | 현재 상태 | 병합 커밋 |
|---|---|---|
| #30 질문 이력 | MERGED | `9baff7c3b446597ab4f6a6d10de5f81987007983` |
| #33 최근 작업 | MERGED | `e6b0addba9eae4a64bb489a1bf37a97d403bed0e` |
| #34 결정함 | MERGED | `7a3ff5c6540c8da72c85ac7c2b552fd77e888762` |
| #35 영업 검토 | MERGED | `81f10a96cc6c2dc9ee2a6070e667508ec220f012` |

조회 당시 open PR은 0건이다. 로컬 main은 `e4fa26205050a582d459879a662aa766b9707966`으로 origin/main보다 12커밋 뒤다. 현재 릴리스 작업 중 브랜치를 바꾸지 않았으며 최종 반영 뒤 로컬 main 동기화가 남는다. 원격 피처 브랜치는 아직 목록에 있다. Windows 공개 설치 파일은 0.1.1이고 main 병합 자체가 새 설치 파일 게시를 의미하지 않는다.

## fresh source 복사 대상

전용 경로는 `.vercel/desktop-release-012-source/desktop`이다. 이 안에는 0.1.1 package.json/package-lock.json과 별도 `npm ci`의 실제 node_modules만 준비돼 있다. 기존 node_modules를 유지하고 root의 **최종 소스 검증 신호 뒤** 아래 tracked 파일만 상대 경로대로 복사한다. `desktop/out`은 마지막 QA/development 설정 빌드이므로 복사하지 않는다. release·node_modules·env·테스트 산출물·리포 문서·숨김 설정 디렉터리를 재귀 복사하지 않는다.

필수 설정/리소스:

```text
desktop/package.json
desktop/package-lock.json
desktop/electron.vite.config.ts
desktop/electron-builder.yml
desktop/tsconfig.json
desktop/resources/tray.png
```

아래는 확인 당시 `git ls-files desktop/src`에서 `__tests__`를 제외한 정확한 제품 소스 목록이다. source 전체 디렉터리 복사 대신 이 목록을 사용한다. phase 48 변경 대상 `WorkReviewUpload.tsx`도 최종 확인본으로 복사한다.

```text
desktop/src/main/api/client.ts
desktop/src/main/api/storage-upload.ts
desktop/src/main/auth/supabase.ts
desktop/src/main/core/inbox-notifications.ts
desktop/src/main/core/outbox.ts
desktop/src/main/core/pet-state.ts
desktop/src/main/core/poller.ts
desktop/src/main/index.ts
desktop/src/main/ipc.ts
desktop/src/main/logger.ts
desktop/src/main/notify.ts
desktop/src/main/outbox-service.ts
desktop/src/main/settings-service.ts
desktop/src/main/shortcut.ts
desktop/src/main/storage/encrypted-file.ts
desktop/src/main/tray.ts
desktop/src/main/updater.ts
desktop/src/main/windows/index.ts
desktop/src/preload/index.ts
desktop/src/renderer/index.html
desktop/src/renderer/src/App.tsx
desktop/src/renderer/src/app.css
desktop/src/renderer/src/components/AskTab.tsx
desktop/src/renderer/src/components/CardView.tsx
desktop/src/renderer/src/components/CardsTab.tsx
desktop/src/renderer/src/components/Evidence.tsx
desktop/src/renderer/src/components/HistoryTab.tsx
desktop/src/renderer/src/components/LoginFlow.tsx
desktop/src/renderer/src/components/RecentWork.tsx
desktop/src/renderer/src/components/SettingsTab.tsx
desktop/src/renderer/src/components/WorkReviewUpload.tsx
desktop/src/renderer/src/components/WorkSalesReview.tsx
desktop/src/renderer/src/components/WorkTab.tsx
desktop/src/renderer/src/env.d.ts
desktop/src/renderer/src/main.tsx
desktop/src/renderer/src/pet/PetCanvas.tsx
desktop/src/shared/contracts.ts
desktop/src/shared/globals.d.ts
desktop/src/shared/messages.ts
```

패키징에는 불필요한 tracked 설정은 `.gitignore`, `eslint.config.js`, `vitest.config.ts`, `playwright.e2e.config.ts`다. 전용 source에서 lint/unit/E2E를 별도로 실행할 때는 그 실행에 필요한 설정·테스트를 명시적으로 추가한다. 현재 production-build 도구는 `npm run build`·`npm run dist`만 실행하므로 해당 테스트 파일들을 복사할 필요는 없다.

외부 alias 두 개는 electron.vite.config.ts와 tsconfig.json 양쪽에서 동일하게 정의되어 있다. 다음 경로를 보존한다.

| alias | 원본 | 전용 복사 위치 |
|---|---|---|
| `@sasu/contracts` | `lib/contracts.ts` | `.vercel/desktop-release-012-source/lib/contracts.ts` |
| `@sasu/review-audio` | `lib/adapters/review-audio.ts` | `.vercel/desktop-release-012-source/lib/adapters/review-audio.ts` |

contracts의 유일한 import는 bare package `zod`이고 review-audio에는 import가 없다. 추가 root lib를 복사할 필요는 없다. alias 소스가 desktop 밖에 있으므로 bare package resolver가 사용하는 경로는 build 결과로 확인하며, 패키지 런타임 의존성은 전용 desktop의 실제 node_modules와 ASAR 감사로 확인한다. root 전체 node_modules를 복사하거나 junction을 재사용하지 않는다.

root가 버전을 반영하면 `desktop/package.json`의 version과 `desktop/package-lock.json`의 최상위 version·`packages[""].version`이 모두 0.1.2인지 확인한 뒤 두 파일을 fresh source에 다시 복사한다. 의존성 정의가 그대로이고 버전만 변경됐으면 준비된 npm ci 결과를 사용할 수 있다. 의존성 정의가 바뀌면 해당 lock에 맞는 설치를 다시 확인해야 한다. 최종 source HEAD와 복사 파일 해시를 패키지 감사 기록에 연결한다.

## 완료 뒤 갱신할 메타데이터

확인 시 phase 48은 step0 `in_progress`·step1 `pending`이며 green 실행 중이다. 최종 검증·독립 분석·보고가 확보되기 전에는 완료로 바꾸지 않는다.

| 대상 | 실행 근거 확보 뒤 반영할 항목 |
|---|---|
| `phases/44-desktop-question-followup/index.json` step2 | 현재 pending인 `windows-release-verification`의 최종 status·completed_at·summary·릴리스 verification 경로. 공개 게시와 실제 업데이트/세션 복원/로그아웃 삭제 결과를 구분하여 적는다 |
| phase44 index 최상위 | 공개 0.1.2에 실제 포함된 뒤 `production_deployed`, 버전·deployed_at·deployment/installer verification 링크 |
| phase45·46·47 index 최상위 | 기존 completed step 기록을 보존하고 0.1.2 installer 포함에 대한 `production_deployed`·버전·deployed_at·release evidence 링크 추가 |
| `phases/48-desktop-upload-recovery/index.json` | step0/1 최종 실행 summary·완료 시각·verification·analysis·report, 개발 완료와 공개 설치 파일 반영을 따로 기록 |
| `phases/index.json` phase44~47 | 기존 검증 기록과 새 릴리스 evidence를 연결하고 노트의 운영 미반영/0.1.1 유지 표현을 실제 게시·업데이트 결과에 맞게 보완 |
| `phases/index.json` phase48 | 현재 항목 없음. 최종 개발 완료·design/verification/analysis/report와 installer 반영 상태를 담은 새 항목 추가 |
| phase43 step12·top-level metadata | `blocked`와 메일·신규 Windows 5분 전체 녹화 게이트 유지. 기존 0.1.1 기록을 지우지 않고 새 0.1.2 설치/업데이트 evidence를 후속 링크로 연결 |
| phase44~48 analysis/report·verification | 기존 날짜의 실행 기록은 보존. 필요한 경우 2026-10-04 follow-up 릴리스 링크와 운영 상태를 추가하며 과거 12/18/25/37건을 이번 통합 결과로 덮어쓰지 않음 |
| `docs/verification/desktop-release-2026-10-04/README.md` | phase48 최종 결과, 0.1.2 source/hash/manifest/ASAR/packaged smoke, 공개 GitHub release, 실제 업데이트·재로그인 없는 세션 복원·로그아웃 파일 삭제·스크린샷과 한계 |

phase44 추가 회귀는 [continuation 기록](../44-desktop-question-followup/continuation-2026-10-04.md)의 고유 production 41개(첫 39개+재검증 2개)와 development 6개를 구분한다. 최종 phase48 회귀 결과가 새로 확보되면 해당 실행 기록을 별도로 연결한다. 루트 lint/build/unit·SQL·운영 guest는 [릴리스 README](README.md)의 실행 근거를 유지한다.

## 다음 실행의 준비 상태

전용 의존성·도구·초기 0.1.1 운영 QA 세션은 준비됐다. 초기 QA 프로필은 `.vercel/desktop-012-initial-verified-20261004/profile`이다. 업데이트 도구에는 로그인 fallback이 없고 초기 인증과 업데이트 후 세션 복원을 별도로 기록한다. `.env`+`.env.local`의 실제 환경과 공개 설정 검증을 사용한다. placeholder 환경의 401은 설정 준비 실패로 유지한다.

root의 phase48 최종 검증 신호 → 버전/최종 source 준비 → 운영 설정 build/dist → ASAR 감사·패키지 실행 → 검증된 파일 공개 게시 → 현재 PC 0.1.1→0.1.2 실제 업데이트 순서다. SMTP/DNS 보류, 실제 메일 수신·신규 Windows 녹화 사람 게이트, Graft 미확보 한계는 유지한다. 이 담당자는 위 후속 실행을 수행하지 않았다.

## 후속 source 복사 준비

이 체크 이후 root가 phase48 targeted green 14 PASS와 package/lock 0.1.2 메타데이터 변경을 알리고, 최종 Strict/unit/독립분석/41개 회귀 전에도 source 복사만 준비하도록 지시했다. 위 목록의 47개 파일(39개 제품 소스·6개 설정/리소스·2개 alias)을 fresh source에 복사하고 원본/복사본 SHA-256이 모두 일치함을 확인했다. 실제 node_modules는 보존했고 원본 파일은 바꾸지 않았다.

파일별 provenance는 ignored `.vercel/desktop-release-012-source-copy.json`에 있다. `FinalVerificationComplete: false`로 기록했으며 아직 최종 릴리스 소스 검증을 주장하지 않는다. 최초 PowerShell lock 파싱은 빈 문자열 packages 키 때문에 실패했고 `ConvertFrom-Json -AsHashtable`로 고친 뒤 복사를 완료했다. 이 준비 실패에서는 파일 복사를 시작하지 않았다. 빌드·staging·게시·설치는 수행하지 않았다. 제품 코드가 바뀌면 마지막 재복사와 해시 확인이 필요하며 이전 receipt는 별도 timestamp 파일로 보존한다.
