import { formatVector } from "@/lib/embeddings";

export type SearchResult = {
  id: string;
  source_id: string;
  dept_id: string;
  author: string | null;
  spoken_at: string | null;
  content: string;
  source_kind: string;
  source_external_id: string;
  source_title: string | null;
  source_visibility: "dept" | "leads_only";
  similarity: number;
};

export type DecisionSearchResult = {
  id: string;
  outcome: string;
  rationale: string;
  decided_at: string | null;
  decided_by_name: string;
};

type SearchClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

class SearchDatabaseError extends Error {
  constructor() {
    super("Search database operation failed");
    this.name = "SearchDatabaseError";
  }
}

export async function searchAs(
  client: SearchClient,
  args: {
    userId: string;
    deptId: string;
    queryVector: number[];
    limit: number;
  },
): Promise<SearchResult[]> {
  const result = await client.rpc("search_as", {
    p_user: args.userId,
    p_dept: args.deptId,
    p_query: formatVector(args.queryVector),
    p_limit: args.limit,
  });
  if (result.error) {
    throw new SearchDatabaseError();
  }
  return (result.data ?? []) as SearchResult[];
}

export async function recentDecisionsAs(
  client: SearchClient,
  args: { userId: string; deptId: string; limit: number },
): Promise<DecisionSearchResult[]> {
  const result = await client.rpc("recent_decisions_as", {
    p_user: args.userId,
    p_dept: args.deptId,
    p_limit: args.limit,
  });
  if (result.error) {
    throw new SearchDatabaseError();
  }
  return (result.data ?? []) as DecisionSearchResult[];
}
