import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../client";

const supabase = {
  auth: {
    getSession: vi.fn(async () => ({
      data: { session: { access_token: "test-token" } },
      error: null,
    })),
  },
};

describe("ApiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports an invalid successful response without calling it a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ unexpected: true })));
    const client = new ApiClient("http://127.0.0.1:3011", supabase as never, vi.fn());

    await expect(client.get("/api/companion/link", () => {
      throw new Error("response_parse_failed");
    })).rejects.toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });
});
