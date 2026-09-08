import { NextRequest } from "next/server";

import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ITEM_LABELS = [
  "decision",
  "action",
  "info",
  "chatter",
  "unclassified",
] as const;

type ItemLabel = (typeof ITEM_LABELS)[number];
type SourceKind = "slack_channel" | "meeting" | "notion_page";

type SourceRow = {
  title: string | null;
  kind: SourceKind;
};

type ClassificationRow = {
  label: ItemLabel;
  confidence: number | null;
};

type ItemRow = {
  id: string;
  author: string | null;
  spoken_at: string | null;
  content: string;
  sources: SourceRow | SourceRow[];
  classifications: ClassificationRow | ClassificationRow[] | null;
};

type TodayItemRow = {
  sources: Pick<SourceRow, "kind"> | Pick<SourceRow, "kind">[];
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function isItemLabel(value: string | null): value is ItemLabel {
  return ITEM_LABELS.some((label) => label === value);
}

function firstRelation<T>(relation: T | T[]): T {
  return Array.isArray(relation) ? relation[0] : relation;
}

function firstOptionalRelation<T>(relation: T | T[] | null): T | null {
  if (relation === null) {
    return null;
  }

  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function startOfTodayInKst(now = new Date()): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const startUtc =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - KST_OFFSET_MS;

  return new Date(startUtc).toISOString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const requestedLabel = request.nextUrl.searchParams.get("label");

  if (requestedLabel !== null && !isItemLabel(requestedLabel)) {
    return Response.json(
      { error: "지원하지 않는 분류입니다." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const classificationJoin =
    requestedLabel === null
      ? "classifications(label, confidence)"
      : "classifications!inner(label, confidence)";
  let itemsQuery = supabase
    .from("items")
    .select(
      `id, author, spoken_at, content, sources!inner(title, kind), ${classificationJoin}`,
    )
    .eq("dept_id", membership.deptId)
    .is("deleted_at", null)
    .order("spoken_at", { ascending: false, nullsFirst: false });

  if (requestedLabel !== null) {
    itemsQuery = itemsQuery.eq("classifications.label", requestedLabel);
  }

  const todayStart = startOfTodayInKst();
  const [itemsResult, todayResult, channelResult, totalResult] =
    await Promise.all([
      itemsQuery,
      supabase
        .from("items")
        .select("sources!inner(kind)")
        .eq("dept_id", membership.deptId)
        .is("deleted_at", null)
        .gte("created_at", todayStart),
      supabase
        .from("sources")
        .select("id", { count: "exact", head: true })
        .eq("dept_id", membership.deptId)
        .eq("kind", "slack_channel")
        .eq("active", true),
      supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("dept_id", membership.deptId)
        .is("deleted_at", null),
    ]);

  if (
    itemsResult.error ||
    todayResult.error ||
    channelResult.error ||
    totalResult.error
  ) {
    return Response.json(
      {
        error:
          "대시보드 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 500 },
    );
  }

  const counts = { slack: 0, meeting: 0, document: 0 };
  for (const row of (todayResult.data ?? []) as TodayItemRow[]) {
    const source = firstRelation(row.sources);
    if (source.kind === "slack_channel") {
      counts.slack += 1;
    } else if (source.kind === "meeting") {
      counts.meeting += 1;
    } else if (source.kind === "notion_page") {
      counts.document += 1;
    }
  }

  const items = ((itemsResult.data ?? []) as ItemRow[]).map((row) => {
    const source = firstRelation(row.sources);
    const classification = firstOptionalRelation(row.classifications);

    return {
      id: row.id,
      author: row.author,
      spoken_at: row.spoken_at,
      content: row.content,
      label: classification?.label ?? "unclassified",
      confidence: classification?.confidence ?? null,
      source: {
        title: source.title,
        kind: source.kind,
      },
    };
  });

  return Response.json({
    items,
    counts,
    channelCount: channelResult.count ?? 0,
    totalItems: totalResult.count ?? 0,
  });
}
