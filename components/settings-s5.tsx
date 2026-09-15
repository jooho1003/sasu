"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminAction } from "@/components/admin/actions";
import { LeadInvites } from "@/components/admin/lead-invites";

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

type ActionState = {
  kind: "idle" | "pending" | "success" | "error";
  message: string;
};

const IDLE_ACTION: ActionState = { kind: "idle", message: "" };

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.message ?? body.error ?? "요청을 처리하지 못했습니다.",
    );
  }
  return body;
}

export default function SettingsS5({
  deptId,
  memberAdminEnabled = false,
}: {
  deptId: string;
  memberAdminEnabled?: boolean;
}) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [section, setSection] = useState<"members" | "connections" | "imports">(
    "members",
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<ActionState>(IDLE_ACTION);
  const [sourceState, setSourceState] = useState<ActionState>(IDLE_ACTION);
  const [backfillState, setBackfillState] = useState<ActionState>(IDLE_ACTION);
  const [removalState, setRemovalState] = useState<ActionState>(IDLE_ACTION);
  const [notionState, setNotionState] = useState<ActionState>(IDLE_ACTION);
  const [meetingState, setMeetingState] = useState<ActionState>(IDLE_ACTION);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [isPrinciples, setIsPrinciples] = useState(false);
  const [notionPageId, setNotionPageId] = useState("");
  const [notionTitle, setNotionTitle] = useState("부서 원칙 문서");
  const [notionVisibility, setNotionVisibility] = useState<
    "dept" | "leads_only"
  >("dept");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingVisibility, setMeetingVisibility] = useState<
    "dept" | "leads_only"
  >("dept");
  const [meetingFile, setMeetingFile] = useState<File | null>(null);
  const [memberMappings, setMemberMappings] = useState<Record<string, string>>(
    {},
  );
  const [mappingState, setMappingState] = useState<ActionState>(IDLE_ACTION);
  const [consentRequestState, setConsentRequestState] =
    useState<ActionState>(IDLE_ACTION);

  const currentMember = useMemo(
    () =>
      data?.members.find((member) => member.user_id === data.current_user_id) ??
      null,
    [data],
  );
  const connectedSlackSources = useMemo(
    () =>
      data?.sources.filter(
        (source) => source.kind === "slack_channel" && source.active,
      ) ?? [],
    [data],
  );
  const allConsented =
    data?.members.every((member) => member.consented_at !== null) ?? false;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/d/${encodeURIComponent(deptId)}/settings`,
          {
            cache: "no-store",
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
              : AbortSignal.timeout(20_000),
          },
        );
        const payload = await readResponse<SettingsPayload>(response);
        if (
          !payload.members.some(
            (member) => member.user_id === payload.current_user_id,
          )
        )
          throw new Error(
            "내 멤버 정보를 확인하지 못했습니다. 다시 불러와 주세요.",
          );
        setData(payload);
        setMemberMappings(
          Object.fromEntries(
            payload.members.map((member) => [
              member.user_id,
              member.slack_user_id ?? "",
            ]),
          ),
        );
        setLoadError(null);
        if (payload.channels.length > 0) {
          setSelectedChannel((current) => current || payload.channels[0].id);
          setChannelTitle(
            (current) => current || `#${payload.channels[0].name}`,
          );
        }
      } catch (error) {
        if (!signal?.aborted)
          setLoadError(
            error instanceof Error && error.name !== "TimeoutError"
              ? error.message
              : "연결 확인이 지연되고 있습니다. 잠시 후 다시 불러와 주세요.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [deptId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const updateConsent = async (consented: boolean) => {
    setConsentState({
      kind: "pending",
      message: "동의 상태를 저장하는 중입니다.",
    });
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
        message: consented
          ? "수집 동의가 기록되었습니다."
          : "수집 동의를 철회했습니다.",
      });
      await load();
    } catch (error) {
      setConsentState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "동의 상태를 저장하지 못했습니다.",
      });
    }
  };

  const connectSource = async () => {
    if (!selectedChannel || !channelTitle.trim()) {
      setSourceState({
        kind: "error",
        message: "Slack 채널과 표시 이름을 선택해주세요.",
      });
      return;
    }
    setSourceState({
      kind: "pending",
      message: "멤버 동의 확인과 채널 연결을 진행하는 중입니다.",
    });
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
      setSourceState({
        kind: "success",
        message: "채널을 연결하고 수집 공지를 게시했습니다.",
      });
      await load();
    } catch (error) {
      setSourceState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Slack 채널을 연결하지 못했습니다.",
      });
    }
  };

  const startBackfill = async (sourceId: string) => {
    setBackfillState({
      kind: "pending",
      message: "최근 7일 대화를 가져오는 중입니다.",
    });
    try {
      await readResponse(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/backfill`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source_id: sourceId }),
        }),
      );
      setBackfillState({
        kind: "success",
        message:
          "최근 대화 가져오기를 시작했습니다. 정리가 끝나면 대시보드에 표시됩니다.",
      });
    } catch (error) {
      setBackfillState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "최근 대화를 가져오지 못했습니다.",
      });
    }
  };

  const removeSource = async (sourceId: string) => {
    if (
      !window.confirm(
        "제거하면 이 채널의 저장된 본문과 검색 데이터가 삭제됩니다. 원장에 인용된 문장은 남습니다. 다시 연결하면 최근 7일만 복구됩니다.",
      )
    )
      return;
    setRemovalState({
      kind: "pending",
      message: "입력 소스를 제거하는 중입니다.",
    });
    try {
      const result = await readResponse<{ removed_items: number }>(
        await fetch(
          `/api/d/${encodeURIComponent(deptId)}/settings/source?id=${encodeURIComponent(sourceId)}`,
          {
            method: "DELETE",
          },
        ),
      );
      setRemovalState({
        kind: "success",
        message: `${result.removed_items}개 항목의 본문과 검색 데이터를 삭제했습니다.`,
      });
      await load();
    } catch (error) {
      setRemovalState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "입력 소스를 제거하지 못했습니다.",
      });
    }
  };

  const importNotion = async () => {
    if (!notionPageId.trim()) {
      setNotionState({
        kind: "error",
        message: "Notion 페이지 URL 또는 ID를 입력해주세요.",
      });
      return;
    }
    setNotionState({
      kind: "pending",
      message: "Notion 문서를 연결하는 중입니다.",
    });
    try {
      await readResponse(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/notion`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page_id: notionPageId.trim(),
            title: notionTitle.trim(),
            visibility: notionVisibility,
          }),
        }),
      );
      setNotionState({
        kind: "success",
        message:
          "Notion 가져오기를 시작했습니다. 항목은 분류 후 대시보드에 나타납니다.",
      });
      await load();
    } catch (error) {
      setNotionState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Notion 가져오기를 시작하지 못했습니다.",
      });
    }
  };

  const reimportNotion = async (sourceId: string) => {
    setNotionState({
      kind: "pending",
      message: "Notion 다시 가져오기를 시작하는 중입니다.",
    });
    try {
      await readResponse(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/notion`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source_id: sourceId }),
        }),
      );
      setNotionState({
        kind: "success",
        message:
          "다시 가져오기를 시작했습니다. 완료되면 마지막 가져오기 시간이 갱신됩니다.",
      });
      await load();
    } catch (error) {
      setNotionState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Notion 다시 가져오기를 시작하지 못했습니다.",
      });
    }
  };

  const formatKst = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Seoul",
        }).format(new Date(value))
      : "아직 가져오지 않음";

  const uploadMeeting = async () => {
    if (!meetingFile) {
      setMeetingState({
        kind: "error",
        message: "VTT 또는 TXT 전사 파일을 선택해주세요.",
      });
      return;
    }
    setMeetingState({
      kind: "pending",
      message: "전사를 저장하고 회의 정리를 시작하는 중입니다.",
    });
    const form = new FormData();
    form.set("file", meetingFile);
    form.set("title", meetingTitle.trim() || meetingFile.name);
    form.set("visibility", meetingVisibility);
    try {
      const result = await readResponse<{ skipped?: number }>(
        await fetch(
          `/api/d/${encodeURIComponent(deptId)}/meetings/transcript`,
          {
            method: "POST",
            body: form,
          },
        ),
      );
      const skipped = result.skipped
        ? ` 화자 확인이 안 된 ${result.skipped}개 발언은 저장하지 않았습니다.`
        : "";
      setMeetingState({
        kind: "success",
        message: `회의 전사를 저장하고 요약을 시작했습니다.${skipped}`,
      });
      setMeetingFile(null);
      await load();
    } catch (error) {
      setMeetingState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "회의 전사를 업로드하지 못했습니다.",
      });
    }
  };

  const saveMemberMapping = async (userId: string) => {
    const slackUserId = memberMappings[userId] ?? "";
    if (!slackUserId) {
      setMappingState({ kind: "error", message: "Slack 계정을 선택해주세요." });
      return;
    }
    setMappingState({
      kind: "pending",
      message: "Slack 계정 연결을 저장하는 중입니다.",
    });
    try {
      await readResponse(
        await fetch(
          "/api/d/" + encodeURIComponent(deptId) + "/settings/member",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              slack_user_id: slackUserId,
            }),
          },
        ),
      );
      setMappingState({
        kind: "success",
        message: "Slack 계정 연결을 저장했습니다.",
      });
      await load();
    } catch (error) {
      setMappingState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Slack 계정 연결을 저장하지 못했습니다.",
      });
    }
  };

  const sendConsentRequests = async () => {
    setConsentRequestState({
      kind: "pending",
      message: "미동의 멤버에게 동의 요청을 보내는 중입니다.",
    });
    try {
      const result = await readResponse<{ message: string }>(
        await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/consent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "request" }),
        }),
      );
      setConsentRequestState({ kind: "success", message: result.message });
    } catch (error) {
      setConsentRequestState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "동의 요청을 보내지 못했습니다.",
      });
    }
  };

  const heading = (
    <header className="page-heading">
      <div>
        <p className="eyebrow">부서 세팅</p>
        <h1>수집 범위와 동의를 확인하세요</h1>
        <p>함께할 멤버와 자료를 연결하고, 우리 부서의 사수를 준비하세요.</p>
      </div>
    </header>
  );

  if (!data || !currentMember) {
    return (
      <main className="workspace-page">
        {heading}
        <section className="panel empty-state" aria-busy={loading}>
          <span className="surface-icon">
            <Icon name="settings" size={24} />
          </span>
          <h2>
            {loadError
              ? "세팅을 불러오지 못했습니다"
              : "우리 부서의 연결을 확인하고 있어요"}
          </h2>
          <p role={loadError ? "alert" : "status"}>
            {loadError ?? "멤버 동의와 연결된 채널을 확인하고 있습니다."}
          </p>
          {loadError ? (
            <button
              className="button button-secondary button-small"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              다시 불러오기
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="workspace-page settings-page">
      {heading}
      <div className="setup-summary" aria-label="부서 연결 현황">
        <div>
          <span className="surface-icon">
            <Icon name="people" />
          </span>
          <div>
            <span>멤버 수집 동의</span>
            <strong>
              {data.members.filter((member) => member.consented_at).length} /{" "}
              {data.members.length}명
            </strong>
          </div>
        </div>
        <div>
          <span className="surface-icon">
            <Icon name="hash" />
          </span>
          <div>
            <span>연결된 Slack</span>
            <strong>{connectedSlackSources.length}개 채널</strong>
          </div>
        </div>
        <div>
          <span className="surface-icon">
            <Icon name="file" />
          </span>
          <div>
            <span>연결된 회의·원칙</span>
            <strong>
              {
                data.sources.filter(
                  (source) => source.active && source.kind !== "slack_channel",
                ).length
              }
              개 자료
            </strong>
          </div>
        </div>
      </div>
      <div className="section-picker" role="group" aria-label="세팅 항목 선택">
        {(
          [
            ["members", "멤버·동의"],
            ["connections", "연결 관리"],
            ...(data.role === "lead" ? [["imports", "자료 가져오기"]] : []),
          ] as [typeof section, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={section === value}
            aria-controls={`settings-${value}`}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {loadError ? (
        <div className="inline-feedback" role="alert">
          <span>{loadError}</span>
          <button
            className="text-link"
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            다시 불러오기
          </button>
        </div>
      ) : null}
      <div
        id="settings-members"
        className="settings-sections"
        hidden={section !== "members"}
      >
        <section className="settings-panel panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl">내 수집 동의</h2>
              <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                원장에 인용된 발언은 결정 기록의 일부로 남습니다. 동의를
                철회하면 이후 발언부터 저장하지 않습니다.
              </p>
            </div>
            <span className="rounded-full bg-black/5 px-3 py-1 text-sm font-bold">
              {currentMember.consented_at ? "동의함" : "미동의"}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="button button-primary button-small w-fit"
              disabled={
                consentState.kind === "pending" ||
                Boolean(currentMember.consented_at)
              }
              onClick={() => void updateConsent(true)}
              type="button"
            >
              동의하기
            </button>
            <button
              className="rounded-lg border border-black/15 px-4 py-2 text-sm font-bold disabled:opacity-50"
              disabled={
                consentState.kind === "pending" || !currentMember.consented_at
              }
              onClick={() => void updateConsent(false)}
              type="button"
            >
              동의 철회
            </button>
          </div>
          {consentState.message ? (
            <p role="status" className="m-0 text-sm text-[var(--muted)]">
              {consentState.message}
            </p>
          ) : null}
        </section>

        <section className="settings-panel panel">
          <div>
            <h2 className="m-0 text-xl">함께하는 멤버</h2>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
              Slack 채널을 연결하려면 채널 멤버가 모두 계정에 연결되고 동의해야
              합니다.
            </p>
          </div>
          {data.role === "lead" ? (
            <button
              className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50"
              disabled={consentRequestState.kind === "pending"}
              onClick={() => void sendConsentRequests()}
              type="button"
            >
              {consentRequestState.kind === "pending"
                ? "보내는 중…"
                : "미동의 멤버에게 동의 요청 보내기"}
            </button>
          ) : null}
          <ul className="m-0 grid gap-2 p-0">
            {data.members.map((member) => (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 py-3 last:border-b-0"
              >
                <div className="grid gap-1">
                  <span>
                    {member.display_name} ·{" "}
                    {member.role === "lead" ? "팀장" : "팀원"}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {member.consented_at ? "동의" : "미동의"}
                  </span>
                </div>
                {data.role === "lead" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`${member.display_name} Slack 계정`}
                      className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
                      value={memberMappings[member.user_id] ?? ""}
                      onChange={(event) =>
                        setMemberMappings((current) => ({
                          ...current,
                          [member.user_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Slack 계정 선택</option>
                      {data.slack_users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50"
                      aria-label={`${member.display_name} Slack 계정 저장`}
                      disabled={mappingState.kind === "pending"}
                      onClick={() => void saveMemberMapping(member.user_id)}
                      type="button"
                    >
                      저장
                    </button>
                    {memberAdminEnabled ? (
                      <>
                        {member.role === "member" ? (
                          <AdminAction
                            label="부서장으로 지정"
                            endpoint={`/api/d/${deptId}/members/${member.user_id}/promote`}
                            description={`${member.display_name}님에게 부서장 권한을 부여합니다.`}
                            onChanged={load}
                          />
                        ) : (
                          <AdminAction
                            label="부서장 해제"
                            endpoint={`/api/d/${deptId}/members/${member.user_id}/demote`}
                            description={`${member.display_name}님의 부서장 권한을 해제합니다. 마지막 부서장은 해제할 수 없습니다.`}
                            onChanged={load}
                          />
                        )}
                        <AdminAction
                          label="제외"
                          endpoint={`/api/d/${deptId}/members/${member.user_id}/remove`}
                          description={`${member.display_name}님을 부서에서 제외합니다. 마지막 부서장은 제외할 수 없습니다.`}
                          onChanged={load}
                        />
                      </>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-sm text-[var(--muted)]">
                    {member.slack_user_id
                      ? "Slack 연결됨"
                      : "Slack 계정 미연결"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {mappingState.message ? (
            <p role="status" className="m-0 text-sm text-[var(--muted)]">
              {mappingState.message}
            </p>
          ) : null}
          {consentRequestState.message ? (
            <p className="m-0 text-sm text-[var(--muted)]">
              {consentRequestState.message}
            </p>
          ) : null}
          {memberAdminEnabled && data.role === "lead" ? (
            <LeadInvites deptId={deptId} onChanged={load} />
          ) : null}
        </section>
      </div>
      <div
        id="settings-connections"
        className="settings-sections"
        hidden={section !== "connections"}
      >
        <section className="settings-panel panel">
          <div>
            <h2 className="m-0 text-xl">연결된 자료</h2>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
              연결 상태와 공개 범위를 확인하고, 필요한 자료를 다시 가져오세요.
            </p>
          </div>
          {data.sources.length === 0 ? (
            <p className="m-0 text-sm text-[var(--muted)]">
              아직 연결된 자료가 없습니다. Slack 채널을 연결하거나 회의·원칙
              문서를 가져와 보세요.
            </p>
          ) : null}
          <div className="grid gap-3">
            {data.sources.map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 p-4"
              >
                <div className="grid gap-1">
                  <strong>{source.title ?? source.external_id}</strong>
                  <span className="text-sm text-[var(--muted)]">
                    {source.kind === "slack_channel"
                      ? "Slack"
                      : source.kind === "meeting"
                        ? "회의"
                        : "Notion"}{" "}
                    ·{" "}
                    {source.visibility === "leads_only"
                      ? "팀장만"
                      : "부서 전체"}
                  </span>
                  {source.kind === "notion_page" ? (
                    <span className="text-sm text-[var(--muted)]">
                      마지막 가져오기: {formatKst(source.last_synced_at)}
                    </span>
                  ) : null}
                  {source.last_error ? (
                    <span className="text-sm text-[var(--urgent)]">
                      마지막 오류: {source.last_error}
                    </span>
                  ) : null}
                </div>
                {data.role === "lead" ? (
                  <div className="flex flex-wrap gap-2">
                    {source.kind === "slack_channel" ? (
                      <button
                        className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50"
                        disabled={backfillState.kind === "pending"}
                        onClick={() => void startBackfill(source.id)}
                        type="button"
                      >
                        최근 7일 가져오기
                      </button>
                    ) : null}
                    {source.kind === "notion_page" && source.active ? (
                      <button
                        className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50"
                        disabled={notionState.kind === "pending"}
                        onClick={() => void reimportNotion(source.id)}
                        type="button"
                      >
                        {notionState.kind === "pending"
                          ? "가져오는 중…"
                          : "다시 가져오기"}
                      </button>
                    ) : null}
                    {source.active ? (
                      <button
                        className="rounded-lg border border-[var(--urgent)] px-3 py-2 text-sm font-bold text-[var(--urgent)] disabled:opacity-50"
                        disabled={removalState.kind === "pending"}
                        onClick={() => void removeSource(source.id)}
                        type="button"
                      >
                        {removalState.kind === "pending" ? "제거 중…" : "제거"}
                      </button>
                    ) : (
                      <span className="rounded-lg bg-black/5 px-3 py-2 text-sm text-[var(--muted)]">
                        제거됨
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {backfillState.message ? (
            <p role="status" className="m-0 text-sm text-[var(--muted)]">
              {backfillState.message}
            </p>
          ) : null}
          {removalState.message ? (
            <p role="status" className="m-0 text-sm text-[var(--muted)]">
              {removalState.message}
            </p>
          ) : null}
          {notionState.message ? (
            <p role="status" className="m-0 text-sm text-[var(--muted)]">
              {notionState.message}
            </p>
          ) : null}
        </section>
        {data.role === "lead" ? (
          <section className="settings-panel panel">
            <div>
              <h2 className="m-0 text-xl">Slack 채널 연결</h2>
              <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                연결하면 채널에 수집 안내를 게시하고 최근 7일 대화를 가져옵니다.
              </p>
            </div>
            {!allConsented ? (
              <p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-4 text-sm">
                모든 부서 멤버의 동의가 먼저 필요합니다.{" "}
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setSection("members")}
                >
                  멤버 동의 확인 →
                </button>
              </p>
            ) : null}
            {!data.channels_available ? (
              <p className="m-0 rounded-xl bg-black/5 p-4 text-sm">
                Slack 연결을 확인하지 못했습니다. 관리자에게 앱 연결 상태를
                확인해 주세요.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                Slack 채널
                <select
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={selectedChannel}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const channel = data.channels.find(
                      (item) => item.id === nextId,
                    );
                    setSelectedChannel(nextId);
                    if (channel) setChannelTitle(`#${channel.name}`);
                  }}
                >
                  <option value="">채널 선택</option>
                  {data.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.isPrivate ? "🔒 " : "#"}
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold">
                표시 이름
                <input
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={channelTitle}
                  onChange={(event) => setChannelTitle(event.target.value)}
                  placeholder="#프로젝트"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                공개 범위
                <select
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(event.target.value as "dept" | "leads_only")
                  }
                >
                  <option value="dept">부서 전체</option>
                  <option value="leads_only">팀장만</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm font-bold">
                <input
                  checked={isPrinciples}
                  onChange={(event) => setIsPrinciples(event.target.checked)}
                  type="checkbox"
                />
                부서 원칙 채널
              </label>
            </div>
            <button
              className="button button-primary button-small w-fit"
              disabled={
                !allConsented ||
                !data.channels_available ||
                sourceState.kind === "pending"
              }
              onClick={() => void connectSource()}
              type="button"
            >
              {sourceState.kind === "pending"
                ? "연결 중…"
                : "채널 연결 및 공지 게시"}
            </button>
            {sourceState.message ? (
              <p role="status" className="m-0 text-sm text-[var(--muted)]">
                {sourceState.message}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
      <div
        id="settings-imports"
        className="settings-sections"
        hidden={section !== "imports"}
      >
        <div className="inline-feedback">
          <Icon name="file" />
          <span>
            정책서·기획안·PDF를 정리하려면{" "}
            <Link href={`/d/${deptId}/documents`}>문서 어시스턴트</Link>를
            이용하세요.
          </span>
        </div>
        {data.role === "lead" ? (
          <section className="settings-panel panel">
            <div>
              <h2 className="m-0 text-xl">회의 전사 업로드</h2>
              <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                Zoom·Meet 기본 전사 VTT/TXT를 올리면 화자 동의가 확인된 발언만
                저장합니다.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                회의 이름
                <input
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={meetingTitle}
                  onChange={(event) => setMeetingTitle(event.target.value)}
                  placeholder="주간 회의"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                공개 범위
                <select
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={meetingVisibility}
                  onChange={(event) =>
                    setMeetingVisibility(
                      event.target.value as "dept" | "leads_only",
                    )
                  }
                >
                  <option value="dept">부서 전체</option>
                  <option value="leads_only">팀장만</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                전사 파일
                <input
                  accept=".vtt,.txt,text/vtt,text/plain"
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  onChange={(event) =>
                    setMeetingFile(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
              </label>
            </div>
            <button
              className="button button-primary button-small w-fit"
              disabled={meetingState.kind === "pending"}
              onClick={() => void uploadMeeting()}
              type="button"
            >
              {meetingState.kind === "pending" ? "업로드 중…" : "전사 업로드"}
            </button>
            {meetingState.message ? (
              <p role="status" className="m-0 text-sm text-[var(--muted)]">
                {meetingState.message}
              </p>
            ) : null}
          </section>
        ) : null}

        {data.role === "lead" ? (
          <section className="settings-panel panel">
            <div>
              <h2 className="m-0 text-xl">Notion 원칙 문서</h2>
              <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                사수에 공유된 Notion 페이지를 가져옵니다. 문서가 바뀌면 다시
                가져오기로 갱신하세요.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                페이지 URL 또는 ID
                <input
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={notionPageId}
                  onChange={(event) => setNotionPageId(event.target.value)}
                  placeholder="https://www.notion.so/..."
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                표시 이름
                <input
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={notionTitle}
                  onChange={(event) => setNotionTitle(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                공개 범위
                <select
                  className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"
                  value={notionVisibility}
                  onChange={(event) =>
                    setNotionVisibility(
                      event.target.value as "dept" | "leads_only",
                    )
                  }
                >
                  <option value="dept">부서 전체</option>
                  <option value="leads_only">팀장만</option>
                </select>
              </label>
            </div>
            <button
              className="button button-primary button-small w-fit"
              disabled={notionState.kind === "pending"}
              onClick={() => void importNotion()}
              type="button"
            >
              {notionState.kind === "pending"
                ? "가져오는 중…"
                : "원칙 문서 가져오기"}
            </button>
            {notionState.message ? (
              <p role="status" className="m-0 text-sm text-[var(--muted)]">
                {notionState.message}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
