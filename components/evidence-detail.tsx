"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Evidence = { id: string; title: string; content: string; author: string | null; spoken_at: string | null; kind: string | null; highlight: string | null };

export function EvidenceDetail({ deptId, id, answerId }: { deptId: string; id: string; answerId?: string }) {
  const [state, setState] = useState<{ key: string; data?: Evidence; error?: string } | null>(null);
  const markRef = useRef<HTMLElement>(null);
  const key = JSON.stringify([deptId, id, answerId ?? null]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/d/${encodeURIComponent(deptId)}/evidence/${encodeURIComponent(id)}${answerId ? `?answer=${encodeURIComponent(answerId)}` : ""}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "원문을 불러오지 못했습니다. 다시 시도하세요.");
        if (!controller.signal.aborted) setState({ key, data: body });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, error: "이 원문을 확인할 수 없습니다. 다시 질문해 주세요." });
      });
    return () => controller.abort();
  }, [deptId, id, answerId, key]);
  const current = state?.key === key ? state : null;
  const content = current?.data?.content ?? "";
  const highlight = current?.data?.highlight ?? "";
  const start = highlight ? content.indexOf(highlight) : -1;
  useEffect(() => {
    if (start >= 0) markRef.current?.scrollIntoView({ block: "center" });
  }, [key, current?.data, start]);
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-5 p-5 md:p-8">
      <Link className="w-fit" href={`/d/${deptId}/ask`}>사수에게 묻기로 돌아가기</Link>
      <h1 className="m-0 text-2xl font-bold">원문 확인</h1>
      {!current ? <p role="status">원문을 불러오고 있습니다.</p> : null}
      {current?.error ? <p role="alert">{current.error}</p> : null}
      {current?.data ? <article className="panel grid min-w-0 gap-4 p-5">
        <h2 className="m-0 break-words text-xl">{current.data.title}</h2>
        <p className="m-0 text-sm text-[var(--muted)]">{current.data.author ?? "작성자 미상"}</p>
        <p className="m-0 text-sm text-[var(--muted)]">{start >= 0 ? "표시한 부분이 답변에 쓰인 원문입니다. 개인정보는 가려져 있습니다." : "저장된 원문입니다. 개인정보는 가려져 있습니다."}</p>
        {current.data.kind !== "slack_channel" ? <p className="m-0 text-sm text-[var(--muted)]">긴 자료는 나뉘어 저장되어 이 화면에는 그중 한 부분만 보입니다.</p> : null}
        <blockquote className="m-0 whitespace-pre-wrap break-words border-l-4 border-[var(--accent)] pl-4 leading-8" style={{ overflowWrap: "anywhere" }}>{start >= 0 ? <>{content.slice(0, start)}<mark ref={markRef} style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}>{highlight}</mark>{content.slice(start + highlight.length)}</> : content}</blockquote>
      </article> : null}
    </main>
  );
}
