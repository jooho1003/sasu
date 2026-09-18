import { expect, test } from "@playwright/test";

const dept = "22222222-2222-4222-8222-222222222222";
const trailer = "33333333-3333-4333-8333-333333333333";

test("A: 초대 플래그가 꺼진 배포에서는 지원자 링크 API가 열리지 않는다", async ({ request }) => {
  const response = await request.get(`/api/d/${dept}/trailers/${trailer}/invites`);
  expect(response.status()).toBe(404);
});

test.describe("B: QA 조직의 발급·목록·철회", () => {
  test.skip(process.env.E2E_TRAILER_INVITES !== "1", "B 그룹은 QA 조직과 명시적 활성화가 필요합니다.");

  test("명시적으로 활성화한 QA 조직에서 검증한다", async () => {
    // QA 조직의 실제 지원자 데이터는 운영 반영 승인 뒤에만 준비한다.
    test.skip(true, "QA 조직과 운영 반영 승인이 필요합니다.");
  });
});
