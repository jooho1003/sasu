"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

// 부서 셸(좌측 메뉴)을 유지한 채 이 화면만 다시 시도한다. 상위 app/demo/error.tsx는 셸 자체가 실패했을 때만 쓰인다.
export default function DemoDepartmentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { dept } = useParams<{ dept: string }>();
  return (
    <main className="workspace-page">
      <section className="grid gap-5 rounded-3xl bg-[var(--surface)] p-8 text-left shadow-sm">
        <p className="m-0 text-sm font-bold text-[var(--urgent)]">게스트 데모</p>
        <h1 className="m-0 text-3xl">이 화면의 합성 데이터를 불러오지 못했습니다</h1>
        <p className="m-0 leading-7 text-[var(--muted)]">
          새 데이터가 저장되거나 외부 AI가 호출되지는 않았습니다. 좌측 메뉴의 다른 기능은 그대로 사용할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="button button-primary" onClick={reset} type="button">
            다시 시도
          </button>
          <Link className="button button-secondary" href={`/demo/d/${dept}`}>
            이 부서 대시보드로
          </Link>
        </div>
      </section>
    </main>
  );
}
