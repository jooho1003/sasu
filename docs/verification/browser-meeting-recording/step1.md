# Phase 23 step1 — 구간 원본과 서버 검증

[step1 명세](../../../phases/23-browser-meeting-recording/step1.md)가 지정한 완료 기록 위치다. 세 하위 단계의 실행 기록을 잇는다. **step1 완료가 아니다.** step1의 선행 조건인 step0 실제 기기 녹음·복구(V01~V06)가 아직 통과하지 않았고, 운영 반영도 하지 않았다.

| 하위 단계 | 내용 | 결과 요약 | 기록 |
|---|---|---|---|
| 1-A (2026-09-25) | 구간 원본 순수 모듈: 독립 WAV 분할, manifest v1, WAV·해시 검증, 60+1초 전사 창 | 순수 모듈 TDD, 합성 브라우저 실험실 | [recording-originals](../recording-originals-2026-09-25/README.md) |
| 1-B (2026-09-25) | 녹음 시작 전 서버 세션(0059): 동의·스위치·한도·동의 스냅샷, 세션 기준 키, 폐기·만료·철회 | SQL 259(세션 14)·단위 1,508·lint/build·Archify | [recording-sessions](../recording-sessions-2026-09-25/README.md) |
| 1-C (2026-09-25) | 저장·구간 업로드·서버 검증·1회 완료·전사 창·구간 접근권·파기(0060) | SQL 277(구간 18)·돌연변이 6/6·단위 1,592·lint/build·실제 로컬 Storage 18·Archify·Graft | [recording-segments](../recording-segments-2026-09-25/README.md) |

step1 명세 1~7 대비: 1(녹음 세션)·2(키)는 1-B, 3(저장·원본 가용성)·4(검증·전사)·5(접근·파기)·6(API)은 1-C에서 구현했다. 7(검증)은 격리 SQL과 실제 로컬 Supabase Storage로 실행했다. 실제 동시 트랜잭션 경합, 실제 Groq 전사, 녹음 화면은 확인하지 않았다(각 기록의 "확인하지 않은 것").

남은 게이트: step0 실제 기기 V01~V06, 제공사 확인·운영 CSP 관찰/강제 승인(step4-A), 운영 DB의 `input_method<>'upload'` 0건 확인 뒤 0058·0059·0060 적용 승인, step2 녹음 화면.
