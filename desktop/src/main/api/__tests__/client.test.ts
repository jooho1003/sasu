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

  it.each([200, 401])("discards an old HTTP %i response after a new session starts", async (status) => {
    let complete!: (response: Response) => void;
    const fetchRequest = vi.fn<(input: string | Request, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const unauthorized = vi.fn();
    const client = new ApiClient("http://127.0.0.1:3011", supabase as never, unauthorized, fetchRequest);
    const result = client.get("/api/companion/link", (value) => value);
    const rejected = expect(result).rejects.toMatchObject({ code: "session_changed" });
    await vi.waitFor(() => expect(fetchRequest).toHaveBeenCalledOnce());
    const signal = fetchRequest.mock.calls[0]![1]!.signal!;
    client.invalidateSession();
    expect(signal.aborted).toBe(true);
    client.resumeSession();
    complete(Response.json(status === 200 ? { ok: true } : { code: "session_invalid", error: "old" }, { status }));
    await rejected;
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("blocks requests during clearing even if getSession still returns an old token", async () => {
    const fetchRequest = vi.fn();
    const client = new ApiClient("http://127.0.0.1:3011", supabase as never, vi.fn(), fetchRequest);
    client.invalidateSession();
    await expect(client.get("/api/companion/link", () => undefined)).rejects.toMatchObject({ code: "session_changed" });
    expect(fetchRequest).not.toHaveBeenCalled();
    client.resumeSession();
    fetchRequest.mockResolvedValue(Response.json({ ok: true }));
    await expect(client.get("/api/companion/link", (value) => value)).resolves.toEqual({ ok: true });
  });
});
