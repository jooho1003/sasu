import type {
  RetroActivity,
  RetroConnectionConfig,
  RetroConnectionProvider,
  RetroCredential,
} from "@/lib/contracts";
import { credentialHeaders } from "./auth";
import { connectorError, connectorJson } from "./http";
import { dayWindow, mapConnectorRows, record, rows, str } from "./map";
import { parseConnectorConfig } from "./registry";
import { pullZendesk } from "./zendesk";
import { isDepartmentConnector, pullDepartment } from "./department";
import { pullMailchimp } from "./mailchimp";
import { pullExtended } from "./extended";

export async function pullConnector(
  provider: RetroConnectionProvider,
  input: RetroConnectionConfig,
  credential: RetroCredential,
  date: string,
  fetcher: typeof fetch = fetch,
): Promise<RetroActivity[]> {
  const config = parseConnectorConfig(provider, input),
    tz = "Asia/Seoul",
    window = dayWindow(date, tz);
  const headers = credentialHeaders(provider, credential),
    output: RetroActivity[] = [];
  let requests = 0;
  const get = async (url: URL | string, body?: unknown) => {
    if (++requests > 60) throw connectorError("connector_page_limit");
    return connectorJson(
      String(url),
      {
        headers: {
          ...headers,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      },
      fetcher,
    );
  };
  const add = (
    input: ReturnType<typeof rows>,
    kind?: RetroActivity["kind"],
    ref?: string,
    title?: string,
  ) =>
    output.push(
      ...mapConnectorRows(provider, input, date, tz, credential.subjectId, {
        kind,
        ref,
        title,
      }),
    );
  if (isDepartmentConnector(provider))
    return pullDepartment(provider, date, get);
  if (provider === "mailchimp")
    return pullMailchimp(credential.subjectId, date, get);
  if (provider === "zendesk") return pullZendesk(config, credential, date, get);
  if (provider === "figma") {
    for (const file of config.files!) {
      let before = "";
      const seen = new Set<string>();
      for (let page = 0; page < 5 && output.length < 200; page++) {
        const url = new URL(`https://api.figma.com/v1/files/${file}/versions`);
        url.searchParams.set("page_size", "100");
        if (before) url.searchParams.set("before", before);
        const data = record(await get(url));
        add(rows(data.versions), "figma_version", file);
        // Rebuild pagination against the fixed endpoint, never follow response URLs.
        const next = str(record(data.pagination).next_page);
        if (!next) break;
        let token = "";
        try {
          token = new URL(next).searchParams.get("before") || "";
        } catch {
          break;
        }
        if (!token || seen.has(token)) break;
        seen.add(token);
        before = token;
      }
      if (output.length >= 200) break;
      const comments = record(
        await get(`https://api.figma.com/v1/files/${file}/comments`),
      );
      add(rows(comments.comments), "figma_comment", file);
    }
  } else if (provider === "google_calendar") {
    let pageToken = "";
    const seen = new Set<string>();
    for (let page = 0; page < 10 && output.length < 200; page++) {
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      url.search = new URLSearchParams({
        timeMin: window.from,
        timeMax: window.to,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "100",
        fields:
          "nextPageToken,items(id,status,summary,start,organizer(self),attendees(self,responseStatus),hangoutLink,conferenceData(conferenceId))",
        ...(pageToken ? { pageToken } : {}),
      }).toString();
      const data = record(await get(url));
      add(rows(data.items));
      const next = str(data.nextPageToken);
      if (!next || seen.has(next)) break;
      seen.add(next);
      pageToken = next;
    }
  } else if (provider === "github") {
    for (const repo of config.repositories!) {
      for (
        let page = 1;
        page <= 3 && output.length < 200 && requests < 55;
        page++
      ) {
        const events = rows(
          await get(
            `https://api.github.com/repos/${repo}/events?per_page=100&page=${page}`,
          ),
        );
        add(events, "github_push", repo);
        if (
          events.length < 100 ||
          Date.parse(str(events.at(-1)?.created_at)) < Date.parse(window.from)
        )
          break;
      }
      for (let page = 1; page <= 3 && output.length < 200; page++) {
        const prs = rows(
          await get(
            `https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50&page=${page}`,
          ),
        );
        add(prs, "github_pr", repo);
        for (const pr of prs.slice(0, 10)) {
          if (output.length >= 200 || requests >= 58) break;
          const number = str(pr.number);
          if (
            !/^\d+$/.test(number) ||
            Date.parse(str(pr.updated_at)) < Date.parse(window.from)
          )
            continue;
          for (let rp = 1; rp <= 2 && output.length < 200; rp++) {
            const reviews = rows(
              await get(
                `https://api.github.com/repos/${repo}/pulls/${number}/reviews?per_page=100&page=${rp}`,
              ),
            );
            add(reviews, "github_review", repo + ":" + number, str(pr.title));
            if (reviews.length < 100) break;
          }
        }
        if (
          prs.length < 50 ||
          Date.parse(str(prs.at(-1)?.updated_at)) < Date.parse(window.from)
        )
          break;
      }
      if (output.length >= 200 || requests >= 58) break;
    }
  } else if (provider === "notion") {
    for (const page of config.pages!) {
      const document = record(
        await get(`https://api.notion.com/v1/pages/${page}`),
      );
      add([document], "notion_edit");
      let cursor = "";
      const seen = new Set<string>();
      for (let p = 0; p < 3 && output.length < 200; p++) {
        const url = new URL("https://api.notion.com/v1/comments");
        url.search = new URLSearchParams({
          block_id: page,
          page_size: "100",
          ...(cursor ? { start_cursor: cursor } : {}),
        }).toString();
        const data = record(await get(url));
        add(rows(data.results), "notion_comment", page, "문서에 남긴 의견");
        const next = str(data.next_cursor);
        if (data.has_more !== true || !next || seen.has(next)) break;
        seen.add(next);
        cursor = next;
      }
    }
  } else
    output.push(
      ...(await pullExtended(
        provider,
        config,
        credential.subjectId,
        date,
        get,
      )),
    );
  return [
    ...new Map(output.map((a) => [a.kind + ":" + a.ref, a])).values(),
  ].slice(0, 200);
}
