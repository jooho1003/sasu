"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SettingsMember = {
  user_id: string;
  display_name: string;
  role: "lead" | "member";
  slack_user_id: string | null;
  consented_at: string | null;
};

type SettingsSource = {
  id: string;
  kind: "slack_channel" | "meeting" | "notion_page";
  external_id: string;
  title: string | null;
  visibility: "dept" | "leads_only";
  active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

type SlackChannel = { id: string; name: string; isPrivate: boolean };
type SlackUser = { id: string; displayName: string };

type SettingsPayload = {
  current_user_id: string;
  role: "lead" | "member";
  members: SettingsMember[];
  sources: SettingsSource[];
  channels: SlackChannel[];
  slack_users: SlackUser[];
  channels_available: boolean;
  error?: string;
};

type ActionState = { kind: "idle" | "pending" | "success" | "error"; message: string };

const IDLE_ACTION: ActionState = { kind: "idle", message: "" };

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "요청을 처리하지 못했습니다.");
  }
  return body;
}

export default function SettingsS5({ deptId }: { deptId: string }) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<ActionState>(IDLE_ACTION);
  const [sourceState, setSourceState] = useState<ActionState>(IDLE_ACTION);
  const [backfillState, setBackfillState] = useState<ActionState>(IDLE_ACTION);
  const [notionState, setNotionState] = useState<ActionState>(IDLE_ACTION);
  const [meetingState, setMeetingState] = useState<ActionState>(IDLE_ACTION);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [isPrinciples, setIsPrinciples] = useState(false);
  const [notionPageId, setNotionPageId] = useState("");
  const [notionTitle, setNotionTitle] = useState("부서 원칙 문서");
  const [notionVisibility, setNotionVisibility] = useState<"dept" | "leads_only">("dept");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingVisibility, setMeetingVisibility] = useState<"dept" | "leads_only">("dept");
  const [meetingFile, setMeetingFile] = useState<File | null>(null);
  const [memberMappings, setMemberMappings] = useState<Record<string, string>>({});
  const [mappingState, setMappingState] = useState<ActionState>(IDLE_ACTION);

  const currentMember = useMemo(
    () => data?.members.find((member) => member.user_id === data.current_user_id) ?? null,
    [data],
  );
  const connectedSlackSources = useMemo(
    () => data?.sources.filter((source) => source.kind === "slack_channel" && source.active) ?? [],
    [data],
  );
  const allConsented = data?.members.every((member) => member.consented_at !== null) ?? false;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/settings`, {
        cache: "no-store",
      });
      const payload = await readResponse<SettingsPayload>(response);
      setData(payload);
      setMemberMappings(Object.fromEntries(payload.members.map((member) => [member.user_id, member.slack_user_id ?? ""])));
      setLoadError(null);
      if (!selectedChannel && payload.channels.length > 0) {
        setSelectedChannel(payload.channels[0].id);
        setChannelTitle(`#${payload.channels[0].name}`);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "부서 세팅을 불러오지 못했습니다.");
    }
  }, [deptId, selectedChannel]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateConsent = async (consented: boolean) => {
    setConsentState({ kind: "pending", message: "동의 상태를 저장하는 중입니다." });
    try {
      await readResponse(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/consent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consented }),
        }),
      );
      setConsentState({
        kind: "success",
        message: consented ? "수집 동의가 기록되었습니다." : "수집 동의를 철회했습니다.",
      });
      await load();
    } catch (error) {
      setConsentState({
        kind: "error",
        message: error instanceof Error ? error.message : "동의 상태를 저장하지 못했습니다.",
      });
    }
  };

  const connectSource = async () => {
    if (!selectedChannel || !channelTitle.trim()) {
      setSourceState({ kind: "error", message: "Slack 채널과 표시 이름을 선택해주세요." });
      return;
    }
    setSourceState({ kind: "pending", message: "멤버 동의 확인과 채널 연결을 진행하는 중입니다." });
    try {
      await readResponse(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/source`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            external_id: selectedChannel,
            title: channelTitle.trim(),
            visibility,
            is_principles: isPrinciples,
          }),
        }),
      );
      setSourceState({ kind: "success", message: "채널을 연결하고 수집 공지를 게시했습니다." });
      await load();
    } catch (error) {
      setSourceState({
        kind: "error",
        message: error instanceof Error ? error.message : "Slack 채널을 연결하지 못했습니다.",
      });
    }
  };

  const startBackfill = async (sourceId: string) => {
    setBackfillState({ kind: "pending", message: "최근 7일 백필을 시작하는 중입니다." });
    try {
      await readResponse(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/backfill`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source_id: sourceId }),
        }),
      );
      setBackfillState({ kind: "success", message: "백필 job을 시작했습니다. 대시보드에 순차 반영됩니다." });
    } catch (error) {
      setBackfillState({
        kind: "error",
        message: error instanceof Error ? error.message : "백필을 시작하지 못했습니다.",
      });
    }
  };

  const importNotion = async () => {
    if (!notionPageId.trim()) {
      setNotionState({ kind: "error", message: "Notion 페이지 URL 또는 ID를 입력해주세요." });
      return;
    }
    setNotionState({ kind: "pending", message: "Notion 가져오기 job을 준비하는 중입니다." });
    try {
      await readResponse(await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/notion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_id: notionPageId.trim(), title: notionTitle.trim(), visibility: notionVisibility }),
      }));
      setNotionState({ kind: "success", message: "Notion 가져오기를 시작했습니다. 항목은 분류 후 대시보드에 나타납니다." });
      await load();
    } catch (error) {
      setNotionState({ kind: "error", message: error instanceof Error ? error.message : "Notion 가져오기를 시작하지 못했습니다." });
    }
  };

  const uploadMeeting = async () => {
    if (!meetingFile) {
      setMeetingState({ kind: "error", message: "VTT 또는 TXT 전사 파일을 선택해주세요." });
      return;
    }
    setMeetingState({ kind: "pending", message: "전사를 저장하고 요약 job을 시작하는 중입니다." });
    const form = new FormData();
    form.set("file", meetingFile);
    form.set("title", meetingTitle.trim() || meetingFile.name);
    form.set("visibility", meetingVisibility);
    try {
      const result = await readResponse<{ skipped?: number }>(await fetch(`/api/d/${encodeURIComponent(deptId)}/meetings/transcript`, {
        method: "POST",
        body: form,
      }));
      const skipped = result.skipped ? ` 화자 확인이 안 된 ${result.skipped}개 발언은 저장하지 않았습니다.` : "";
      setMeetingState({ kind: "success", message: `회의 전사를 저장하고 요약을 시작했습니다.${skipped}` });
      setMeetingFile(null);
      await load();
    } catch (error) {
      setMeetingState({ kind: "error", message: error instanceof Error ? error.message : "회의 전사를 업로드하지 못했습니다." });
    }
  };

  const saveMemberMapping = async (userId: string) => {
    const slackUserId = memberMappings[userId] ?? "";
    if (!slackUserId) {
      setMappingState({ kind: "error", message: "Slack 계정을 선택해주세요." });
      return;
    }
    setMappingState({ kind: "pending", message: "Slack 계정 매핑을 저장하는 중입니다." });
    try {
      await readResponse(await fetch("/api/d/" + encodeURIComponent(deptId) + "/settings/member", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, slack_user_id: slackUserId }),
      }));
      setMappingState({ kind: "success", message: "Slack 계정 매핑을 저장했습니다." });
      await load();
    } catch (error) {
      setMappingState({ kind: "error", message: error instanceof Error ? error.message : "Slack 계정 매핑을 저장하지 못했습니다." });
    }
  };

  if (loadError) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-4xl gap-5 px-5 py-10 sm:px-8">
        <Link href={`/d/${deptId}`}>← 대시보드</Link>
        <div className="rounded-2xl bg-[var(--surface)] p-6">
          <h1 className="m-0 text-3xl">부서 세팅</h1>
          <p className="mb-0 text-[var(--muted)]">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data || !currentMember) {
    return <main className="mx-auto min-h-screen max-w-4xl px-5 py-10">부서 세팅을 불러오는 중입니다.</main>;
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-4xl gap-6 px-5 py-10 text-left sm:px-8">
      <header className="grid gap-3">
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href={`/d/${deptId}`}>대시보드</Link>
          <Link href={`/d/${deptId}/ask`}>묻기</Link>
          <Link href={`/d/${deptId}/documents`}>문서</Link>
          <Link href={`/d/${deptId}/ledger`}>원장</Link>
        </nav>
        <p className="m-0 text-sm font-bold text-[var(--accent)]">S5 · 부서 세팅</p>
        <h1 className="m-0 text-4xl">수집 범위와 동의를 확인하세요</h1>
        <p className="m-0 text-[var(--muted)]">
          멤버 동의가 확인된 발언만 저장하고, 소스의 visibility에 따라 답변 근거를 제한합니다.
        </p>
      </header>

      <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-2xl">1. 내 수집 동의</h2>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
              원장에 인용된 발언은 결정 기록의 일부로 남습니다. 동의를 철회하면 이후 발언부터 저장하지 않습니다.
            </p>
          </div>
          <span className="rounded-full bg-black/5 px-3 py-1 text-sm font-bold">
            {currentMember.consented_at ? "동의함" : "미동의"}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={consentState.kind === "pending" || Boolean(currentMember.consented_at)}
            onClick={() => void updateConsent(true)}
            type="button"
          >
            동의하기
          </button>
          <button
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-bold disabled:opacity-50"
            disabled={consentState.kind === "pending" || !currentMember.consented_at}
            onClick={() => void updateConsent(false)}
            type="button"
          >
            동의 철회
          </button>
        </div>
        {consentState.message ? <p className="m-0 text-sm text-[var(--muted)]">{consentState.message}</p> : null}
      </section>

      <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
        <div>
          <h2 className="m-0 text-2xl">2. 멤버 동의 상태</h2>
          <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
            Slack 채널을 연결하려면 채널 멤버가 모두 계정에 연결되고 동의해야 합니다.
          </p>
        </div>
        <ul className="m-0 grid gap-2 p-0">
          {data.members.map((member) => (
            <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 py-3 last:border-b-0">
              <div className="grid gap-1">
                <span>{member.display_name} · {member.role === "lead" ? "팀장" : "팀원"}</span>
                <span className="text-sm text-[var(--muted)]">{member.consented_at ? "동의" : "미동의"}</span>
              </div>
              {data.role === "lead" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm" value={memberMappings[member.user_id] ?? ""} onChange={(event) => setMemberMappings((current) => ({ ...current, [member.user_id]: event.target.value }))}>
                    <option value="">Slack 계정 선택</option>
                    {data.slack_users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                  </select>
                  <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50" disabled={mappingState.kind === "pending"} onClick={() => void saveMemberMapping(member.user_id)} type="button">저장</button>
                </div>
              ) : (
                <span className="text-sm text-[var(--muted)]">{member.slack_user_id ? "Slack 연결됨" : "Slack 계정 미연결"}</span>
              )}
            </li>
          ))}
        </ul>
        {mappingState.message ? <p className="m-0 text-sm text-[var(--muted)]">{mappingState.message}</p> : null}
      </section>

      {data.role === "lead" ? (
        <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
          <div>
            <h2 className="m-0 text-2xl">3. Slack 채널 연결</h2>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
              연결 시 채널에 수집 공지를 게시하고 최근 7일 백필을 준비합니다.
            </p>
          </div>
          {!allConsented ? (
            <p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-4 text-sm">모든 부서 멤버의 동의가 먼저 필요합니다.</p>
          ) : null}
          {!data.channels_available ? (
            <p className="m-0 rounded-xl bg-black/5 p-4 text-sm">Slack 앱 토큰을 확인하지 못했습니다. 관리자 설정 후 다시 불러와주세요.</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">
              Slack 채널
              <select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={selectedChannel} onChange={(event) => {
                const nextId = event.target.value;
                const channel = data.channels.find((item) => item.id === nextId);
                setSelectedChannel(nextId);
                if (channel) setChannelTitle(`#${channel.name}`);
              }}>
                <option value="">채널 선택</option>
                {data.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.isPrivate ? "🔒 " : "#"}{channel.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              표시 이름
              <input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={channelTitle} onChange={(event) => setChannelTitle(event.target.value)} placeholder="#프로젝트" />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              visibility
              <select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={visibility} onChange={(event) => setVisibility(event.target.value as "dept" | "leads_only")}>
                <option value="dept">부서 전체</option>
                <option value="leads_only">팀장만</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-sm font-bold">
              <input checked={isPrinciples} onChange={(event) => setIsPrinciples(event.target.checked)} type="checkbox" />
              부서 원칙 채널
            </label>
          </div>
          <button
            className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!allConsented || !data.channels_available || sourceState.kind === "pending"}
            onClick={() => void connectSource()}
            type="button"
          >
            {sourceState.kind === "pending" ? "연결 중…" : "채널 연결 및 공지 게시"}
          </button>
          {sourceState.message ? <p className="m-0 text-sm text-[var(--muted)]">{sourceState.message}</p> : null}
        </section>
      ) : null}

      {data.role === "lead" ? (
        <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
          <div>
            <h2 className="m-0 text-2xl">4. 회의 전사 업로드</h2>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">Zoom·Meet 기본 전사 VTT/TXT를 올리면 화자 동의가 확인된 발언만 저장합니다.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">회의 이름<input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="주간 회의" /></label>
            <label className="grid gap-2 text-sm font-bold">visibility<select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={meetingVisibility} onChange={(event) => setMeetingVisibility(event.target.value as "dept" | "leads_only")}><option value="dept">부서 전체</option><option value="leads_only">팀장만</option></select></label>
            <label className="grid gap-2 text-sm font-bold sm:col-span-2">전사 파일<input accept=".vtt,.txt,text/vtt,text/plain" className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" onChange={(event) => setMeetingFile(event.target.files?.[0] ?? null)} type="file" /></label>
          </div>
          <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={meetingState.kind === "pending"} onClick={() => void uploadMeeting()} type="button">{meetingState.kind === "pending" ? "업로드 중…" : "전사 업로드"}</button>
          {meetingState.message ? <p className="m-0 text-sm text-[var(--muted)]">{meetingState.message}</p> : null}
        </section>
      ) : null}

      {data.role === "lead" ? (
        <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
          <div>
            <h2 className="m-0 text-2xl">5. Notion 원칙 문서</h2>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">공유된 페이지와 하위 블록을 한 번 가져옵니다. 다시 가져오면 기존 블록은 멱등 처리됩니다.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold sm:col-span-2">페이지 URL 또는 ID<input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={notionPageId} onChange={(event) => setNotionPageId(event.target.value)} placeholder="https://www.notion.so/..." /></label>
            <label className="grid gap-2 text-sm font-bold">표시 이름<input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={notionTitle} onChange={(event) => setNotionTitle(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-bold">visibility<select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={notionVisibility} onChange={(event) => setNotionVisibility(event.target.value as "dept" | "leads_only")}><option value="dept">부서 전체</option><option value="leads_only">팀장만</option></select></label>
          </div>
          <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={notionState.kind === "pending"} onClick={() => void importNotion()} type="button">{notionState.kind === "pending" ? "가져오는 중…" : "원칙 문서 가져오기"}</button>
          {notionState.message ? <p className="m-0 text-sm text-[var(--muted)]">{notionState.message}</p> : null}
        </section>
      ) : null}

      <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
        <div>
          <h2 className="m-0 text-2xl">연결된 입력과 백필</h2>
          <p className="mb-0 mt-2 text-sm text-[var(--muted)]">백필 job은 수집 후 분류·임베딩·카드 생성을 순서대로 진행합니다.</p>
        </div>
        {connectedSlackSources.length === 0 ? <p className="m-0 text-sm text-[var(--muted)]">연결된 Slack 채널이 없습니다.</p> : null}
        <div className="grid gap-3">
          {data.sources.map((source) => (
            <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 p-4">
              <div className="grid gap-1">
                <strong>{source.title ?? source.external_id}</strong>
                <span className="text-sm text-[var(--muted)]">{source.kind === "slack_channel" ? "Slack" : source.kind === "meeting" ? "회의" : "Notion"} · {source.visibility === "leads_only" ? "팀장만" : "부서 전체"}</span>
                {source.last_error ? <span className="text-sm text-[var(--urgent)]">마지막 오류: {source.last_error}</span> : null}
              </div>
              {data.role === "lead" && source.kind === "slack_channel" ? (
                <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50" disabled={backfillState.kind === "pending"} onClick={() => void startBackfill(source.id)} type="button">
                  7일 백필 시작
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {backfillState.message ? <p className="m-0 text-sm text-[var(--muted)]">{backfillState.message}</p> : null}
      </section>
    </main>
  );
}
