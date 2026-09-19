import type {
  RetroActivity,
  RetroConnectionConfig,
  RetroConnectionProvider,
} from "@/lib/contracts";
import { localDate, normalizeActivity } from "@/lib/retro/bundle";
import { connectorError } from "./http";
import { dayWindow, record, rows, str } from "./map";

type Get = (url: URL | string, body?: unknown) => Promise<unknown>;
/** Only projected scalar fields leave this adapter; no customer records or message bodies. */
export async function pullExtended(
  provider: RetroConnectionProvider,
  config: RetroConnectionConfig,
  subject: string,
  date: string,
  get: Get,
): Promise<RetroActivity[]> {
  const window = dayWindow(date, "Asia/Seoul"),
    output: RetroActivity[] = [];
  function add(
    kind: RetroActivity["kind"],
    id: unknown,
    time: unknown,
    title: string,
    text = "",
    meta: RetroActivity["meta"] = {},
  ) {
    const ref = str(id),
      value = str(time),
      milliseconds = Date.parse(value);
    if (
      !ref ||
      ref.length > 200 ||
      !Number.isFinite(milliseconds) ||
      localDate(new Date(milliseconds), "Asia/Seoul") !== date ||
      output.length >= 200
    )
      return;
    output.push(
      normalizeActivity({
        kind,
        ref,
        at: new Date(milliseconds).toISOString(),
        title: title.slice(0, 200),
        text: text.slice(0, 500),
        meta: { provider, ...meta },
      }),
    );
  }
  if (provider === "jira" || provider === "confluence") {
    const granted = rows(
      await get("https://api.atlassian.com/oauth/token/accessible-resources"),
    );
    const scope =
      provider === "jira" ? "read:jira-work" : "read:page:confluence";
    if (
      !granted.some(
        (site) =>
          str(site.id) === config.cloudId &&
          Array.isArray(site.scopes) &&
          site.scopes.includes(scope),
      )
    )
      throw connectorError("connector_scope_denied");
  }
  if (provider === "jira") {
    const base = `https://api.atlassian.com/ex/jira/${config.cloudId}/rest/api/3`;
    let cursor = "";
    const seen = new Set<string>();
    // Updated range may include work by others: the author check below is mandatory.
    for (let page = 0; page < 3 && output.length < 200; page++) {
      const data = record(
        await get(`${base}/search/jql`, {
          jql: `project in (${config.projects!.map((p) => JSON.stringify(p)).join(",")}) AND updated >= "${new Date(Date.parse(window.from) - 86400000).toISOString().slice(0, 10)}" ORDER BY updated DESC`,
          fields: ["key"],
          maxResults: 15,
          ...(cursor ? { nextPageToken: cursor } : {}),
        }),
      );
      for (const issue of rows(data.issues)) {
        const key = str(issue.key);
        if (
          !/^[A-Z][A-Z0-9_]*-\d+$/.test(key) ||
          !config.projects!.includes(key.replace(/-\d+$/, ""))
        )
          continue;
        for (let start = 0; start < 300 && output.length < 200; start += 100) {
          const changes = record(
            await get(
              `${base}/issue/${key}/changelog?startAt=${start}&maxResults=100`,
            ),
          );
          const values = rows(changes.values);
          for (const change of values) {
            if (str(record(change.author).accountId) !== subject) continue;
            const states = rows(change.items).filter(
              (i) => i.field === "status",
            );
            if (states.length)
              add(
                "jira_transition",
                `${key}:${str(change.id)}`,
                change.created,
                `${key} 상태 변경`,
                states
                  .map((s) => `${str(s.fromString)} → ${str(s.toString)}`)
                  .join(" · "),
              );
          }
          if (changes.isLast === true || values.length < 100) break;
        }
        const logs = record(
          await get(
            `${base}/issue/${key}/worklog?startedAfter=${Date.parse(window.from)}&startedBefore=${Date.parse(window.to)}&maxResults=100`,
          ),
        );
        for (const log of rows(logs.worklogs))
          if (str(record(log.author).accountId) === subject)
            add(
              "jira_worklog",
              `${key}:${str(log.id)}`,
              log.created,
              `${key} 작업 시간 기록`,
              "작업 시간을 기록했습니다.",
              {
                seconds:
                  typeof log.timeSpentSeconds === "number"
                    ? log.timeSpentSeconds
                    : 0,
              },
            );
        if (output.length >= 200) break;
      }
      const next = str(data.nextPageToken);
      if (data.isLast === true || !next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
  } else if (provider === "confluence") {
    const base = `https://api.atlassian.com/ex/confluence/${config.cloudId}/wiki/api/v2`;
    for (const id of config.pageIds!)
      for (const type of ["versions", "footer-comments"]) {
        let cursor = "";
        const seen = new Set<string>();
        for (let page = 0; page < 3 && output.length < 200; page++) {
          const url = new URL(`${base}/pages/${id}/${type}`);
          url.searchParams.set("limit", "100");
          if (cursor) url.searchParams.set("cursor", cursor);
          const data = record(await get(url));
          for (const row of rows(data.results)) {
            const version = type === "versions" ? row : record(row.version);
            if (str(version.authorId) !== subject) continue;
            if (type === "versions")
              add(
                "confluence_edit",
                `${id}:${str(version.number)}`,
                version.createdAt,
                `문서 ${id} 버전 ${str(version.number)}`,
                str(version.message),
              );
            else
              add(
                "confluence_comment",
                `${id}:${str(row.id)}`,
                version.createdAt,
                `문서 ${id}에 남긴 의견`,
                "문서에 의견을 남겼습니다.",
              );
          }
          // Extract only the cursor; response URLs never determine a request origin/path.
          let next = "";
          try {
            next =
              new URL(
                str(record(data._links).next),
                "https://api.atlassian.com",
              ).searchParams.get("cursor") || "";
          } catch {
            /* no next page */
          }
          if (!next || seen.has(next)) break;
          seen.add(next);
          cursor = next;
        }
      }
  } else if (provider === "linear") {
    for (const id of config.issues!) {
      let cursor = "";
      const seen = new Set<string>();
      for (let page = 0; page < 5 && output.length < 200; page++) {
        const data = record(
          await get("https://api.linear.app/graphql", {
            query:
              "query RetroHistory($id: String!, $after: String) { issue(id: $id) { id identifier history(first: 100, after: $after) { nodes { id actorId createdAt } pageInfo { hasNextPage endCursor } } } }",
            variables: { id, after: cursor || null },
          }),
        );
        if (data.errors) throw connectorError("connector_failed");
        const issue = record(record(data.data).issue),
          history = record(issue.history);
        for (const change of rows(history.nodes))
          if (str(change.actorId) === subject)
            add(
              "linear_change",
              `${id}:${str(change.id)}`,
              change.createdAt,
              `${str(issue.identifier) || "이슈"} 변경`,
              "이슈 정보를 변경했습니다.",
            );
        const info = record(history.pageInfo),
          next = str(info.endCursor);
        if (info.hasNextPage !== true || !next || seen.has(next)) break;
        seen.add(next);
        cursor = next;
      }
    }
  } else if (provider === "hubspot") {
    for (const [type, kind, title] of [
      ["calls", "crm_call", "통화 기록 작성"],
      ["meetings", "crm_meeting", "미팅 기록 작성"],
      ["emails", "crm_email", "메일 기록 작성"],
      ["notes", "crm_note", "고객 업무 메모 작성"],
    ] as const) {
      let cursor = "";
      const seen = new Set<string>();
      for (let page = 0; page < 5 && output.length < 200; page++) {
        const data = record(
          await get(`https://api.hubapi.com/crm/v3/objects/${type}/search`, {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "hs_created_by_user_id",
                    operator: "EQ",
                    value: subject,
                  },
                  {
                    propertyName: "hs_timestamp",
                    operator: "GTE",
                    value: String(Date.parse(window.from)),
                  },
                  {
                    propertyName: "hs_timestamp",
                    operator: "LT",
                    value: String(Date.parse(window.to)),
                  },
                ],
              },
            ],
            properties: [
              "hs_created_by_user_id",
              "hs_timestamp",
              ...(type === "calls" ? ["hs_call_source"] : []),
            ],
            limit: 100,
            ...(cursor ? { after: cursor } : {}),
          }),
        );
        for (const row of rows(data.results)) {
          const p = record(row.properties);
          if (
            str(p.hs_created_by_user_id) !== subject ||
            (type === "calls" && str(p.hs_call_source))
          )
            continue;
          const raw = str(p.hs_timestamp),
            time = /^\d{10,13}$/.test(raw)
              ? new Date(Number(raw)).toISOString()
              : raw;
          add(
            kind,
            `${type}:${str(row.id)}`,
            time,
            title,
            "고객 업무에 관한 기록을 남겼습니다.",
          );
        }
        const next = str(record(record(data.paging).next).after);
        if (!next || seen.has(next)) break;
        seen.add(next);
        cursor = next;
      }
    }
  } else if (provider === "salesmap") {
    let cursor = "";
    const seen = new Set<string>();
    for (let page = 0; page < 10 && output.length < 200; page++) {
      const url = new URL("https://salesmap.kr/api/v2/memo");
      url.search = new URLSearchParams({
        ownerId: subject,
        startDate: window.from,
        endDate: window.to,
        ...(cursor ? { cursor } : {}),
      }).toString();
      const response = record(await get(url));
      if (response.success !== true) throw connectorError("connector_failed");
      const data = record(response.data);
      for (const row of rows(data.memoList))
        if (str(row.ownerId) === subject)
          add(
            "crm_note",
            row.id,
            row.createdAt,
            "고객 업무 메모 작성",
            "고객 업무 메모를 남겼습니다.",
          );
      const next = str(data.nextCursor);
      if (!next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
  } else if (provider === "intercom") {
    let cursor = "";
    const seen = new Set<string>();
    for (let page = 0; page < 5 && output.length < 200; page++) {
      const data = record(
        await get("https://api.intercom.io/conversations/search", {
          query: {
            operator: "AND",
            value: [
              { field: "teammate_ids", operator: "IN", value: [subject] },
              {
                field: "updated_at",
                operator: ">",
                value: Date.parse(window.from) / 1000,
              },
              {
                field: "updated_at",
                operator: "<",
                value: Date.parse(window.to) / 1000,
              },
            ],
          },
          pagination: {
            per_page: 10,
            ...(cursor ? { starting_after: cursor } : {}),
          },
        }),
      );
      for (const conversation of rows(data.conversations)) {
        const id = str(conversation.id);
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) continue;
        const detail = record(
          await get(`https://api.intercom.io/conversations/${id}`),
        );
        for (const part of rows(
          record(detail.conversation_parts).conversation_parts,
        )) {
          const author = record(part.author);
          if (
            str(author.id) !== subject ||
            author.type !== "admin" ||
            !["comment", "note", "close"].includes(str(part.part_type))
          )
            continue;
          const time =
            typeof part.created_at === "number"
              ? new Date(part.created_at * 1000).toISOString()
              : "";
          add(
            part.part_type === "close" ? "ticket_closed" : "ticket_handled",
            `${id}:${str(part.id)}`,
            time,
            part.part_type === "close" ? "상담 마침" : "상담에 기록 남김",
            part.part_type === "close"
              ? "상담을 마쳤습니다."
              : "상담에 답글 또는 메모를 남겼습니다.",
          );
        }
        if (output.length >= 200) break;
      }
      const next = str(record(record(data.pages).next).starting_after);
      if (!next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
  } else if (provider === "pipedrive") {
    let cursor = "";
    const seen = new Set<string>();
    for (let page = 0; page < 10 && output.length < 200; page++) {
      const url = new URL("https://api.pipedrive.com/api/v2/activities");
      url.search = new URLSearchParams({
        owner_id: subject,
        updated_since: window.from,
        updated_until: window.to,
        limit: "100",
        ...(cursor ? { cursor } : {}),
      }).toString();
      const data = record(await get(url));
      for (const row of rows(data.data)) {
        if (
          str(row.owner_id) !== subject ||
          str(row.creator_user_id) !== subject
        )
          continue;
        const kind =
          row.type === "call"
            ? "crm_call"
            : row.type === "meeting"
              ? "crm_meeting"
              : row.type === "email"
                ? "crm_email"
                : "crm_note";
        // Free-text subject/notes can contain customer names, so do not read them.
        add(
          kind,
          row.id,
          row.add_time,
          kind === "crm_call"
            ? "통화 기록 작성"
            : kind === "crm_meeting"
              ? "미팅 기록 작성"
              : kind === "crm_email"
                ? "메일 기록 작성"
                : "고객 업무 기록 작성",
          "고객 업무에 관한 기록을 남겼습니다.",
        );
      }
      const next = str(record(data.additional_data).next_cursor);
      if (!next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
  } else if (provider === "youtube") {
    let cursor = "";
    const seen = new Set<string>();
    for (let page = 0; page < 4 && output.length < 200; page++) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.search = new URLSearchParams({
        part: "snippet",
        type: "video",
        forMine: "true",
        publishedAfter: window.from,
        publishedBefore: window.to,
        maxResults: "50",
        fields: "nextPageToken,items(id/videoId,snippet(title,publishedAt))",
        ...(cursor ? { pageToken: cursor } : {}),
      }).toString();
      const data = record(await get(url));
      for (const row of rows(data.items)) {
        const snippet = record(row.snippet);
        add(
          "video_publish",
          record(row.id).videoId,
          snippet.publishedAt,
          str(snippet.title) || "올린 영상",
          "연결한 채널에 영상을 올렸습니다.",
        );
      }
      const next = str(data.nextPageToken);
      if (!next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
  } else if (provider === "ga4") {
    const names = ["activeUsers", "sessions", "screenPageViews"];
    const data = record(
      await get(
        `https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: date, endDate: date }],
          metrics: names.map((name) => ({ name })),
          limit: "1",
        },
      ),
    );
    const values = rows(rows(data.rows)[0]?.metricValues),
      headers = rows(data.metricHeaders);
    if (
      values.length &&
      headers.length === names.length &&
      headers.every((h, i) => h.name === names[i])
    ) {
      const counts = values.map((v) => Number(str(v.value)));
      if (
        counts.length !== names.length ||
        counts.some((v) => !Number.isFinite(v) || v < 0)
      )
        throw connectorError("connector_invalid_response");
      add(
        "metric_snapshot",
        `${config.propertyId}:${date}`,
        window.from,
        "사이트 이용 수치",
        `활성 사용자 ${counts[0]}명 · 방문 ${counts[1]}회 · 조회 ${counts[2]}회`,
        Object.fromEntries(names.map((n, i) => [n, counts[i]])),
      );
    }
  } else throw connectorError("connector_scope_denied");
  return output;
}
