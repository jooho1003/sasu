import { expect, test } from "@playwright/test";

test("비활성 프리뷰는 404이며 시나리오를 렌더하지 않는다", async ({ request }) => {
  const response = await request.get("/trailers");
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("오래된 협력사의 새로운 견적");
});
