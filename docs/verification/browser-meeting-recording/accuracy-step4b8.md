# Phase 23 · step 4-B8 정확률 측정 준비

2026-09-29. [설계 대조 목록](../../02-design/features/browser-meeting-recording.design.md) · [step](../../../phases/23-browser-meeting-recording/step4b8-accuracy-measurement.md).

- `lib/recording/accuracy.ts`는 NFC 정규화 후 공백 제외·구두점 포함 문자 오류율(CER), 용어별 오류율, 실제 오류 구간 중 낮은 신뢰 표시 비율, 결정 후보 precision/recall을 계산한다. 테스트 실패를 먼저 확인한 뒤 `tests/recording/accuracy.test.ts` 5건 통과.
- `npx tsx scripts/measure-recording-accuracy.ts <측정 입력.json>`은 3모드×용어집 전후 6건, 모드별 20분 이상, 서로 다른 용어 30개, 동일 음성 파일 해시, 라벨 있는 회의 5건을 요구한다. 원본 파일을 다시 해시하고 조건이 충족될 때만 `accuracy.md`에 수치를 쓴다. 인자가 없을 때 사용법 오류를 확인했다.
- 녹음 원본·대본·전사·수작업 오류 라벨이 아직 제공되지 않았다. 따라서 CER·용어 CER·낮은 신뢰 적중률·결정 후보 precision/recall의 **실측 수치는 없고 V20은 미충족**이다. 임의의 숫자로 채우지 않았다.
