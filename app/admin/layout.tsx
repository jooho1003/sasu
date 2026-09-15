import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/shell";
import { adminContext, adminOverview } from "./_data";

export const metadata: Metadata = {
  title: "조직 관리 | 사수",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await adminContext();
  if (context.status !== "ok")
    return (
      <main className="center-shell">
        <h1 className="text-2xl">조직 관리자 권한이 없습니다</h1>
        <p>조직 관리자에게 계정의 권한을 확인해 주세요.</p>
        <form method="post" action="/auth/signout">
          <button
            className="rounded-xl border border-accent px-4 py-2"
            type="submit"
          >
            로그아웃
          </button>
        </form>
        <Link href="/demo">데모 보기</Link>
      </main>
    );
  const overview = await adminOverview();
  return (
    <AdminShell orgName={overview?.org_name ?? "조직 관리"}>
      {children}
    </AdminShell>
  );
}
