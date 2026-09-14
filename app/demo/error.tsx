"use client";

import Link from "next/link";

export default function DemoError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-16 sm:px-8">
      <section className="grid gap-5 rounded-3xl bg-[var(--surface)] p-8 text-left shadow-sm">
        <p className="m-0 text-sm font-bold text-[var(--urgent)]">게스트 데모</p>
        <h1 className="m-0 text-3xl">합성 데이터를 불러오지 못했습니다</h1>
        <p className="m-0 leading-7 text-[var(--muted)]">새 데이터가 저장되거나 외부 AI가 호출되지는 않았습니다.</p>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white" onClick={reset} type="button">
            다시 시도
          </button>
          <Link className="rounded-xl border border-black/15 px-5 py-3" href="/demo">부서 다시 선택</Link>
        </div>
      </section>
    </main>
  );
}
