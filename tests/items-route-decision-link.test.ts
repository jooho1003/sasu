import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ membership: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mock.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mock.client }));

import { GET } from "@/app/api/d/[dept]/items/route";

const DEPT = "a1111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ dept: DEPT }) };

type Filter = { op: string; col: string; val: unknown };
type Tables = Record<string, (filters: Filter[]) => unknown[]>;

function fakeClient(tables: Tables, calls: string[]) {
  return {
    from(table: string) {
      const filters: Filter[] = [];
      calls.push(table);
      const builder: Record<string, unknown> = {};
      const chain = (op: string) => (col: unknown, val?: unknown) => {
        filters.push({ op, col: String(col), val });
        return builder;
      };
      for (const op of ["eq", "in", "is", "gte", "order", "limit"]) builder[op] = chain(op);
      builder.select = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) => {
        const data = (tables[table]?.(filters) ?? []) as unknown[];
        return Promise.resolve({ data, error: null, count: data.length }).then(resolve);
      };
      return builder;
    },
  };
}

const itemRow = (id: string) => ({
  id, author: "a", spoken_at: null, content: "c",
  sources: { title: "t", kind: "slack_channel" },
  classifications: { label: "decision", confidence: 0.9 },
});

async function decisionIds(tables: Tables) {
  mock.client.mockResolvedValue(fakeClient(tables, []));
  const response = await GET(
    new NextRequest(`http://localhost/api/d/${DEPT}/items`),
    context,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  return Object.fromEntries(body.items.map((i: { id: string; decisionId: string | null }) => [i.id, i.decisionId]));
}

describe("dashboard items decision link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.membership.mockResolvedValue({ deptId: DEPT, role: "lead" });
  });

  it("카드(decision_request)에서 내린 결정도 원본 item 에 연결한다", async () => {
    const result = await decisionIds({
      items: () => [itemRow("i1"), itemRow("i2")],
      citations: (f) =>
        f.some((x) => x.col === "owner_kind" && x.val === "decision_request")
          ? [{ item_id: "i1", owner_id: "req-1" }]
          : [],
      decision_requests: () => [{ id: "req-2", origin_item_id: "i2" }],
      decisions: (f) => {
        const ids = (f.find((x) => x.col === "request_id")?.val ?? []) as string[];
        return ids.map((rid) => ({ id: `dec-of-${rid}`, request_id: rid }));
      },
    });
    expect(result).toEqual({ i1: "dec-of-req-1", i2: "dec-of-req-2" });
  });

  it("직접 결정 citation 이 있으면 카드 경유 매핑보다 우선한다", async () => {
    const result = await decisionIds({
      items: () => [itemRow("i1")],
      citations: (f) =>
        f.some((x) => x.val === "decision")
          ? [{ item_id: "i1", owner_id: "direct-dec" }]
          : [{ item_id: "i1", owner_id: "req-1" }],
      decision_requests: () => [],
      decisions: () => [{ id: "card-dec", request_id: "req-1" }],
    });
    expect(result).toEqual({ i1: "direct-dec" });
  });

  it("결정이 없으면 null 이다", async () => {
    const result = await decisionIds({ items: () => [itemRow("i1")] });
    expect(result).toEqual({ i1: null });
  });
});
