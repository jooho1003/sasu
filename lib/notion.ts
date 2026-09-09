type NotionRichText = { plain_text?: unknown; text?: { content?: unknown } };

export type NotionBlock = {
  id?: string;
  type?: string;
  [key: string]: unknown;
};

export class NotionError extends Error {
  constructor(public readonly error_code: "notion_not_configured" | "notion_rate_limited" | "notion_api_failed") {
    super("Notion API request failed");
    this.name = "NotionError";
  }
}

export function normalizeNotionPageId(value: string): string {
  const compactValue = value.trim().replaceAll("-", "");
  const matches = compactValue.match(/[a-f0-9]{32}/giu);
  const compact = matches?.at(-1) ?? "";
  if (!/^[a-f0-9]{32}$/iu.test(compact)) {
    throw new Error("invalid_notion_page_id");
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
}

export function extractNotionText(block: NotionBlock): string {
  const type = typeof block.type === "string" ? block.type : "";
  const value = block[type];
  if (typeof value !== "object" || value === null) return "";
  const richText = Reflect.get(value, "rich_text");
  const title = Reflect.get(value, "title");
  const parts = Array.isArray(richText) ? richText : Array.isArray(title) ? title : [];
  return (parts as NotionRichText[]).map((part) => {
    if (typeof part.plain_text === "string") return part.plain_text;
    return typeof part.text?.content === "string" ? part.text.content : "";
  }).join("").trim();
}

async function notionRequest<T>(path: string): Promise<T> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new NotionError("notion_not_configured");
  let response: Response;
  try {
    response = await fetch(`https://api.notion.com/v1${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new NotionError("notion_api_failed");
  }
  if (response.status === 429) throw new NotionError("notion_rate_limited");
  if (!response.ok) throw new NotionError("notion_api_failed");
  try {
    return (await response.json()) as T;
  } catch {
    throw new NotionError("notion_api_failed");
  }
}

type NotionPageResponse = { properties?: Record<string, { title?: NotionRichText[] }> };
type NotionChildrenResponse = { results?: NotionBlock[]; has_more?: boolean; next_cursor?: string | null };

function pageTitle(page: NotionPageResponse): string | null {
  for (const property of Object.values(page.properties ?? {})) {
    if (Array.isArray(property.title)) {
      const text = property.title.map((part) => typeof part.plain_text === "string" ? part.plain_text : "").join("").trim();
      if (text) return text;
    }
  }
  return null;
}

export async function fetchNotionPage(pageId: string): Promise<{ title: string | null; blocks: NotionBlock[] }> {
  const normalizedId = normalizeNotionPageId(pageId);
  const page = await notionRequest<NotionPageResponse>(`/pages/${normalizedId}`);
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const result: NotionChildrenResponse = await notionRequest<NotionChildrenResponse>(`/blocks/${normalizedId}/children${query}`);
    blocks.push(...(result.results ?? []));
    cursor = result.has_more ? result.next_cursor ?? null : null;
  } while (cursor);
  return { title: pageTitle(page), blocks };
}
