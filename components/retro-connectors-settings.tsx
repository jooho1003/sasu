"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  RetroConnectionConfig,
  RetroConnectionProvider,
} from "@/lib/contracts";
import {
  RETRO_PRESETS,
  RETRO_PRESET_COPY,
  recommendedConnectors,
  type RetroPreset,
} from "@/lib/retro/presets";
import { CONNECTOR_LABELS } from "@/lib/retro/connectors/registry";
type Connection = {
  id: string;
  provider: RetroConnectionProvider;
  status: string;
  account_label: string;
  config: RetroConnectionConfig;
  last_pulled_at: string | null;
  last_error: string | null;
  failure_count: number;
};
type Provider = {
  id: RetroConnectionProvider;
  label: string;
  token: boolean;
  oauth: boolean;
};
const control =
  "rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm disabled:opacity-40";
export function RetroConnectorsSettings({
  dept,
  role,
}: {
  dept: string;
  role: "lead" | "member";
}) {
  const [preset, setPreset] = useState<RetroPreset>("general"),
    [connections, setConnections] = useState<Connection[]>([]),
    [providers, setProviders] = useState<Provider[]>([]);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [shared, setShared] = useState(false);
  const [provider, setProvider] = useState<RetroConnectionProvider>("github"),
    [scope, setScope] = useState(""),
    [secret, setSecret] = useState(""),
    [consent, setConsent] = useState(false);
  const [cloudId, setCloudId] = useState("");
  const [wantedClient, setWantedClient] = useState(""),
    [wantedSecret, setWantedSecret] = useState("");
  const departmentSource = provider === "wanted" || provider === "stibee";
  const base = "/api/d/" + dept + "/retros";
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(base + "/connections", {
          cache: "no-store",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "연결 목록을 불러오지 못했습니다.");
        setConnections(data.connections);
        setPreset(data.preset);
        setProviders(data.providers);
        setShared(data.shareConsented);
      } catch (error) {
        if (!signal?.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "연결 목록을 불러오지 못했습니다.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [base],
  );
  // This effect synchronizes the authenticated server snapshot.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Loads the server snapshot asynchronously.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function request(path: string, method: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(result.error || "요청하지 못했습니다.");
    return result;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "요청하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const recommended = recommendedConnectors(preset);
  const orderedProviders = [...providers].sort(
    (a, b) =>
      Number(recommended.includes(b.id)) - Number(recommended.includes(a.id)),
  );
  const selected = providers.find((p) => p.id === provider);
  const values = scope
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const config: RetroConnectionConfig =
    provider === "github"
      ? { repositories: values }
      : provider === "figma"
        ? { files: values }
        : provider === "notion"
          ? { pages: values }
          : provider === "jira"
            ? { cloudId, projects: values }
            : provider === "confluence"
              ? { cloudId, pageIds: values }
              : provider === "linear"
                ? { issues: values }
                : provider === "ga4"
                  ? { propertyId: scope.trim() }
                  : provider === "zendesk"
                    ? { subdomain: scope.trim() }
                    : {};
  const scopeLabel =
    provider === "github"
      ? "저장소 이름 (소유자/저장소)"
      : provider === "figma"
        ? "파일 주소에 있는 파일 키"
        : provider === "jira"
          ? "프로젝트 키"
          : provider === "confluence"
            ? "페이지 주소에 있는 숫자 번호"
            : provider === "linear"
              ? "이슈의 고유번호"
              : provider === "ga4"
                ? "통계를 볼 속성의 숫자 번호"
                : provider === "zendesk"
                  ? "사이트 주소의 첫 부분"
                  : "페이지 주소에 있는 페이지 고유번호";
  const needsScope = [
    "github",
    "figma",
    "notion",
    "jira",
    "confluence",
    "linear",
    "ga4",
    "zendesk",
  ].includes(provider);
  const needsSite = provider === "jira" || provider === "confluence";
  const scopeMissing =
    (needsScope && !values.length) || (needsSite && !cloudId.trim());
  async function add(oauth: boolean) {
    if (!consent) return;
    await run(async () => {
      if (oauth) {
        const result = await request(
          "/api/retro/connect/" + provider + "/start",
          "POST",
          { dept, config, consent: true },
        );
        window.location.assign(result.url);
        return;
      }
      await request(base + "/connections", "POST", {
        provider,
        secret:
          provider === "wanted"
            ? JSON.stringify({
                clientId: wantedClient,
                clientSecret: wantedSecret,
                authorization: secret,
              })
            : secret,
        config,
        consent: true,
      });
      setSecret("");
      setWantedClient("");
      setWantedSecret("");
      setConsent(false);
      await load();
      setMessage("계정을 연결했습니다. 오늘 기록을 가져올 수 있습니다.");
    });
  }
  return (
    <section
      className="grid gap-5 rounded-2xl border border-ink/10 bg-surface p-5"
      id="retro-connectors"
    >
      <h2 className="m-0 text-xl">회고에 쓸 기록 연결</h2>
      <p className="m-0 text-sm text-muted">
        내 계정과 선택한 자료에서 오늘 기록을 가져옵니다. 고객·참석자의 연락처
        필드는 가져오지 않습니다. 연결을 끊으면 가져온 활동도 지우며, 그 활동을
        근거로 쓴 회고 항목은 표시되지 않습니다.
      </p>
      <label className="grid gap-2 text-sm">
        부서 회고 방식
        <select
          className={control}
          value={preset}
          disabled={role !== "lead" || busy || loading}
          onChange={(e) => {
            const value = e.target.value as RetroPreset;
            void run(async () => {
              await request(base + "/preset", "PATCH", { preset: value });
              setPreset(value);
              setMessage("회고 방식을 저장했습니다.");
            });
          }}
        >
          {RETRO_PRESETS.map((v) => (
            <option key={v} value={v}>
              {RETRO_PRESET_COPY[v].label}
            </option>
          ))}
        </select>
      </label>
      <p className="m-0 text-sm">{RETRO_PRESET_COPY[preset].hint}</p>
      <div className="grid gap-3">
        <h3 className="m-0 text-base">내 연결</h3>
        {loading ? (
          <p role="status">연결 목록을 불러오고 있습니다.</p>
        ) : !connections.length ? (
          <p className="m-0 text-sm text-muted">
            아직 연결한 서비스가 없습니다.
          </p>
        ) : (
          connections.map((c) => (
            <div key={c.id} className="grid gap-3 rounded-xl border p-4">
              <p className="m-0 font-bold">
                {CONNECTOR_LABELS[c.provider]} ·{" "}
                {c.status === "revoked"
                  ? "연결 끊김"
                  : c.failure_count >= 3
                    ? "다시 연결 필요"
                    : c.status === "error"
                      ? "다시 가져오기 필요"
                      : "연결됨"}
              </p>
              <p className="m-0 text-sm">
                {c.account_label} ·{" "}
                {Object.values(c.config)
                  .filter(Array.isArray)
                  .reduce((n, v) => n + v.length, 0) || "내 계정"}
                {Object.values(c.config).some(Array.isArray) ? "개 자료" : ""}
              </p>
              <p className="m-0 text-sm text-muted">
                {c.last_pulled_at
                  ? "마지막으로 가져온 때: " +
                    new Date(c.last_pulled_at).toLocaleString("ko-KR")
                  : "아직 가져온 기록이 없습니다."}
              </p>
              {c.status !== "revoked" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request(
                          base + "/connections/" + c.id + "/pull",
                          "POST",
                        );
                        setMessage(
                          "가져오기를 요청했습니다. 잠시 뒤 목록을 새로고침해 주세요.",
                        );
                      })
                    }
                  >
                    지금 가져오기
                  </button>
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "연결을 끊고 이 서비스에서 가져온 활동을 지울까요? 이미 내려받은 파일은 지워지지 않습니다.",
                        )
                      )
                        void run(async () => {
                          await request(
                            base + "/connections/" + c.id,
                            "DELETE",
                          );
                          await load();
                          setMessage("연결과 가져온 활동을 지웠습니다.");
                        });
                    }}
                  >
                    연결 끊기
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      <button
        className={control + " w-fit"}
        disabled={busy || loading}
        onClick={() => void run(() => load())}
      >
        목록 새로고침하기
      </button>
      <details>
        <summary className="cursor-pointer font-bold">
          기록 가져올 곳 연결하기
        </summary>
        <div className="grid gap-4 pt-4">
          <label className="grid gap-2">
            서비스
            <select
              className={control}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as RetroConnectionProvider);
                setScope("");
                setCloudId("");
                setSecret("");
                setWantedClient("");
                setWantedSecret("");
                setConsent(false);
              }}
            >
              {orderedProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {recommended.includes(p.id) ? " · 부서 추천" : ""}
                </option>
              ))}
            </select>
          </label>
          {needsSite ? (
            <label className="grid gap-2 text-sm">
              사이트의 고유번호
              <input
                className={control}
                value={cloudId}
                maxLength={36}
                onChange={(e) => setCloudId(e.target.value.trim())}
              />
              <span>
                사이트의 설정에서 고유번호를 복사해 주세요. 계정에서 허용한
                사이트인지 연결할 때 다시 확인합니다.
              </span>
            </label>
          ) : null}
          {needsScope ? (
            <label className="grid gap-2 text-sm">
              {scopeLabel}
              <textarea
                className={control}
                maxLength={2000}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder={
                  provider === "github"
                    ? "my-team/project"
                    : provider === "ga4"
                      ? "숫자 번호 하나"
                      : provider === "zendesk"
                        ? "주소의 첫 부분"
                        : "한 줄에 하나씩, 최대 10개"
                }
              />
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-[15px] leading-6">
            <input
              className="mt-1"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {departmentSource
                ? "부서의 지원 현황 또는 발송 건을 가져오는 데 동의합니다. 팀장만 연결할 수 있으며, 내 활동의 근거로 쓸 수 없습니다."
                : "내 계정의 활동 제목·시각·짧은 내용을 회고에 저장하는 데 동의합니다. 처음에는 본인만 볼 수 있으며, 부서 공개는 따로 동의합니다."}
            </span>
          </label>
          {selected?.oauth ? (
            <button
              className={control + " w-fit"}
              disabled={busy || !consent || scopeMissing}
              onClick={() => void add(true)}
            >
              계정으로 연결하기
            </button>
          ) : !selected?.token ? (
            <p className="m-0 text-sm text-muted">
              이 서비스의 계정 연결을 준비 중입니다.
            </p>
          ) : null}
          {selected?.token ? (
            <>
              {provider === "wanted" ? (
                <>
                  <label className="grid gap-2 text-sm">
                    회사 연결 고유번호
                    <input
                      className={control}
                      type="password"
                      autoComplete="off"
                      value={wantedClient}
                      maxLength={1000}
                      onChange={(e) => setWantedClient(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    회사 연결 비밀 키
                    <input
                      className={control}
                      type="password"
                      autoComplete="off"
                      value={wantedSecret}
                      maxLength={2000}
                      onChange={(e) => setWantedSecret(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {departmentSource ? (
                <p className="m-0 text-sm text-muted">
                  {provider === "stibee"
                    ? "이메일 목록 읽기는 프로 요금제 이상에서 쓸 수 있습니다."
                    : "지원서 제출일별 현황만 읽습니다. 지원자 이름·연락처는 가져오지 않습니다."}
                </p>
              ) : null}
              <label className="grid gap-2 text-sm">
                {provider === "github"
                  ? "선택한 저장소의 읽기 권한을 준 개인 세부 권한 키"
                  : provider === "wanted"
                    ? "회사에서 발급한 인증 값"
                    : provider === "stibee"
                      ? "부서 작업 공간의 연결 키"
                      : "읽기 권한을 준 개인 키"}
                <input
                  className={control}
                  type="password"
                  autoComplete="off"
                  maxLength={8000}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
              <button
                className={control + " w-fit"}
                disabled={
                  busy ||
                  !secret ||
                  !consent ||
                  scopeMissing ||
                  (provider === "wanted" && (!wantedClient || !wantedSecret))
                }
                onClick={() => void add(false)}
              >
                {departmentSource ? "부서 키로 연결하기" : "개인 키로 연결하기"}
              </button>
            </>
          ) : null}
        </div>
      </details>
      {shared ? (
        <div className="grid gap-2">
          <p className="m-0 text-sm">
            회고 공개에 동의했습니다. 거두면 이 부서의 내 회고가 모두 본인만
            보기로 바뀝니다.
          </p>
          <button
            className={control + " w-fit"}
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "공개 동의를 거두고 모든 회고를 본인만 보기로 바꿀까요?",
                )
              )
                void run(async () => {
                  await request(base + "/share-consent", "DELETE");
                  setShared(false);
                  setMessage("공개 동의를 거뒀습니다.");
                });
            }}
          >
            공개 동의 거두기
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="m-0 text-sm" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
