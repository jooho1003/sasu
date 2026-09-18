import { randomUUID } from "node:crypto";

import { enqueue, registerHandler } from "@/lib/jobs";
import { mask } from "@/lib/mask";
import {
  fetchNotionBlockParent,
  fetchNotionDataSourceParent,
  fetchNotionPageMeta,
  listDataSources,
  listNotionBlockChildren,
  queryDataSource,
  searchNotion,
  type NotionPageMeta,
} from "@/lib/notion";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const DISCOVER_LIMIT_MS = 40_000;

type RootRow = {
  id: string;
  scope: "workspace" | "subtree";
  notion_id: string | null;
  notion_kind: "page" | "database" | null;
  top_title?: string | null;
  discover_cursor: unknown;
  known_pages?: { id: string; parent: string | null }[];
};

type Candidate = {
  id: string;
  parent: string | null;
  editedAt: string | null;
  title: string | null;
};

type DatabaseTask = {
  id: string;
  parent: string | null;
};

type DiscoverCursor = {
  mode: "workspace" | "database" | "imports";
  rootRegistered?: boolean;
  searchCursor?: string | null;
  searchDone?: boolean;
  pending?: Candidate[];
  databases?: DatabaseTask[];
  databaseIndex?: number;
  dataSourceCursor?: string | null;
  databaseSourcesLoaded?: boolean;
  unassignedCursor?: string | null;
  unassignedCount?: number;
  unassignedDone?: boolean;
};

type ReconcileCandidate = Candidate;

type ReconcileBlockTask = {
  id: string;
  parent: string;
  cursor: string | null;
};

type ReconcileDatabaseTask = {
  id: string;
  parent: string | null;
  kind: "database" | "data_source";
  cursor: string | null;
};

type ReconcileCursor = {
  mode: "reconcile";
  startedAt: string;
  searchCursor: string | null;
  searchDone: boolean;
  known: ReconcileCandidate[];
  pages: ReconcileCandidate[];
  blocks: ReconcileBlockTask[];
  databases: ReconcileDatabaseTask[];
  processed: string[];
  rootMarked: boolean;
};

type Client = ReturnType<typeof createServiceSupabaseClient>;

class NotionDiscoverDatabaseError extends Error {
  constructor() {
    super("Notion discovery database operation failed");
    this.name = "NotionDiscoverDatabaseError";
  }
}

function payloadFrom(payload: unknown): { rootId: string; reconcile: boolean } {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("notion_discover job payload is invalid");
  }
  const rootId = Reflect.get(payload, "rootId");
  const reconcile = Reflect.get(payload, "reconcile");
  if (
    typeof rootId !== "string" ||
    rootId.length === 0 ||
    (reconcile !== undefined && typeof reconcile !== "boolean")
  ) {
    throw new Error("notion_discover job payload is invalid");
  }
  return { rootId, reconcile: reconcile === true };
}

function parentId(page: NotionPageMeta): string | null {
  for (const key of ["page_id", "database_id", "data_source_id"] as const) {
    const value = page.parent[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

async function resolvedParentId(page: NotionPageMeta): Promise<string | null> {
  const direct = page.parent.page_id ?? page.parent.database_id ?? null;
  if (direct) return direct;
  if (
    page.parent.type === "data_source_id" &&
    typeof page.parent.data_source_id === "string"
  ) {
    const parent = await fetchNotionDataSourceParent(page.parent.data_source_id);
    return parent.page_id ?? parent.database_id ?? null;
  }
  let parent = page.parent;
  for (let depth = 0; depth < 5; depth += 1) {
    if (
      parent.type !== "block_id" ||
      typeof parent.block_id !== "string" ||
      parent.block_id.length === 0
    ) {
      return null;
    }
    parent = await fetchNotionBlockParent(parent.block_id);
    if (
      parent.type === "data_source_id" &&
      typeof parent.data_source_id === "string"
    ) {
      parent = await fetchNotionDataSourceParent(parent.data_source_id);
    }
    for (const key of ["page_id", "database_id"] as const) {
      const value = parent[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return null;
}

function candidate(page: NotionPageMeta, fallbackParent?: string | null): Candidate {
  return {
    id: page.id,
    parent: fallbackParent ?? parentId(page),
    editedAt: page.lastEditedTime || null,
    title: page.title === null ? null : mask(page.title),
  };
}

function cursorFrom(root: RootRow): DiscoverCursor {
  if (
    root.discover_cursor &&
    typeof root.discover_cursor === "object" &&
    !Array.isArray(root.discover_cursor)
  ) {
    return root.discover_cursor as DiscoverCursor;
  }
  return root.scope === "workspace"
    ? { mode: "workspace", searchCursor: null, searchDone: false, pending: [], databases: [], databaseIndex: 0, dataSourceCursor: null }
    : { mode: "database", pending: [], databases: [], databaseIndex: 0, dataSourceCursor: null };
}

function reconcileCursorFrom(root: RootRow, startedAt: string): ReconcileCursor {
  if (
    root.discover_cursor &&
    typeof root.discover_cursor === "object" &&
    !Array.isArray(root.discover_cursor) &&
    Reflect.get(root.discover_cursor, "mode") === "reconcile"
  ) {
    return root.discover_cursor as ReconcileCursor;
  }
  const known = (root.known_pages ?? []).map((page) => ({
    id: page.id,
    parent: page.parent,
    editedAt: null,
    title: null,
  }));
  return {
    mode: "reconcile",
    startedAt,
    searchCursor: null,
    searchDone: root.scope !== "workspace",
    known: root.scope === "workspace" ? known : [],
    pages: root.scope === "subtree" && root.notion_kind === "page" && root.notion_id
      ? [{ id: root.notion_id, parent: null, editedAt: null, title: root.top_title ?? null }]
      : [],
    blocks: [],
    databases: root.scope === "subtree" && root.notion_kind === "database" && root.notion_id
      ? [{ id: root.notion_id, parent: null, kind: "database", cursor: null }]
      : [],
    processed: [],
    rootMarked: root.scope !== "subtree" || root.notion_kind !== "database",
  };
}

async function rpc<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.rpc(name, args);
  if (result.error) throw new NotionDiscoverDatabaseError();
  return result.data as T;
}

async function saveCursor(
  client: Client,
  rootId: string,
  lease: string,
  cursor: DiscoverCursor | ReconcileCursor | null,
  done: boolean,
): Promise<void> {
  await rpc(client, "save_discover_cursor", {
    p_root: rootId,
    p_lease: lease,
    p_cursor: cursor,
    p_done: done,
  });
}

async function registerCandidate(
  client: Client,
  rootId: string,
  page: Candidate,
): Promise<"created" | "linked" | "excluded" | "limit" | "paused"> {
  return rpc(client, "register_notion_page", {
    p_root: rootId,
    p_page: page.id,
    p_parent: page.parent,
    p_remote_edited_at: page.editedAt,
    p_title: page.title,
  });
}

function skippableDatabaseError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return [
    "notion_not_found",
    "notion_api_failed",
    "notion_database_unsupported",
  ].includes(String(Reflect.get(error, "error_code")));
}

async function recordUnsupported(client: Client, rootId: string): Promise<void> {
  await rpc(client, "record_notion_discover_unsupported", {
    p_root: rootId,
    p_count: 1,
  });
}

async function refreshUnassignedCount(
  client: Client,
  rootId: string,
  state: DiscoverCursor,
  expired: () => boolean,
  continueLater: () => Promise<void>,
): Promise<boolean> {
  state.mode = "imports";
  let cursor = state.unassignedCursor ?? null;
  let count = state.unassignedCount ?? 0;
  do {
    const requestCursor = cursor;
    const countBeforePage = count;
    const page = await searchNotion({ cursor });
    for (const result of page.results) {
      if (result.object !== "page" || result.inTrash) continue;
      const assigned = await rpc<boolean>(client, "notion_page_is_assigned", {
        p_root: rootId,
        p_page: result.id,
        p_parent: parentId(result),
      });
      if (!assigned) count += 1;
      if (expired()) {
        state.unassignedCursor = requestCursor;
        state.unassignedCount = countBeforePage;
        await continueLater();
        return true;
      }
    }
    cursor = page.nextCursor;
    state.unassignedCursor = cursor;
    state.unassignedCount = count;
    if (expired() && cursor) {
      await continueLater();
      return true;
    }
  } while (cursor);
  await rpc(client, "set_notion_unassigned_count", {
    p_root: rootId,
    p_count: count,
  });
  delete state.unassignedCursor;
  delete state.unassignedCount;
  return false;
}

function notionErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null
    ? String(Reflect.get(error, "error_code") ?? "") || null
    : null;
}

async function reconcileNotionRoot(
  rootId: string,
  options: { now?: () => number },
): Promise<{ registered: number; unsupported: number; continued: boolean }> {
  const client = createServiceSupabaseClient();
  const lease = randomUUID();
  const root = await rpc<RootRow | null>(client, "claim_notion_reconcile", {
    p_root: rootId,
    p_lease: lease,
  });
  if (!root) return { registered: 0, unsupported: 0, continued: false };

  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const state = reconcileCursorFrom(root, new Date(startedAtMs).toISOString());
  let registered = 0;
  let unsupported = 0;
  const processed = new Set(state.processed);
  const expired = (): boolean => now() - startedAtMs >= DISCOVER_LIMIT_MS;
  const continueLater = async (): Promise<void> => {
    state.processed = [...processed];
    await saveCursor(client, rootId, lease, state, false);
    await enqueue(
      "notion_discover",
      { rootId, reconcile: true },
      { lane: "bulk" },
    );
  };
  const pauseIfExpired = async (): Promise<boolean> => {
    if (!expired()) return false;
    await continueLater();
    return true;
  };

  try {
    if (!state.rootMarked && root.notion_id) {
      const status = await rpc<string>(client, "reconcile_notion_page", {
        p_root: rootId,
        p_lease: lease,
        p_page: root.notion_id,
        p_parent: null,
        p_remote_edited_at: null,
        p_title: root.top_title ?? null,
        p_started_at: state.startedAt,
      });
      if (status === "created") registered += 1;
      if (status === "limit" || status === "paused") {
        return { registered, unsupported, continued: false };
      }
      state.rootMarked = true;
      if (await pauseIfExpired()) {
        return { registered, unsupported, continued: true };
      }
    }
    while (!state.searchDone) {
      const page = await searchNotion({ cursor: state.searchCursor });
      state.searchCursor = page.nextCursor;
      state.searchDone = page.nextCursor === null;
      for (const result of page.results) {
        if (result.inTrash) continue;
        if (result.object === "page") {
          state.pages.push(candidate(result, await resolvedParentId(result)));
        }
        if (result.object === "data_source") {
          state.databases.push({
            id: result.id,
            parent: parentId(result),
            kind: "data_source",
            cursor: null,
          });
        }
      }
      if (await pauseIfExpired()) {
        return { registered, unsupported, continued: true };
      }
    }
    if (state.known.length > 0) {
      state.pages.push(...state.known);
      state.known = [];
    }

    while (state.pages.length > 0 || state.blocks.length > 0 || state.databases.length > 0) {
      if (state.pages.length > 0) {
        const queued = state.pages[0];
        if (processed.has(queued.id)) {
          state.pages.shift();
          continue;
        }
        let page = queued;
        if (!page.editedAt) {
          try {
            const meta = await fetchNotionPageMeta(page.id);
            if (meta.inTrash) {
              processed.add(page.id);
              state.pages.shift();
              if (await pauseIfExpired()) {
                return { registered, unsupported, continued: true };
              }
              continue;
            }
            page = candidate(
              meta,
              queued.parent ?? await resolvedParentId(meta),
            );
          } catch (error) {
            if (notionErrorCode(error) !== "notion_not_found") throw error;
            processed.add(page.id);
            state.pages.shift();
            if (await pauseIfExpired()) {
              return { registered, unsupported, continued: true };
            }
            continue;
          }
        }
        const status = await rpc<string>(client, "reconcile_notion_page", {
          p_root: rootId,
          p_lease: lease,
          p_page: page.id,
          p_parent: page.parent,
          p_remote_edited_at: page.editedAt,
          p_title: page.title,
          p_started_at: state.startedAt,
        });
        if (status === "created") registered += 1;
        if (status === "limit" || status === "paused") {
          return { registered, unsupported, continued: false };
        }
        processed.add(page.id);
        state.pages.shift();
        if (status !== "excluded") {
          state.blocks.push({ id: page.id, parent: page.id, cursor: null });
        }
        if (await pauseIfExpired()) {
          return { registered, unsupported, continued: true };
        }
        continue;
      }

      if (state.blocks.length > 0) {
        const task = state.blocks[0];
        const page = await listNotionBlockChildren(task.id, task.cursor);
        for (const child of page.children) {
          if (child.kind === "page") {
            state.pages.push({
              id: child.id,
              parent: task.parent,
              editedAt: null,
              title: null,
            });
          } else {
            state.databases.push({
              id: child.id,
              parent: task.parent,
              kind: "database",
              cursor: null,
            });
          }
        }
        for (const container of page.containers) {
          state.blocks.push({ id: container, parent: task.parent, cursor: null });
        }
        if (page.nextCursor) {
          task.cursor = page.nextCursor;
        } else {
          state.blocks.shift();
        }
        if (await pauseIfExpired()) {
          return { registered, unsupported, continued: true };
        }
        continue;
      }

      const database = state.databases[0];
      if (database.kind === "database") {
        try {
          const sources = await listDataSources(database.id);
          state.databases.shift();
          state.databases.unshift(...sources.map((source) => ({
            id: source.id,
            parent: database.parent ?? database.id,
            kind: "data_source" as const,
            cursor: null,
          })));
        } catch (error) {
          if (!skippableDatabaseError(error)) throw error;
          unsupported += 1;
          await recordUnsupported(client, rootId);
          throw error;
        }
      } else {
        try {
          const page = await queryDataSource(database.id, database.cursor);
          state.pages.push(...page.pages
            .filter((row) => !row.inTrash && row.object === "page")
            .map((row) => candidate(row, database.parent)));
          if (page.nextCursor) {
            database.cursor = page.nextCursor;
          } else {
            state.databases.shift();
          }
        } catch (error) {
          if (!skippableDatabaseError(error)) throw error;
          unsupported += 1;
          await recordUnsupported(client, rootId);
          throw error;
        }
      }
      if (await pauseIfExpired()) {
        return { registered, unsupported, continued: true };
      }
    }

    await rpc(client, "finish_notion_reconcile", {
      p_root: rootId,
      p_lease: lease,
      p_started_at: state.startedAt,
    });
    return { registered, unsupported, continued: false };
  } catch (error) {
    state.processed = [...processed];
    await saveCursor(client, rootId, lease, state, false);
    throw error;
  }
}

export async function discoverNotionRoot(
  rootId: string,
  options: { now?: () => number; reconcile?: boolean } = {},
): Promise<{ registered: number; unsupported: number; continued: boolean }> {
  if (options.reconcile === true) {
    return reconcileNotionRoot(rootId, options);
  }
  const client = createServiceSupabaseClient();
  const lease = randomUUID();
  const root = await rpc<RootRow | null>(client, "claim_notion_discovery", {
    p_root: rootId,
    p_lease: lease,
  });
  if (!root) return { registered: 0, unsupported: 0, continued: false };

  const now = options.now ?? Date.now;
  const startedAt = now();
  let registered = 0;
  let unsupported = 0;
  let cursor = cursorFrom(root);
  const unassignedPhase =
    cursor.mode === "imports" && cursor.unassignedCursor !== undefined;

  const expired = (): boolean => now() - startedAt >= DISCOVER_LIMIT_MS;
  const continueLater = async (): Promise<void> => {
    await saveCursor(client, rootId, lease, cursor, false);
    await enqueue("notion_discover", { rootId });
  };
  const shouldContinue = async (): Promise<boolean> => {
    if (!expired()) return false;
    await continueLater();
    return true;
  };

  try {
    if (
      root.scope === "subtree" &&
      root.notion_kind === "page" &&
      cursor.mode !== "database"
    ) {
      if (unassignedPhase) {
        if (await refreshUnassignedCount(client, rootId, cursor, expired, continueLater)) {
          return { registered, unsupported, continued: true };
        }
        cursor = { mode: "imports", unassignedDone: true };
        await saveCursor(client, rootId, lease, cursor, false);
        await rpc(client, "settle_notion_root", { p_root: rootId });
        return { registered, unsupported, continued: false };
      }
      if (cursor.mode !== "imports") {
        const status = await registerCandidate(client, rootId, {
          id: root.notion_id!,
          parent: null,
          editedAt: null,
          title: root.top_title ?? null,
        });
        if (status === "limit" || status === "paused") {
          return { registered, unsupported, continued: false };
        }
        if (status === "created" || status === "linked") registered += 1;
      }
      cursor = { mode: "imports", unassignedDone: false };
      await saveCursor(client, rootId, lease, cursor, false);
      await rpc(client, "settle_notion_root", { p_root: rootId });
      return { registered, unsupported, continued: false };
    }

    if (
      root.scope === "subtree" &&
      root.notion_kind === "database" &&
      !unassignedPhase
    ) {
      if (!cursor.rootRegistered) {
        const status = await registerCandidate(client, rootId, {
          id: root.notion_id!,
          parent: null,
          editedAt: null,
          title: root.top_title ?? null,
        });
        if (status === "created" || status === "linked") registered += 1;
        cursor.rootRegistered = true;
      }
      if (!cursor.databaseSourcesLoaded) {
        try {
          cursor.databases = (await listDataSources(root.notion_id!)).map((source) => ({
            id: source.id,
            parent: root.notion_id,
          }));
        } catch (error) {
          if (!skippableDatabaseError(error)) throw error;
          unsupported += 1;
          await recordUnsupported(client, rootId);
          cursor.databases = [];
        }
        cursor.databaseSourcesLoaded = true;
        if (await shouldContinue()) {
          return { registered, unsupported, continued: true };
        }
      }
    }

    if (root.scope === "workspace" && !unassignedPhase) {
      cursor.mode = "workspace";
      cursor.pending ??= [];
      cursor.databases ??= [];
      while (!cursor.searchDone) {
        if (cursor.pending.length === 0) {
          const page = await searchNotion({ cursor: cursor.searchCursor ?? null });
          cursor.searchCursor = page.nextCursor;
          cursor.searchDone = page.nextCursor === null;
          for (const result of page.results) {
            if (result.inTrash) continue;
            if (result.object === "page") cursor.pending.push(candidate(result));
            if (result.object === "data_source") {
              cursor.databases.push({ id: result.id, parent: parentId(result) });
            }
          }
          if (cursor.pending.length === 0 && await shouldContinue()) {
            return { registered, unsupported, continued: true };
          }
        }
        while (cursor.pending.length > 0) {
          const status = await registerCandidate(client, rootId, cursor.pending[0]);
          if (status === "limit" || status === "paused") {
            await saveCursor(client, rootId, lease, cursor, false);
            return { registered, unsupported, continued: false };
          }
          if (status === "created" || status === "linked") registered += 1;
          cursor.pending.shift();
          if (await shouldContinue()) {
            return { registered, unsupported, continued: true };
          }
        }
      }
    }

    cursor.databases ??= [];
    cursor.pending ??= [];
    cursor.databaseIndex ??= 0;
    while (!unassignedPhase && cursor.databaseIndex < cursor.databases.length) {
      const database = cursor.databases[cursor.databaseIndex];
      try {
        if (cursor.pending.length === 0) {
          const page = await queryDataSource(
            database.id,
            cursor.dataSourceCursor ?? null,
          );
          cursor.pending = page.pages
            .filter((row) => !row.inTrash && row.object === "page")
            .map((row) => candidate(row, database.parent ?? database.id));
          cursor.dataSourceCursor = page.nextCursor;
          if (cursor.pending.length === 0 && page.nextCursor === null) {
            cursor.databaseIndex += 1;
            cursor.dataSourceCursor = null;
            if (await shouldContinue()) {
              return { registered, unsupported, continued: true };
            }
            continue;
          }
        }
        while (cursor.pending.length > 0) {
          const status = await registerCandidate(client, rootId, cursor.pending[0]);
          if (status === "limit" || status === "paused") {
            await saveCursor(client, rootId, lease, cursor, false);
            return { registered, unsupported, continued: false };
          }
          if (status === "created" || status === "linked") registered += 1;
          cursor.pending.shift();
          if (await shouldContinue()) {
            return { registered, unsupported, continued: true };
          }
        }
        if (cursor.dataSourceCursor === null) cursor.databaseIndex += 1;
      } catch (error) {
        if (!skippableDatabaseError(error)) throw error;
        unsupported += 1;
        await recordUnsupported(client, rootId);
        cursor.pending = [];
        cursor.dataSourceCursor = null;
        cursor.databaseIndex += 1;
      }
    }

    if (root.scope === "workspace") {
      await rpc(client, "set_notion_unassigned_count", {
        p_root: rootId,
        p_count: 0,
      });
      cursor = { mode: "imports", unassignedDone: true };
    } else if (unassignedPhase) {
      if (await refreshUnassignedCount(client, rootId, cursor, expired, continueLater)) {
        return { registered, unsupported, continued: true };
      }
      cursor = { mode: "imports", unassignedDone: true };
    } else {
      cursor = { mode: "imports", unassignedDone: false };
    }
    await saveCursor(client, rootId, lease, cursor, false);
    await rpc(client, "settle_notion_root", { p_root: rootId });
    return { registered, unsupported, continued: false };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "error_code") === "notion_rate_limited"
    ) {
      await saveCursor(client, rootId, lease, cursor, false);
    }
    throw error;
  }
}

export function registerNotionDiscoverHandler(): void {
  registerHandler("notion_discover", async (payload: unknown) => {
    const parsed = payloadFrom(payload);
    await discoverNotionRoot(parsed.rootId, { reconcile: parsed.reconcile });
  });
}
