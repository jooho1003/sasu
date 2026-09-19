import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitePreview } from "@/lib/contracts";
import { orgAdminReadEnabled, orgAdminWritesEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InviteAcceptance } from "@/components/admin/invite-acceptance";

export const metadata: Metadata = { title: "초대 수락 | 사수", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!orgAdminReadEnabled()) notFound();
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const [preview, auth] = await Promise.all([supabase.rpc("invite_preview", { p_token: token }), supabase.auth.getUser()]);
  const parsed = InvitePreview.safeParse(preview.data);
  const next = `/invite/${encodeURIComponent(token)}`;
  const user = auth.error ? null : auth.data.user;
  return <main className="mx-auto grid min-h-screen w-full max-w-lg content-center gap-5 px-5 py-12">
    <Link href="/">사수</Link><h1 className="m-0 text-3xl">부서 초대</h1>
    {preview.error ? <p role="status">초대 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p> : !parsed.success ? <p>초대 링크를 찾을 수 없습니다</p> : <>
      <div className="rounded-2xl border border-ink/10 bg-surface p-5"><p className="mt-0 text-sm text-muted">{parsed.data.org_name}</p><h2 className="text-xl">{parsed.data.dept_name} · {parsed.data.role === "lead" ? "팀장" : "멤버"}</h2><p className="mb-0 break-all text-sm">초대받은 이메일: {parsed.data.email_masked}</p></div>
      {parsed.data.status !== "valid" ? <><p>{({ expired: "초대 유효기간이 지났습니다.", revoked: "거둔 초대입니다.", accepted: "이미 수락한 초대입니다." })[parsed.data.status]}</p><p>관리자나 팀장에게 새 초대를 요청하세요.</p></> : !orgAdminWritesEnabled() ? <p>지금은 초대 정보를 읽기만 할 수 있습니다. 관리자에게 문의해 주세요.</p> : !user ? <Link href={`/login?next=${encodeURIComponent(next)}`}>이 이메일로 로그인</Link> : <InviteAcceptance token={token} initialName={(user.email?.split("@")[0] ?? "").slice(0, 40)} />}
    </>}
  </main>;
}
