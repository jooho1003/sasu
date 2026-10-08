# 웹 회의 녹음 step 검증 연결

- [Step 0: 브라우저·기기 입력 검증](step0.md)
- [Step 1: 서버 녹음 세션·구간 원본](step1.md)
- [Step 2: 녹음 화면·검토 연결](step2.md)
- [Step 3: 심사위원 메모리 녹음 데모](step3.md)
- [Step 4-A: 자료 보호·제공사·CSP](step4a.md)
- [Step 4-B1~B5: 전사 시각·경계·검토·인용 위치](accuracy-step4b5.md)
- [Step 4-B6: 문서 요약 병합](accuracy-step4b6.md) · [4-B7: 부서 용어집](accuracy-step4b7.md) · [4-B8: 정량 측정 준비](accuracy-step4b8.md) · [V20 실측 결과](accuracy.md)
- [실기기 녹음 실측 2026-10-05·08: V01·V03~V06·V20](real-device-2026-10-08/README.md)
- [현재 코드의 격리 로컬 제품 E2E](product-e2e-20260929.md)
- [Archify: 녹음·서버 검증 흐름도](archify-step2/recording-flow.html) · [실행 검사 요약](archify-step2/width-review/recording-flow.finalize-summary.json)

## 2026-09-29 로컬 판정

최종 `npm run test` 159파일·1,704건, 격리 SQL 280건, `npm run build`, 변경 파일 ESLint·전체 문구 검사(blocking 0), 합성 녹음 Chrome 21건(기존 실시간 장기 1 skip), 검토 화면 Chrome 29건을 통과했다. 전체 `npm run lint` 마지막 실행은 파일 스캔이 수분간 정체돼 중단했고, 변경 파일 ESLint와 전체 문구 검사로 범위를 나눠 확인했다. 두 브라우저 모음을 동시에 실행한 첫 시도에서는 검토 화면 모듈 로딩 전 타임아웃이 발생했으나, 단독 재실행 29/29 통과했다. `0064`는 로컬 Supabase에만 적용했다. `.env`의 원격 DB에 테스트를 쓰지 않도록 격리 QA Supabase에 0063·0064를 적용해 제품 E2E를 실행했고, 현재 코드에서 **9/9 통과**했다. [이전 로컬 제품 E2E](l3-20260929/README.md)는 변경 전 범위의 기록이다.

## 전체 완료 전에 필요한 실제 증거

- V01~V06: Windows/macOS 실제 마이크·Meet/Zoom 탭 또는 시스템 소리·복구/절전/권한·30분 동작. 합성 브라우저 검사를 OS 지원 증명으로 쓰지 않는다.
  - 2026-10-08 Windows Chrome 실기기([기록](real-device-2026-10-08/README.md)): V01·V04·V05(복구) 충족, V03은 실제 USB 분리만 미확정, V06은 시작 전 용량 부족·OS 절전 미검증. V02(실제 Meet·Zoom 회의)와 macOS는 남았다. 실측 중 찾은 전사·요약 결함 9건은 같은 기록에 있다.
- V13: 운영 Groq 키가 ZDR 적용 조직의 키인지 확인하고 DPA, Voyage 계정 옵트아웃을 기록한다.
- V14: 2026-10-03 운영 강제 전환과 운영 확인을 마쳤다([기록](../csp-enforce-2026-10-03/README.md)). 실제 사용자 위반을 모을 report-uri는 아직 없다.
- V16·V20: 지시문 포함 합성 문서의 실제 모델 출력 검토와 20분×3모드 원본·용어 30개·회의 5건 라벨로 CER/용어 CER/낮은 신뢰 표시율/precision·recall을 실측한다.
  - 2026-10-08 V20 실측 완료, **기준 미충족**([accuracy.md](accuracy.md)): 용어 CER은 세 모드 모두 개선됐으나 낮은 신뢰 표시율 0~1.2%(기준 50%), 시스템 모드 전체 CER +0.04%p.
- 운영 DB migration·배포·스위치 활성화는 별도 검증과 사용자 승인 후 진행한다. 기존 제품 배포 URL의 상태와 이번 변경의 배포 상태를 혼동하지 않는다.

Windows Chrome의 실제 마이크 5초 트랙은 이전에 확인했지만, 위 시나리오를 대체하지 않는다. 구조·흐름 변경의 Graft/Archify 실행 도구는 이번 세션에서 찾지 못했다. 호출 관계는 각 B6·B7 기록에 수동으로 적었으며 이를 도구 결과로 주장하지 않는다.
