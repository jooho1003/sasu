"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CardStatus = "open" | "decided" | "deferred" | "rejected" | "needs_review";
type TargetStatus = "decided" | "deferred" | "rejected" | "open";

type CardActionsProps = {
  cardId: string;
  deptId: string;
  status: CardStatus;
  outcome: string;
  canAct: boolean;
  isLead: boolean;
};

export default function CardActions({
  cardId,
  deptId,
  status,
  outcome,
  canAct,
  isLead,
}: CardActionsProps) {
  const router = useRouter();
  const [rationale, setRationale] = useState("");
  const [pending, setPending] = useState<TargetStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (targetStatus: TargetStatus) => {
    if (targetStatus === "decided" && !rationale.trim()) {
      setError("결정 사유를 입력해주세요.");
      return;
    }

    setPending(targetStatus);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          outcome,
          rationale,
        }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "카드를 처리하지 못했습니다.");
      }

      setMessage(body.message ?? "카드 상태를 반영했습니다.");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "카드를 처리하지 못했습니다.",
      );
    } finally {
      setPending(null);
    }
  };

  if (!canAct) {
    return (
      <p className="m-0 rounded-xl bg-black/5 p-4 text-sm text-[var(--muted)]">
        이 카드는 담당자 또는 팀장만 처리할 수 있습니다.
      </p>
    );
  }

  if (status === "decided") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-sm font-bold text-[var(--accent)]">
          결정 완료
        </span>
        <Link href={`/d/${deptId}/ledger`}>결정 기록에서 보기</Link>
      </div>
    );
  }

  if (!isLead && status !== "open") {
    return (
      <p className="m-0 rounded-xl bg-black/5 p-4 text-sm text-[var(--muted)]">
        {status === "deferred"
          ? "보류된 카드입니다. 팀장이 다시 열 수 있습니다."
          : status === "rejected"
            ? "반려된 카드입니다. 팀장이 다시 열 수 있습니다."
            : "근거 확인이 필요해 팀장 검토를 기다리고 있습니다."}
      </p>
    );
  }

  const canReopen = isLead && ["deferred", "rejected", "needs_review"].includes(status);
  const canRejectReview = isLead && status === "needs_review";

  return (
    <div className="grid gap-4">
      {status === "open" ? (
        <label className="grid gap-2 font-bold">
          결정 사유
          <textarea
            className="min-h-28 rounded-xl border border-black/15 bg-[var(--surface)] p-3 font-normal text-[var(--ink)]"
            maxLength={1000}
            onChange={(event) => setRationale(event.target.value)}
            placeholder="왜 이 결정을 내렸는지 남겨주세요."
            value={rationale}
          />
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <>
            <button
              className="rounded-lg bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void submit("decided")}
              type="button"
            >
              {pending === "decided" ? "기록 중…" : "결정"}
            </button>
            <button
              className="rounded-lg border border-black/15 px-5 py-3 font-bold disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void submit("deferred")}
              type="button"
            >
              보류
            </button>
            <button
              className="rounded-lg border border-black/15 px-5 py-3 font-bold text-[var(--muted)] disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void submit("rejected")}
              type="button"
            >
              반려
            </button>
          </>
        ) : null}

        {canReopen ? (
          <button
            className="rounded-lg bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-50"
            disabled={pending !== null}
            onClick={() => void submit("open")}
            type="button"
          >
            다시 열기
          </button>
        ) : null}

        {canRejectReview ? (
          <button
            className="rounded-lg border border-black/15 px-5 py-3 font-bold text-[var(--muted)] disabled:opacity-50"
            disabled={pending !== null}
            onClick={() => void submit("rejected")}
            type="button"
          >
            반려
          </button>
        ) : null}
      </div>

      {message ? (
        <p aria-live="polite" className="m-0 text-sm font-bold text-[var(--accent)]">
          {message} <Link href={`/d/${deptId}/ledger`}>결정 기록으로</Link>
        </p>
      ) : null}
      {error ? (
        <p aria-live="assertive" className="m-0 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
