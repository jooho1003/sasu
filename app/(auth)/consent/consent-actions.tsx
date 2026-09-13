"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CONSENT_LATER_COOKIE } from "@/lib/consent";

type ConsentActionsProps = {
  deptIds: string[];
  laterPath: string;
  nextPath: string;
};

export default function ConsentActions({
  deptIds,
  laterPath,
  nextPath,
}: ConsentActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"consent" | "later" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function consent() {
    setPendingAction("consent");
    setErrorMessage(null);

    try {
      const responses = await Promise.all(
        deptIds.map((deptId) =>
          fetch(`/api/d/${encodeURIComponent(deptId)}/settings/consent`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ consented: true }),
          }),
        ),
      );
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const body = (await failedResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "동의 상태를 저장하지 못했습니다.");
      }

      document.cookie = `${CONSENT_LATER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setPendingAction(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "동의 상태를 저장하지 못했습니다.",
      );
    }
  }

  function later() {
    setPendingAction("later");
    setErrorMessage(null);
    document.cookie = `${CONSENT_LATER_COOKIE}=1; Max-Age=86400; Path=/; SameSite=Lax`;
    router.replace(laterPath);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pendingAction !== null}
          onClick={() => void consent()}
          type="button"
        >
          {pendingAction === "consent" ? "기록하는 중…" : "동의합니다"}
        </button>
        <button
          className="rounded-xl border border-black/15 px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20"
          disabled={pendingAction !== null}
          onClick={later}
          type="button"
        >
          나중에
        </button>
      </div>
      {errorMessage ? (
        <p
          className="m-0 rounded-xl border border-red-700 p-4 text-red-700 dark:border-red-400 dark:text-red-400"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
