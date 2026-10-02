// Design Ref: desktop-companion §4·§7 — all network access stays in main with a 15-second Bearer boundary.
import type { SupabaseClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 15_000;

type Parser<T> = (value: unknown) => T;
type UnauthorizedHandler = () => Promise<void>;
type FetchImplementation = (
  input: string | Request,
  init?: RequestInit,
) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

function endpoint(baseUrl: string, path: string): URL {
  if (!path.startsWith("/api/companion/")) {
    throw new ApiError(null, "invalid_path", "허용되지 않은 앱 경로입니다.");
  }
  const base = new URL(baseUrl);
  const target = new URL(path, base);
  if (target.origin !== base.origin) {
    throw new ApiError(null, "invalid_path", "허용되지 않은 앱 경로입니다.");
  }
  return target;
}

async function errorPayload(response: Response): Promise<{ code: string; error: string }> {
  const value = (await response.json().catch(() => null)) as unknown;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.error === "string") {
      return { code: record.code, error: record.error };
    }
  }
  return { code: `http_${response.status}`, error: "요청을 처리하지 못했습니다." };
}

export class ApiClient {
  private generation = 0;
  private suspended = false;
  private readonly requests = new Set<AbortController>();
  constructor(
    private readonly baseUrl: string,
    private readonly supabase: SupabaseClient,
    private readonly onUnauthorized: UnauthorizedHandler,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  invalidateSession(): void {
    this.generation += 1;
    this.suspended = true;
    for (const request of this.requests) request.abort();
  }

  resumeSession(): void {
    this.invalidateSession();
    this.suspended = false;
  }

  private assertCurrent(generation: number): void {
    if (this.suspended || generation !== this.generation) {
      throw new ApiError(401, "session_changed", "기기 로그인이 변경되었습니다.");
    }
  }

  get<T>(path: string, parser: Parser<T>): Promise<T> {
    return this.request(path, { method: "GET" }, parser);
  }

  postJson<T>(path: string, body: unknown, parser: Parser<T>): Promise<T> {
    return this.request(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      parser,
    );
  }

  postForm<T>(path: string, body: FormData, parser: Parser<T>): Promise<T> {
    return this.request(path, { method: "POST", body }, parser);
  }

  async delete(path: string): Promise<void> {
    await this.request(path, { method: "DELETE" }, () => undefined);
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    parser: Parser<T>,
  ): Promise<T> {
    const generation = this.generation;
    this.assertCurrent(generation);
    const session = await this.supabase.auth.getSession();
    this.assertCurrent(generation);
    const token = session.data.session?.access_token;
    if (session.error || !token) {
      // The initial login screen probes the device link while intentionally
      // signed out. Clearing storage for that normal state can race a new OTP
      // session and erase it. A server-side 401 after a bearer request is the
      // authoritative revocation signal and is handled below.
      throw new ApiError(401, "session_invalid", "기기 로그인이 만료되었습니다.");
    }

    const controller = new AbortController();
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("accept", "application/json");
    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(endpoint(this.baseUrl, path).toString(), {
          ...init,
          headers,
          redirect: "error",
          signal: controller.signal,
        });
      } catch (cause) {
        this.assertCurrent(generation);
        if (cause instanceof ApiError) throw cause;
        const code = cause instanceof Error && cause.name === "AbortError" ? "timeout" : "network";
        throw new ApiError(null, code, "서버에 연결하지 못했습니다.", { cause });
      }
      this.assertCurrent(generation);

      if (!response.ok) {
        const payload = await errorPayload(response);
        this.assertCurrent(generation);
        if (response.status === 401) await this.onUnauthorized();
        throw new ApiError(response.status, payload.code, payload.error);
      }

      try {
        const value = response.status === 204 ? null : await response.json();
        this.assertCurrent(generation);
        return parser(value);
      } catch (cause) {
        this.assertCurrent(generation);
        if (cause instanceof ApiError) throw cause;
        throw new ApiError(response.status, "invalid_response", "서버 응답을 확인하지 못했습니다.", { cause });
      }
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
    }
  }
}
