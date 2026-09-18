import { AsyncLocalStorage } from "node:async_hooks";

type NotionRichText = { plain_text?: unknown; text?: { content?: unknown } };

export type NotionBlock = {
  id?: string;
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
};
export type NotionParent = {
  type: string;
  block_id?: string;
  page_id?: string;
  database_id?: string;
  data_source_id?: string;
  workspace?: boolean;
  [key: string]: unknown;
};
export type NotionPageMeta = {
  id: string;
  // 검색은 page와 data_source를 섞어 돌려준다. 호출자가 구분할 수 있게 원본 object 값을 남긴다.
  object: "page" | "data_source" | "unknown";
  title: string | null;
  lastEditedTime: string;
  inTrash: boolean;
  parent: NotionParent;
};
export type NotionChildRef = { kind: "page" | "database"; id: string };
export type NotionAuth = { token: string };

type NotionErrorCode =
  | "notion_not_configured"
  | "notion_rate_limited"
  | "notion_api_failed"
  | "notion_not_found"
  | "notion_page_too_large"
  | "notion_database_unsupported";

export class NotionError extends Error {
  readonly retryAfterSeconds?: number;
  constructor(
    public readonly error_code: NotionErrorCode,
    retryAfterSeconds?: number,
  ) {
    super("Notion API request failed");
    this.name = "NotionError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const authStorage = new AsyncLocalStorage<NotionAuth>();
export function runWithNotionAuth<T>(
  auth: NotionAuth,
  fn: () => Promise<T>,
): Promise<T> {
  return authStorage.run(auth, fn);
}

function currentNotionToken(): string | undefined {
  return authStorage.getStore()?.token;
}

export function normalizeNotionPageId(value: string): string {
  const compactValue = value.trim().replaceAll("-", "");
  const matches = compactValue.match(/[a-f0-9]{32}/giu);
  const compact = matches?.at(-1) ?? "";
  if (!/^[a-f0-9]{32}$/iu.test(compact))
    throw new Error("invalid_notion_page_id");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
}

export function extractNotionText(block: NotionBlock): string {
  const type = typeof block.type === "string" ? block.type : "";
  const value = block[type];
  if (typeof value !== "object" || value === null) return "";
  const richText = Reflect.get(value, "rich_text");
  const title = Reflect.get(value, "title");
  const parts = Array.isArray(richText)
    ? richText
    : Array.isArray(title)
      ? title
      : [];
  return (parts as NotionRichText[])
    .map((part) =>
      typeof part.plain_text === "string"
        ? part.plain_text
        : typeof part.text?.content === "string"
          ? part.text.content
          : "",
    )
    .join("")
    .trim();
}

async function notionRequest<T>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<T> {
  const token = currentNotionToken();
  if (!token) throw new NotionError("notion_not_configured");
  let response: Response;
  try {
    response = await fetch(`https://api.notion.com/v1${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2025-09-03",
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new NotionError("notion_api_failed");
  }
  if (response.status === 429 || response.status === 529) {
    const value = response.headers.get("retry-after");
    const seconds = value === null ? undefined : Number.parseInt(value, 10);
    const retryAfterSeconds =
      typeof seconds === "number" && Number.isInteger(seconds) && seconds >= 0
        ? seconds
        : undefined;
    throw new NotionError("notion_rate_limited", retryAfterSeconds);
  }
  if (response.status === 404) throw new NotionError("notion_not_found");
  if (!response.ok) throw new NotionError("notion_api_failed");
  try {
    return (await response.json()) as T;
  } catch {
    throw new NotionError("notion_api_failed");
  }
}

type NotionPageResponse = {
  id?: unknown;
  object?: unknown;
  properties?: Record<string, { title?: NotionRichText[] }>;
  last_edited_time?: unknown;
  in_trash?: unknown;
  archived?: unknown;
  parent?: unknown;
};
type NotionChildrenResponse = {
  results?: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string | null;
};
type NotionBlockResponse = {
  id?: unknown;
  parent?: unknown;
};
type NotionListResponse = {
  results?: unknown[];
  has_more?: unknown;
  next_cursor?: unknown;
};

function pageTitle(page: NotionPageResponse): string | null {
  for (const property of Object.values(page.properties ?? {})) {
    if (Array.isArray(property.title)) {
      const text = property.title
        .map((part) =>
          typeof part.plain_text === "string" ? part.plain_text : "",
        )
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return null;
}
function parentFrom(value: unknown): NotionParent {
  return typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "type") === "string"
    ? (value as NotionParent)
    : { type: "unknown" };
}
function pageMeta(
  page: NotionPageResponse,
  fallbackId?: string,
): NotionPageMeta {
  return {
    id: typeof page.id === "string" ? page.id : (fallbackId ?? ""),
    object:
      page.object === "page" || page.object === "data_source"
        ? page.object
        : "unknown",
    title: pageTitle(page),
    lastEditedTime:
      typeof page.last_edited_time === "string" ? page.last_edited_time : "",
    inTrash: page.in_trash === true || page.archived === true,
    parent: parentFrom(page.parent),
  };
}
function pageMetaFromResult(value: unknown): NotionPageMeta {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof Reflect.get(value, "id") !== "string"
  )
    throw new NotionError("notion_api_failed");
  return pageMeta(value as NotionPageResponse);
}
function listPageResult(value: NotionListResponse): {
  results: unknown[];
  nextCursor: string | null;
} {
  if (
    !Array.isArray(value.results) ||
    typeof value.has_more !== "boolean" ||
    (value.has_more && typeof value.next_cursor !== "string")
  )
    throw new NotionError("notion_api_failed");
  return {
    results: value.results,
    nextCursor: value.has_more ? (value.next_cursor as string) : null,
  };
}

export async function fetchNotionPageMeta(
  pageId: string,
): Promise<NotionPageMeta> {
  const normalizedId = normalizeNotionPageId(pageId);
  const page = await notionRequest<NotionPageResponse>(
    `/pages/${normalizedId}`,
  );
  return pageMeta(page, normalizedId);
}

export async function fetchNotionBlockParent(
  blockId: string,
): Promise<NotionParent> {
  const block = await notionRequest<NotionBlockResponse>(
    `/blocks/${encodeURIComponent(blockId)}`,
  );
  const parent = parentFrom(block.parent);
  if (parent.type === "unknown") throw new NotionError("notion_api_failed");
  return parent;
}

export async function fetchNotionDataSourceParent(
  dataSourceId: string,
): Promise<NotionParent> {
  const dataSource = await notionRequest<NotionBlockResponse>(
    `/data_sources/${encodeURIComponent(dataSourceId)}`,
  );
  const parent = parentFrom(dataSource.parent);
  if (parent.type === "unknown") throw new NotionError("notion_api_failed");
  return parent;
}

export async function listNotionBlockChildren(
  blockId: string,
  cursor?: string | null,
): Promise<{
  children: NotionChildRef[];
  containers: string[];
  nextCursor: string | null;
}> {
  const query = cursor
    ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
    : "?page_size=100";
  const response = await notionRequest<NotionChildrenResponse>(
    `/blocks/${encodeURIComponent(blockId)}/children${query}`,
  );
  if (
    !Array.isArray(response.results) ||
    typeof response.has_more !== "boolean" ||
    (response.has_more && typeof response.next_cursor !== "string")
  ) {
    throw new NotionError("notion_api_failed");
  }
  const children: NotionChildRef[] = [];
  const containers: string[] = [];
  for (const block of response.results) {
    if (!block || typeof block !== "object" || typeof block.id !== "string") {
      throw new NotionError("notion_api_failed");
    }
    if (block.type === "child_page") {
      children.push({ kind: "page", id: block.id });
    } else if (block.type === "child_database") {
      children.push({ kind: "database", id: block.id });
    } else if (block.has_children === true) {
      containers.push(block.id);
    }
  }
  return {
    children,
    containers,
    nextCursor: response.has_more ? response.next_cursor! : null,
  };
}

export async function fetchNotionPage(
  pageId: string,
  options?: { descendChildPages?: boolean },
): Promise<{
  title: string | null;
  blocks: NotionBlock[];
  meta: NotionPageMeta;
  children: NotionChildRef[];
  properties: Record<string, unknown>;
}> {
  const normalizedId = normalizeNotionPageId(pageId);
  const page = await notionRequest<NotionPageResponse>(
    `/pages/${normalizedId}`,
  );
  const blocks: NotionBlock[] = [];
  const children: NotionChildRef[] = [];
  const parents = [normalizedId];
  const visited = new Set<string>();
  const descendChildPages = options?.descendChildPages ?? true;
  for (let index = 0; index < parents.length; index += 1) {
    const parent = parents[index];
    if (visited.has(parent)) throw new NotionError("notion_api_failed");
    visited.add(parent);
    let cursor: string | null = null;
    const cursors = new Set<string>();
    do {
      const query: string = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : "?page_size=100";
      const result: NotionChildrenResponse =
        await notionRequest<NotionChildrenResponse>(
          `/blocks/${encodeURIComponent(parent)}/children${query}`,
        );
      if (
        !Array.isArray(result.results) ||
        typeof result.has_more !== "boolean" ||
        (result.has_more &&
          (!result.next_cursor || cursors.has(result.next_cursor)))
      )
        throw new NotionError("notion_api_failed");
      for (const block of result.results) {
        if (!block || typeof block !== "object" || typeof block.id !== "string")
          throw new NotionError("notion_api_failed");
        const childKind =
          block.type === "child_page"
            ? "page"
            : block.type === "child_database"
              ? "database"
              : null;
        if (!descendChildPages && childKind) {
          children.push({ kind: childKind, id: block.id });
          continue;
        }
        blocks.push(block);
        if (blocks.length > 5_000)
          throw new NotionError("notion_page_too_large");
        if (block.has_children === true) parents.push(block.id);
      }
      cursor = result.has_more ? result.next_cursor! : null;
      if (cursor) cursors.add(cursor);
    } while (cursor);
  }
  return {
    title: pageTitle(page),
    blocks,
    meta: pageMeta(page, normalizedId),
    children,
    properties: page.properties ?? {},
  };
}

export async function listDataSources(
  databaseId: string,
): Promise<{ id: string; name: string | null }[]> {
  const response = await notionRequest<{ data_sources?: unknown[] }>(
    `/databases/${encodeURIComponent(databaseId)}`,
  );
  if (!Array.isArray(response.data_sources))
    throw new NotionError("notion_database_unsupported");
  return response.data_sources.map((source) => {
    if (
      typeof source !== "object" ||
      source === null ||
      typeof Reflect.get(source, "id") !== "string"
    )
      throw new NotionError("notion_database_unsupported");
    const name = Reflect.get(source, "name");
    return {
      id: Reflect.get(source, "id") as string,
      name: typeof name === "string" ? name : null,
    };
  });
}

export async function queryDataSource(
  dataSourceId: string,
  cursor?: string | null,
): Promise<{ pages: NotionPageMeta[]; nextCursor: string | null }> {
  const response = await notionRequest<NotionListResponse>(
    `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
    {
      method: "POST",
      body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    },
  );
  const list = listPageResult(response);
  return {
    pages: list.results.map(pageMetaFromResult),
    nextCursor: list.nextCursor,
  };
}

export async function searchNotion(args: {
  cursor?: string | null;
  object?: "page" | "data_source";
  sortByEditedDesc?: boolean;
}): Promise<{ results: NotionPageMeta[]; nextCursor: string | null }> {
  const response = await notionRequest<NotionListResponse>("/search", {
    method: "POST",
    body: {
      page_size: 100,
      ...(args.cursor ? { start_cursor: args.cursor } : {}),
      ...(args.object
        ? { filter: { property: "object", value: args.object } }
        : {}),
      ...(args.sortByEditedDesc
        ? { sort: { direction: "descending", timestamp: "last_edited_time" } }
        : {}),
    },
  });
  const list = listPageResult(response);
  return {
    results: list.results.map(pageMetaFromResult),
    nextCursor: list.nextCursor,
  };
}

export async function notionWhoAmI(): Promise<{
  botId: string;
  workspaceId: string | null;
  workspaceName: string | null;
}> {
  const response = await notionRequest<{
    id?: unknown;
    bot?: { workspace_id?: unknown; workspace_name?: unknown };
  }>("/users/me");
  if (typeof response.id !== "string")
    throw new NotionError("notion_api_failed");
  return {
    botId: response.id,
    workspaceId:
      typeof response.bot?.workspace_id === "string"
        ? response.bot.workspace_id
        : null,
    workspaceName:
      typeof response.bot?.workspace_name === "string"
        ? response.bot.workspace_name
        : null,
  };
}
