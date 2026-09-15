"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const TABS = [
  { label: "decision", name: "결정 필요" },
  { label: "action", name: "액션" },
  { label: "info", name: "정보" },
  { label: "chatter", name: "잡담" },
  { label: "unclassified", name: "분류 대기" },
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
  trailerPublishingEnabled = false,
}: DashboardS1Props) {
  const [activeLabel, setActiveLabel] = useState<PanelLabel>("decision");
  const [dashboard, setDashboard] = useState<LoadedDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
          `/api/d/${encodeURIComponent(deptId)}/items?${activeLabel === "meeting" ? "source=meeting" : `label=${activeLabel}`}`,
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
  }, [activeLabel, deptId, refreshKey]);

  const data = dashboard?.data ?? null;
  const activeData = dashboard?.label === activeLabel ? dashboard.data : null;
  const retry = () => {
    setError(null);
    setRefreshKey((value) => value + 1);
  };
  const selectLabel = (label: PanelLabel) => {
    setError(null);
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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-10 text-left sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
          <h1 className="text-4xl! text-[var(--ink)]!">부서 대시보드</h1>
          <p className="m-0 text-[var(--muted)]">
            {displayName}님 · {role === "lead" ? "팀장" : "팀원"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/d/${deptId}/ask`}>묻기</Link>
          <Link href={`/d/${deptId}/documents`}>문서</Link>
          <Link href={`/d/${deptId}/roles`}>역할</Link>
          {role === "lead" && trailerPublishingEnabled ? <Link href={`/d/${deptId}/trailers`}>예고편</Link> : null}
          <Link href={`/d/${deptId}/ledger`}>원장</Link>
          <Link href={settingsHref}>세팅</Link>
          <span className="text-[var(--muted)]" data-meta>10초마다 갱신</span>
        </div>
      </header>

      <section aria-labelledby="today-inputs-heading" className="grid gap-4">
        <div>
          <p className="m-0 text-sm text-[var(--muted)]">오늘의 입력</p>
          <h2 id="today-inputs-heading" className="m-0 text-2xl">
            부서 기록 현황
          </h2>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["슬랙", data?.counts.slack ?? 0],
            ["회의", data?.counts.meeting ?? 0],
            ["문서", data?.counts.document ?? 0],
          ].map(([name, count]) => (
            <div
              key={name}
              className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm"
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
                  ? "슬랙 채널을 연결하면 시작됩니다"
                  : `수집 채널 ${activeData.channelCount}개에서 첫 메시지를 기다리는 중`}
              </h3>
              <p className="m-0 text-[var(--muted)]">
                채널 연결 상태는 부서 세팅에서 확인할 수 있습니다.
              </p>
              <Link
                className="w-fit"
                href={settingsHref}
              >
                세팅으로
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
              {activeData.items.map((item) => (
                <details
                  key={item.id}
                  id={`item-${item.id}`}
                  className={`group rounded-2xl border-l-4 bg-[var(--surface)] p-5 shadow-sm ${
                    item.label === "decision"
                      ? "border-l-[var(--urgent)]"
                      : "border-l-black/15"
                  }`}
                >
                  <summary className="cursor-pointer list-none">
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
                  </summary>

                  <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
                    <div className="grid gap-1">
                      <p className="m-0 text-xs text-[var(--muted)]" data-meta>
                        원문 · {item.author ?? "작성자 미상"}
                      </p>
                      <p className="m-0 whitespace-pre-wrap leading-7">
                        {item.content}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50"
                        disabled={promotions[item.id]?.pending === true}
                        onClick={() => void promote(item.id)}
                        type="button"
                      >
                        {promotions[item.id]?.pending
                          ? "승격 중…"
                          : "카드로 승격"}
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
                </details>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
