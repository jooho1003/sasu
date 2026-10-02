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

  it("does not clear storage while the signed-out login screen checks device state", async () => {
    const onUnauthorized = vi.fn();
    const signedOut = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      },
    };
    const client = new ApiClient("http://127.0.0.1:3011", signedOut as never, onUnauthorized);

    await expect(client.get("/api/companion/link", () => undefined)).rejects.toMatchObject({
      status: 401,
      code: "session_invalid",
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("uses the injected Electron-session fetch implementation", async () => {
    const sessionFetch = vi.fn(async () => Response.json({ ok: true }));
    const client = new ApiClient(
      "http://127.0.0.1:3011",
      supabase as never,
      vi.fn(),
      sessionFetch,
    );

    await expect(client.get("/api/companion/link", (value) => value)).resolves.toEqual({ ok: true });
    expect(sessionFetch).toHaveBeenCalledOnce();
  });
});
