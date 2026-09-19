import { expect, it, vi } from "vitest";
import {
  departmentHeaders,
  validateDepartmentToken,
  pullDepartment,
} from "@/lib/retro/connectors/department";
const date = "2026-09-19";
it("스티비는 프로 요금제 읽기 권한을 검증하고 당일 발송 존재만 부서 문맥으로 남긴다", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      total: 3,
      items: [
        {
          id: 1,
          status: 3,
          sentTime: date + "T09:00:00+09:00",
          senderEmail: "PRIVATE",
          subject: "PRIVATE",
          owner: "PRIVATE",
        },
        { id: 2, status: 0, sentTime: date + "T09:00:00+09:00" },
        { id: 3, status: 3, sentTime: "2026-09-18T09:00:00+09:00" },
      ],
    }),
  );
  const c = await validateDepartmentToken("stibee", "synthetic", fetcher);
  expect(departmentHeaders("stibee", c)).toEqual({ AccessToken: "synthetic" });
  const output = await pullDepartment("stibee", date, async () =>
    (await fetcher()).json(),
  );
  expect(output).toHaveLength(1);
  expect(output[0].meta.dept_context).toBe(true);
  expect(JSON.stringify(output)).not.toContain("PRIVATE");
});
it("원티드는 공식 집계 엔드포인트만 쓰고 회사 인증 값은 암호화할 payload 안에만 둔다", async () => {
  const secret = JSON.stringify({
    clientId: "client",
    clientSecret: "secret",
    authorization: "authorization-value",
  });
  const fetcher = vi.fn(async () =>
    Response.json({
      total: 3,
      complete: 1,
      document_pass: 1,
      hire: 0,
      reject: 1,
    }),
  );
  const c = await validateDepartmentToken("wanted", secret, fetcher);
  expect(departmentHeaders("wanted", c)).toEqual({
    "wanted-client-id": "client",
    "wanted-client-secret": "secret",
    Authorization: "authorization-value",
  });
  const get = vi.fn<(url: string | URL) => Promise<unknown>>(async () => ({
    total: 3,
    complete: 1,
    document_pass: 1,
    hire: 0,
    reject: 1,
    name: "PRIVATE",
  }));
  const output = await pullDepartment("wanted", date, get);
  expect(String(get.mock.calls[0]?.[0])).toContain(
    "/v1/stat/application/summary?start_date=2026-09-19&end_date=2026-09-19",
  );
  expect(output[0].meta.dept_context).toBe(true);
  expect(JSON.stringify(output)).not.toMatch(
    /PRIVATE|secret|authorization-value/,
  );
});
it("회사 인증 형식과 잘못된 집계를 거절한다", async () => {
  await expect(
    validateDepartmentToken("wanted", '{"clientId":"missing"}', vi.fn()),
  ).rejects.toThrow("invalid_connection");
  await expect(
    pullDepartment("wanted", date, async () => ({ total: -1 })),
  ).rejects.toThrow("connector_invalid_response");
});
