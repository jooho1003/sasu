import { encryptSlackToken } from "@/lib/slack/installation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  postMessage: vi.fn(),
  updateMessage: vi.fn(),
  rpc: vi.fn(),
  workspace: vi.fn(),
  verifySlackSignature: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/slack/verify", () => ({ verifySlackSignature: mocks.verifySlackSignature }));
vi.mock("@/lib/slack/blocks", () => ({ buildDecisionModal: vi.fn() }));
vi.mock("@/lib/slack/post", () => ({
  openModal: vi.fn(),
  postMessage: mocks.postMessage,
  updateMessage: mocks.updateMessage,
}));

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";
const DECISION_ID = "44444444-4444-4444-8444-444444444444";

function rows(table: string): unknown {
  if (table === "decision_requests") {
    return { id: REQUEST_ID, dept_id: DEPT_ID, origin_item_id: null, title: "t", recommendation: null, assignee_id: "u1", status: "open", opened_at: null };
  }
  if (table === "members") {
    return { user_id: "u1", display_name: "팀장", role: "lead", consented_at: "2026-09-10T00:00:00.000Z" };
  }
  return null;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "eq"]) builder[name] = () => builder;
      builder.maybeSingle = async () => ({ data: rows(table), error: null });
      return builder;
    },
    rpc: (name: string, args: unknown) =>
      name === "slack_installation_for_team" ? mocks.workspace(args) : mocks.rpc(name, args),
  }),
}));

import { POST } from "@/app/api/slack/interactions/route";

function submission() {
  const payload = {
    type: "view_submission",
    team: { id: "TTEST" },
    user: { id: "U_LEAD" },
    view: {
      callback_id: "sasu_decision_modal",
      private_metadata: JSON.stringify({
        requestId: REQUEST_ID,
        status: "decided",
        deptId: DEPT_ID,
        channelId: "D1",
        messageTs: "1.1",
      }),
      state: {
        values: {
          sasu_outcome: { x: { value: "결정" } },
          sasu_rationale: { x: { value: "이유" } },
        },
      },
    },
  };
  return new Request("http://localhost/api/slack/interactions", {
    method: "POST",
    body: new URLSearchParams({ payload: JSON.stringify(payload) }).toString(),
    headers: { "x-slack-request-timestamp": "1", "x-slack-signature": "v0=synthetic" },
  });
}

describe("Slack 결정 완료 원장 링크", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 17).toString("base64"));
    vi.stubEnv("SLACK_SIGNING_SECRET", "synthetic-secret");
    mocks.workspace.mockResolvedValue({ data: { org_id: "org", team_id: "TTEST", encrypted_token: encryptSlackToken("xoxb-test", "org", "TTEST") }, error: null });
    mocks.verifySlackSignature.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ data: { ok: true, duplicate: false, status: "decided", decision_id: DECISION_ID, decided_by_name: null, decided_at: null }, error: null });
    mocks.updateMessage.mockResolvedValue(undefined);
    mocks.after.mockImplementation((callback: () => unknown) => callback());
  });

  it("NEXT_PUBLIC_APP_URL이 VERCEL_URL·APP_URL보다 우선한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://getsasu.com");
    vi.stubEnv("VERCEL_URL", "preview-x.vercel.app");
    vi.stubEnv("APP_URL", "https://wrong.example");
    await POST(submission());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(JSON.stringify(mocks.updateMessage.mock.calls)).toContain(
      `<https://getsasu.com/d/${DEPT_ID}/ledger#decision-${DECISION_ID}|`,
    );
  });

  it("NEXT_PUBLIC_APP_URL이 없으면 VERCEL_PROJECT_PRODUCTION_URL을 쓴다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "getsasu.com");
    vi.stubEnv("VERCEL_URL", "preview-x.vercel.app");
    await POST(submission());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(JSON.stringify(mocks.updateMessage.mock.calls)).toContain(
      `<https://getsasu.com/d/${DEPT_ID}/ledger#decision-${DECISION_ID}|`,
    );
  });
});
