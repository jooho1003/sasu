# Step 5: retro-ui

타임라인·상세·설정 절·내비 항목을 만든다. 1440px·390px 둘 다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-05·07) · §7 디자인 가이드 · `/docs/ARCHITECTURE.md` §3.5·§6-4 불변식 25
- `docs/planning/개발_회고_자동화_설계.md` §6 — 화면 명세
- `app/(auth)/d/[dept]/reviews/page.tsx`·`reviews/[id]/page.tsx` — 패턴 A(`requirePageMembership` + 클라이언트 fetch)
- `components/reviewed-materials.tsx`(목록·드롭 업로드) · `components/review-detail.tsx`(revision 편집·확정·2분 timeout 표시) — 복제 원형
- `components/ledger-s3.tsx` — 날짜 그룹 목록·필터 UI 관행 · `components/settings-s5.tsx` — 설정 절 추가 위치
- `components/site-shell.tsx`·워크스페이스 내비(`app/(auth)/d/[dept]/layout.tsx`) — 메뉴 항목 추가

## 작업

1. `app/(auth)/d/[dept]/retros/page.tsx` → `components/retro-timeline.tsx`: 상단 [오늘 회고 만들기] 패널(드롭존 `.json` ≤1MB → POST · "사수 활동만으로 만들기" 버튼 · 수집기 안내 링크 `docs/setup-guide.md §15`) · 날짜 그룹 목록(카드: 날짜·작성자·제목·주제 칩·활동 수·상태 배지·공개 범위 아이콘) · 필터(사람·주제·기간·내 회고만) · 사이드: 이번 주 주제 top 10(`topics` 집계는 클라이언트), 사람별 확정 일수. 빈 상태 문구: "아직 회고가 없어요. 수집기로 오늘 활동을 모아 보세요."
2. `app/(auth)/d/[dept]/retros/[id]/page.tsx` → `components/retro-detail.tsx`: 헤더(상태·공개 범위 select·[확정]·[내보내기 ▾]·[삭제 — confirm 모달]) · 본문(제목·하이라이트·4섹션, 항목마다 인용 칩 → popover에 활동 kind·시각·제목·text) · 활동 패널(kind 그룹·제외 토글·[다시 생성], `web_*`는 접힘) · 편집 모드(제목·항목 텍스트 수정/삭제, 인용 수정 불가, `revision` 동봉, 409 시 새로고침 안내) · `drafting`은 폴링 5초, 2분 넘으면 실패 표시 + [다시 생성].
3. **인용이 0개인 항목은 렌더하지 않는다**(서버가 걸러도 클라이언트에서 한 번 더).
4. `components/settings-s5.tsx`에 "회고 수집기" 절: 설정 파일 템플릿 다운로드(정적 JSON), 스케줄 안내 링크, "자동 업로드 토큰은 준비 중"(2단계).
5. 내비에 "회고" 항목(원장 다음). 게스트 내비는 step 6에서.
6. 접근성: 칩·토글에 `aria-label`, popover는 키보드로 열림, 색만으로 상태를 구분하지 않는다(배지 텍스트).

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run build
# 스크린샷(docs/verification/daily-retro-<date>/): retros-timeline-1440.png · retros-timeline-390.png · retro-detail-1440.png · retro-detail-390.png · settings-retro-1440.png
# 상세 화면에서 인용 없는 항목이 보이지 않는지: 픽스처 revision에 citations:[] 항목을 넣고 렌더 0개 확인(테스트 또는 캡처)
```

## 금지사항

- 화면에 "N건 제외"·"비공개 회고 N건" 같은 존재 힌트를 두지 마라. 이유: 가시성 규칙.
- 인용 칩 popover에 `web_visit` 전체 URL 경로를 그대로 노출하지 마라 — 도메인+제목만. 이유: 설계 §8·불변식 23 최소 노출.
- 클라이언트에서 service role·anon key 외 비밀을 쓰지 마라. 이유: CRITICAL 비밀값.
- i18n 프레임워크·영문 문구를 넣지 마라. 이유: UI 한국어 단일.
