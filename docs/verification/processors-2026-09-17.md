# 처리자 설정 확인 — 2026-09-17

상태: **공개 계약 확인 완료, 실제 계정 설정 확인 미완료**. 개인정보 페이지의 일괄 ZDR 보장 문구를 확인 중이라는 안내로 교체했다. 실제 원본 음성이 Groq로 전송된다는 안내도 추가했다.

## Voyage AI

- [공식 FAQ](https://docs.voyageai.com/docs/faq)의 Data Privacy 설명을 확인했다. 저장·학습 사용을 옵트아웃하면 zero-day retention을 적용한다. 조직 관리자와 등록된 결제수단이 필요하며 Organization → Terms of Service에서 상태를 변경한다.
- Chrome의 별도 작업 탭으로 [대시보드](https://dashboard.voyageai.com/)를 열었으나 로그인 화면이었다. 계정 설정이나 옵트아웃 상태를 관측하지 못했고 변경도 수행하지 않았다. 비밀번호·MFA·결제정보를 요청하거나 수집하지 않았다.
- 로그인 지원을 사용자에게 요청했다. **실제 Opted Out 화면 캡처 없음. V13 미충족.**

## Groq

공식 [Services Agreement](https://console.groq.com/docs/legal/services-agreement), [Customer DPA](https://console.groq.com/docs/legal/customer-data-processing-addendum), [Your Data](https://console.groq.com/docs/your-data)를 확인했다. 공개 계약은 2026-06-22 개정본이며, 해당 고객의 개별 계약·주문서가 우선하는지까지는 확인하지 못했다.

| 근거 | 확인한 내용 |
|---|---|
| Services Agreement §4.2 | 고객의 명시적 허용·지시 없이 입력·출력을 모델 학습·미세조정에 사용하지 못한다. 서비스 제공·법 준수·안정성·AUP 확인에는 접근·보관 예외가 있고 콘솔 ZDR 설정으로 일부 예외를 차단한다. 짧은 인용: “unless explicitly granted permission or instructed by Customer.” |
| DPA §2.3 | 서비스 제공·유지·지원, 고객의 문서화된 지시, 법적 요구에 따라 개인정보를 처리한다. 짧은 인용: “in compliance with Customer's documented instructions” |
| DPA §10 및 Schedule A | 종료 시 삭제 요청은 합리적으로 가능한 시점부터 최대 180일, 법적 보존과 격리된 백업 예외가 있다. 일반 처리 보존 기간은 처리 목적 달성에 필요한 기간으로 규정된다. 이 조항 자체가 요청별 ZDR 증명은 아니다. |
| Your Data | 기본 추론 요청은 저장하지 않으나 안정성·오남용 조사 예외 로그는 최대 30일이며 법적 예외가 있다. 관리자가 Data Controls에서 ZDR를 켤 수 있다. 메타데이터는 별도 보존된다. |

Groq 콘솔의 실제 조직별 Data Controls, 동의·개별 계약 상태를 아직 확인하지 않았다. 따라서 공개 약관의 학습 제한과 실제 조직의 ZDR 설정을 구분하며, **계정 수준 무보존 확인 완료로 기록하지 않는다**.

## 쿠키 검증에서 발견한 설계 전제 차이

설계 SEC-05의 기본값 설명과 설치된 `@supabase/ssr` 0.12.7 소스가 다르다. `node_modules/@supabase/ssr/dist/main/utils/constants.js`의 `DEFAULT_COOKIE_OPTIONS`는 `path: '/'`, `sameSite: 'lax'`, `httpOnly: false`, `maxAge: 400*24*60*60`이며 `secure`는 명시하지 않는다. 일반 브라우저 세션과 별도로 심사위원 쿠키는 기존 proxy에서 HttpOnly/Secure를 설정한다.

운영 로그인 응답 쿠키는 실측하지 않았다. SDK 기본값을 HttpOnly·Secure라고 단정하지 않으며, 설계 지침대로 이번 작업에서 일반 세션 쿠키를 덮어쓰지 않았다.
