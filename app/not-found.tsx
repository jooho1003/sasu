import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-16 sm:px-8">
      <section className="grid gap-5 rounded-3xl bg-[var(--surface)] p-8 text-left shadow-sm">
        <p className="m-0 text-sm font-bold text-[var(--urgent)]">404</p>
        <h1 className="m-0 text-3xl">요청한 기록을 찾을 수 없습니다</h1>
        <p className="m-0 leading-7 text-[var(--muted)]">주소가 바뀌었거나 현재 권한으로 볼 수 없는 기록입니다.</p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-xl bg-[var(--accent)] px-5 py-3 text-white" href="/">처음으로</Link>
          <Link className="rounded-xl border border-black/15 px-5 py-3" href="/demo" prefetch={false}>게스트 데모</Link>
        </div>
      </section>
    </main>
  );
}
