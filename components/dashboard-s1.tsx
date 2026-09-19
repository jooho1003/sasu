"use client";

import { label } from "@/lib/labels";
import Link from "next/link";
import { useEffect, useState } from "react";

const TABS = [
  { label: "decision", name: label("itemLabel", "decision") },
  { label: "action", name: label("itemLabel", "action") },
  { label: "info", name: label("itemLabel", "info") },
  { label: "chatter", name: label("itemLabel", "chatter") },
  { label: "unclassified", name: label("itemLabel", "unclassified") },
  { label: "meeting", name: "회의" },
] as const;

type PanelLabel = (typeof TABS)[number]["label"];
type ItemLabel = Exclude<PanelLabel, "meeting">;
type MemberRole = "lead" | "member";

type DashboardItem = {
  id: string;
  author: string | null;
  spoken_at: string | null;
  content: string;
  label: ItemLabel;
  confidence: number | null;
  decisionId: string | null;
  source: {
    title: string | null;
    kind: "slack_channel" | "meeting" | "notion_page" | "document";
  };
};

type DashboardData = {
  items: DashboardItem[];
  counts: {
    slack: number;
    meeting: number;
    document: number;
  };
  channelCount: number;
  totalItems: number;
  filteredTotal: number;
};

type DashboardS1Props = {
  deptId: string;
  displayName: string;
  role: MemberRole;
  trailerPublishingEnabled?: boolean;
};

type LoadedDashboard = {
  label: PanelLabel;
  data: DashboardData;
};

const SOURCE_KIND_LABELS: Record<DashboardItem["source"]["kind"], string> = {
  slack_channel: "슬랙",
  meeting: "회의",
  notion_page: "문서",
  document: "업로드 문서",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function formatSpokenAt(value: string | null): string {
  if (!value) {
    return "시각 미상";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "시각 미상"
    : DATE_FORMATTER.format(date);
}

function needsReview(item: DashboardItem): boolean {
  return item.confidence !== null && item.confidence < 0.6;
}

type PromotionResponse = {
  card_id?: string;
  error?: string;
  message?: string;
};

async function requestPromotion(
  deptId: string,
  itemId: string,
): Promise<PromotionResponse> {
  const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/cards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin_item_id: itemId }),
  });
  const body = (await response.json()) as PromotionResponse;
  if (!response.ok) {
    throw new Error(body.error ?? "카드 생성을 시작하지 못했습니다.");
  }
  return body;
}

export default function DashboardS1({
  deptId,
  displayName,
  role,
}: DashboardS1Props) {
  const [activeLabel, setActiveLabel] = useState<PanelLabel>("decision");
  const [dashboard, setDashboard] = useState<LoadedDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [itemLimit, setItemLimit] = useState(10);
  const [promotions, setPromotions] = useState<
    Record<string, { pending: boolean; message: string; cardId?: string }>
  >({});

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const loadDashboard = async () => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
        const response = await fetch(
          `/api/d/${encodeURIComponent(deptId)}/items?${activeLabel === "meeting" ? "source=meeting" : `label=${activeLabel}`}&limit=${itemLimit}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as DashboardData & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error ?? "대시보드 기록을 불러오지 못했습니다.");
        }

        if (!cancelled) {
          setDashboard({ label: activeLabel, data: body });
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("대시보드 기록을 불러오지 못했습니다.");
        }
      } finally {
        inFlight = false;
      }
    };

    const stopPolling = () => {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadDashboard();
      if (pollTimer === null) {
        pollTimer = setInterval(() => {
          void loadDashboard();
        }, 10_000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeLabel, deptId, itemLimit, refreshKey]);

  const data = dashboard?.data ?? null;
  const activeData = dashboard?.label === activeLabel ? dashboard.data : null;
  const retry = () => {
    setError(null);
    setRefreshKey((value) => value + 1);
  };
  const selectLabel = (label: PanelLabel) => {
    setError(null);
    setItemLimit(10);
    setActiveLabel(label);
  };
  const settingsHref = `/d/${deptId}/settings`;
  const promote = async (itemId: string) => {
    setPromotions((current) => ({
      ...current,
      [itemId]: { pending: true, message: "카드 생성을 요청하는 중입니다." },
    }));
    try {
      const result = await requestPromotion(deptId, itemId);
      setPromotions((current) => ({
        ...current,
        [itemId]: {
          pending: false,
          message: result.message ?? "결정 카드 생성을 시작했습니다.",
          ...(result.card_id ? { cardId: result.card_id } : {}),
        },
      }));
    } catch (promotionError) {
      setPromotions((current) => ({
        ...current,
        [itemId]: {
          pending: false,
          message:
            promotionError instanceof Error
              ? promotionError.message
              : "카드 생성을 시작하지 못했습니다.",
        },
      }));
    }
  };

  return (
    <main className="workspace-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
          <h1 className="m-0 text-3xl">부서 대시보드</h1>
          <p className="m-0 text-[var(--muted)]">
            {displayName}님 · {role === "lead" ? "팀장" : "팀원"}
          </p>
        </div>
        <Link className="button button-primary button-small" href={`/d/${deptId}/ask`}>사수에게 묻기 →</Link>
      </header>

      <section aria-labelledby="today-inputs-heading" className="grid gap-4">
        <div>
          <p className="m-0 text-sm text-[var(--muted)]">오늘의 입력</p>
          <h2 id="today-inputs-heading" className="m-0 text-2xl">
            부서 기록 현황
          </h2>
        </div>
        <dl className="stats-row">
          {[
            ["슬랙", data?.counts.slack ?? 0],
            ["회의", data?.counts.meeting ?? 0],
            ["문서", data?.counts.document ?? 0],
          ].map(([name, count]) => (
            <div
              key={name}
              className="panel p-5"
            >
              <dt className="text-sm text-[var(--muted)]">{name}</dt>
              <dd className="m-0 mt-1 text-3xl font-bold" data-meta>
                {count}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="classified-items-heading" className="grid gap-4">
        <div>
          <p className="m-0 text-sm text-[var(--muted)]">분류된 기록</p>
          <h2 id="classified-items-heading" className="m-0 text-2xl">
            지금 확인할 항목
          </h2>
        </div>

        <div
          aria-label="분류 선택"
          className="flex gap-2 overflow-x-auto pb-1"
          role="tablist"
        >
          {TABS.map((tab) => (
            <button
              key={tab.label}
              aria-controls="dashboard-items-panel"
              aria-selected={activeLabel === tab.label}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                activeLabel === tab.label
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-black/10 bg-[var(--surface)] text-[var(--muted)]"
              }`}
              onClick={() => selectLabel(tab.label)}
              role="tab"
              type="button"
            >
              {tab.name}
            </button>
          ))}
        </div>

        <div
          aria-live="polite"
          id="dashboard-items-panel"
          role="tabpanel"
        >
          {error ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--surface)] p-4">
              <p className="m-0 text-sm">
                {error} 연결 상태를 확인하고 다시 시도해주세요.
              </p>
              <button
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
                onClick={retry}
                type="button"
              >
                다시 시도
              </button>
            </div>
          ) : null}

          {!activeData && !error ? (
            <div className="rounded-2xl bg-[var(--surface)] p-8 text-[var(--muted)] shadow-sm">
              부서 기록을 불러오는 중입니다.
            </div>
          ) : null}

          {activeData && activeData.totalItems === 0 ? (
            <div className="grid gap-3 rounded-2xl bg-[var(--surface)] p-8 shadow-sm">
              <h3 className="m-0 text-xl">
                {activeData.channelCount === 0
                  ? "슬랙 채널을 연결하면 기록이 쌓입니다"
                  : `연결한 채널 ${activeData.channelCount}개에서 첫 메시지를 기다리는 중`}
              </h3>
              <p className="m-0 text-[var(--muted)]">
                채널 연결 상태는 부서 설정에서 확인할 수 있습니다.
              </p>
              <Link
                className="w-fit"
                href={settingsHref}
              >
                설정으로 가기
              </Link>
            </div>
          ) : null}

          {activeData &&
          activeData.totalItems > 0 &&
          activeData.items.length === 0 ? (
            <div className="rounded-2xl bg-[var(--surface)] p-8 text-[var(--muted)] shadow-sm">
              이 분류에 표시할 항목이 없습니다. 다른 분류를 확인해주세요.
            </div>
          ) : null}

          {activeData && activeData.items.length > 0 ? (
            <div className="grid gap-3">
              <p className="m-0 text-sm text-[var(--muted)]">
                {activeData.filteredTotal}건 중 {activeData.items.length}건 표시
              </p>
              {activeData.items.map((item) => (
                <article
                  key={item.id}
                  id={`item-${item.id}`}
                  className={`group rounded-2xl border-l-4 bg-[var(--surface)] p-5 shadow-sm ${
                    item.label === "decision"
                      ? "border-l-[var(--urgent)]"
                      : "border-l-black/15"
                  }`}
                >
                  <Link className="block text-inherit no-underline" href={`/d/${deptId}?item=${item.id}#item-${item.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                          <span>{SOURCE_KIND_LABELS[item.source.kind]}</span>
                          <span>·</span>
                          <span>{item.source.title ?? "이름 없는 소스"}</span>
                          <span>·</span>
                          <time dateTime={item.spoken_at ?? undefined}>
                            {formatSpokenAt(item.spoken_at)}
                          </time>
                        </div>
                        <p className="m-0 line-clamp-2 leading-7">
                          {item.content}
                        </p>
                      </div>
                      {needsReview(item) ? (
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold text-[var(--muted)]">
                          확인 필요
                        </span>
                      ) : null}
                    </div>
                  <span className="mt-2 block text-sm text-[var(--accent)]">원문 보기</span>
                  </Link>

                  <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
                    <div className="flex flex-wrap items-center gap-3">
                      {item.decisionId ? <Link href={`/d/${deptId}/ledger#decision-${item.decisionId}`}>→ 결정 기록</Link> : null}
                      <button
                        className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50"
                        disabled={promotions[item.id]?.pending === true}
                        onClick={() => void promote(item.id)}
                        type="button"
                      >
                        {promotions[item.id]?.pending
                          ? "카드로 올리는 중…"
                          : "카드로 올리기"}
                      </button>
                      {promotions[item.id] ? (
                        <span className="text-sm text-[var(--muted)]">
                          {promotions[item.id].message}{" "}
                          {promotions[item.id].cardId ? (
                            <Link
                              href={`/d/${deptId}/cards/${promotions[item.id].cardId}`}
                            >
                              카드 보기
                            </Link>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
              {activeData.items.length < activeData.filteredTotal ? (
                <button
                  className="button button-secondary w-fit"
                  onClick={() => setItemLimit((limit) => Math.min(limit + 10, 50))}
                  type="button"
                >
                  기록 10건 더 보기
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
