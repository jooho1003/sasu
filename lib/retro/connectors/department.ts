import { z } from "zod";
import { RetroCredential, type RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "@/lib/retro/bundle";
import { connectorError, connectorJson } from "./http";
import { dayWindow, record, rows, str } from "./map";

const WantedKey = z.strictObject({
  clientId: z.string().min(1).max(1000),
  clientSecret: z.string().min(1).max(2000),
  authorization: z.string().min(1).max(3000),
});
export const isDepartmentConnector = (provider: string) =>
  provider === "wanted" || provider === "stibee";
export function departmentHeaders(
  provider: string,
  c: RetroCredential,
): Record<string, string> {
  if (provider === "stibee") return { AccessToken: c.accessToken };
  if (provider !== "wanted") throw connectorError("connector_scope_denied");
  let input: unknown;
  try {
    input = JSON.parse(c.accessToken);
  } catch {
    throw connectorError("invalid_connection");
  }
  const parsed = WantedKey.safeParse(input);
  if (!parsed.success) throw connectorError("invalid_connection");
  return {
    "wanted-client-id": parsed.data.clientId,
    "wanted-client-secret": parsed.data.clientSecret,
    Authorization: parsed.data.authorization,
  };
}
const summaryUrl = (date: string) =>
  `https://openapi.wanted.jobs/v1/stat/application/summary?start_date=${date}&end_date=${date}`;
function counts(input: unknown) {
  const body = record(input),
    keys = ["total", "complete", "document_pass", "hire", "reject"] as const;
  if (keys.some((k) => !Number.isSafeInteger(body[k]) || Number(body[k]) < 0))
    throw connectorError("connector_invalid_response");
  return Object.fromEntries(keys.map((k) => [k, Number(body[k])]));
}
export async function validateDepartmentToken(
  provider: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<RetroCredential> {
  if (!isDepartmentConnector(provider))
    throw connectorError("connector_scope_denied");
  const credential = RetroCredential.parse({
    accessToken: token,
    refreshToken: null,
    expiresAt: null,
    subjectId: `${provider}:department`,
    authKind: "token",
    scopes: [],
  });
  const today = localDate(new Date(), "Asia/Seoul"),
    data = await connectorJson(
      provider === "wanted"
        ? summaryUrl(today)
        : "https://api.stibee.com/v2/emails?limit=1&statuses=SENT",
      { headers: departmentHeaders(provider, credential) },
      fetcher,
    );
  if (provider === "wanted") counts(data);
  else if (!Array.isArray(record(data).items))
    throw connectorError("connector_invalid_response");
  return credential;
}
/** Approved lead-only exception: no individual applicant/subscriber record endpoints. */
export async function pullDepartment(
  provider: string,
  date: string,
  get: (url: string | URL) => Promise<unknown>,
): Promise<RetroActivity[]> {
  const window = dayWindow(date, "Asia/Seoul");
  if (provider === "wanted") {
    const data = counts(await get(summaryUrl(date)));
    return [
      normalizeActivity({
        kind: "department_snapshot",
        ref: `wanted:${date}`,
        at: window.from,
        title: "부서 지원 현황",
        text: `이날 제출된 지원서 ${data.total}건 · 서류 통과 ${data.document_pass}건 · 채용 ${data.hire}건 · 불합격 ${data.reject}건`,
        meta: { provider, dept_context: true, ...data },
      }),
    ];
  }
  if (provider !== "stibee") throw connectorError("connector_scope_denied");
  const output: RetroActivity[] = [];
  for (let page = 0; page < 10 && output.length < 200; page++) {
    const data = record(
      await get(
        `https://api.stibee.com/v2/emails?limit=100&offset=${page * 100}&statuses=SENT&sortBy=sentTime&sortOrder=desc`,
      ),
    );
    if (!Array.isArray(data.items))
      throw connectorError("connector_invalid_response");
    const items = rows(data.items);
    for (const row of items) {
      const at = str(row.sentTime),
        ref = str(row.id);
      if (
        row.status !== 3 ||
        !ref ||
        !Number.isFinite(Date.parse(at)) ||
        localDate(new Date(at), "Asia/Seoul") !== date ||
        output.length >= 200
      )
        continue;
      output.push(
        normalizeActivity({
          kind: "department_snapshot",
          ref: `stibee:${ref}`,
          at: new Date(at).toISOString(),
          title: "부서 이메일 발송",
          text: "연결한 부서에서 이메일을 발송했습니다.",
          meta: { provider, dept_context: true },
        }),
      );
    }
    if (
      items.length < 100 ||
      Date.parse(str(items.at(-1)?.sentTime)) < Date.parse(window.from)
    )
      break;
  }
  return output;
}
