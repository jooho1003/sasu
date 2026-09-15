"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export const adminButton =
  "inline-flex items-center justify-center rounded-xl border border-accent/30 px-4 py-2 text-sm font-bold text-accent disabled:opacity-50";
export const adminInput =
  "w-full rounded-xl border border-ink/20 bg-surface px-3 py-2 text-ink";

type PendingInvite = { inviteId: string; email: string };
type ActionProps = {
  label: string;
  endpoint: string;
  kind?: "department" | "invite" | "confirm";
  body?: Record<string, unknown>;
  description?: string;
  pendingInvites?: PendingInvite[];
  pendingScope?: "email" | "department";
  revokeBase?: string;
  onChanged?: () => void | Promise<void>;
};

async function send(endpoint: string, body?: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json()) as {
    message?: string;
    error?: string;
    inviteUrl?: string;
  };
  return { ok: response.ok, ...result };
}

export function AdminAction(props: ActionProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <button
        className={adminButton}
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {props.label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (dialog.current?.querySelector('[aria-busy="true"]'))
            event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/15 bg-surface p-6 text-ink shadow-xl backdrop:bg-black/40"
      >
        {open ? (
          <ActionForm
            {...props}
            titleId={titleId}
            close={() => dialog.current?.close()}
          />
        ) : null}
      </dialog>
    </>
  );
}

function ActionForm({
  label,
  endpoint,
  kind = "confirm",
  body,
  description,
  pendingInvites = [],
  pendingScope = "email",
  revokeBase,
  onChanged,
  titleId,
  close,
}: ActionProps & { titleId: string; close: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [url, setUrl] = useState("");
  const pending =
    pendingScope === "department"
      ? pendingInvites[0]
      : pendingInvites.find(
          (invite) => invite.email.toLowerCase() === value.trim().toLowerCase(),
        );

  async function submit(replace = false) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setErrorCode("");
    try {
      if (replace && pending && revokeBase) {
        const revoked = await send(
          `${revokeBase}/${encodeURIComponent(pending.inviteId)}/revoke`,
        );
        if (!revoked.ok) {
          setMessage(
            revoked.message ??
              "초대를 철회하지 못했습니다. 다시 시도해 주세요.",
          );
          return;
        }
      }
      const result = await send(
        endpoint,
        kind === "department"
          ? { name: value.trim() }
          : kind === "invite"
            ? { email: value.trim() }
            : body,
      );
      if (!result.ok) {
        setMessage(
          result.error === "invite_pending" && pendingScope === "department"
            ? "이 부서에 첫 부서장 초대가 이미 대기 중입니다."
            : (result.message ??
                "요청을 처리하지 못했습니다. 다시 시도해 주세요."),
        );
        setErrorCode(result.error ?? "");
        if (result.error === "invite_pending") {
          router.refresh();
          await onChanged?.();
        }
        return;
      }
      router.refresh();
      if (kind === "invite" && result.inviteUrl) setUrl(result.inviteUrl);
      else close();
      await onChanged?.();
    } catch {
      setMessage(
        "처리 결과를 확인하지 못했습니다. 화면을 새로고침해 상태를 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 id={titleId} className="m-0 text-xl">
        {label}
      </h2>
      {description ? (
        <p className="m-0 text-sm text-muted">{description}</p>
      ) : null}
      {url ? (
        <>
          <p className="m-0 text-sm">
            초대 링크를 전달해 주세요. 이 창을 닫으면 링크를 다시 볼 수
            없습니다.
          </p>
          <label className="grid gap-2 text-sm">
            초대 링크
            <input
              className={adminInput}
              value={url}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            className={adminButton}
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage("초대 링크를 복사했습니다.");
              } catch {
                setMessage(
                  "복사하지 못했습니다. 위 링크를 선택해 직접 복사해 주세요.",
                );
              }
            }}
          >
            복사
          </button>
        </>
      ) : kind !== "confirm" ? (
        <label className="grid gap-2 text-sm font-bold">
          {kind === "department" ? "부서 이름" : "초대할 이메일"}
          <input
            autoComplete={kind === "invite" ? "email" : "off"}
            type={kind === "invite" ? "email" : "text"}
            className={adminInput}
            required
            maxLength={kind === "department" ? 40 : 254}
            value={value}
            disabled={busy}
            onChange={(event) => {
              setValue(event.target.value);
              setErrorCode("");
            }}
          />
        </label>
      ) : null}
      {message ? (
        <p role="status" className="m-0 text-sm">
          {message}
        </p>
      ) : null}
      {errorCode === "invite_pending" && pending && revokeBase ? (
        <button
          className={adminButton}
          type="button"
          disabled={busy}
          onClick={() => void submit(true)}
        >
          기존 초대 철회 후 새 링크
        </button>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className={adminButton}
          type="button"
          disabled={busy}
          onClick={close}
        >
          {url ? "닫기" : "취소"}
        </button>
        {!url ? (
          <button
            className={`${adminButton} bg-accent text-background`}
            type="submit"
            disabled={busy}
          >
            {busy ? "처리 중…" : label}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AdminTabs({
  tabs,
}: {
  tabs: { label: string; content: ReactNode }[];
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  return (
    <div className="grid min-w-0 gap-5">
      <div className="section-picker" role="tablist" aria-label="조회 항목">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            id={`${id}-tab-${index}`}
            role="tab"
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            aria-controls={`${id}-panel-${index}`}
            type="button"
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setSelected(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          role="tabpanel"
          className="min-w-0"
          hidden={selected !== index}
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
