import { redirect } from "next/navigation";

import ConsentActions from "./consent-actions";

import { CONSENT_SECTIONS } from "@/lib/consent";
import { sanitizeInternalPath } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ConsentPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/login");
  }

  const membershipsResult = await supabase
    .from("members")
    .select("dept_id")
    .eq("user_id", user.id)
    .order("dept_id", { ascending: true });
  if (membershipsResult.error) {
    throw new Error("부서 소속을 확인하지 못했습니다.", {
      cause: membershipsResult.error,
    });
  }

  const deptIds = (membershipsResult.data ?? []).map(
    (membership) => membership.dept_id,
  );
  const firstDeptId = deptIds[0];
  if (!firstDeptId) {
    redirect("/no-membership");
  }

  const params = await searchParams;
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const fallbackPath = `/d/${firstDeptId}`;
  const nextPath = sanitizeInternalPath(requestedNext, fallbackPath);
  const requestedDeptId = nextPath.match(/^\/d\/([^/?#]+)/u)?.[1];
  const laterDeptId =
    requestedDeptId && deptIds.includes(requestedDeptId)
      ? requestedDeptId
      : firstDeptId;

  return (
    <main className="mx-auto w-full max-w-3xl place-content-start gap-8 px-5 py-10 text-left sm:px-8">
      <header className="grid gap-3">
        <p className="m-0 text-sm font-bold text-[var(--accent)]">
          S0 · 수집·이용 동의
        </p>
        <h1 className="text-3xl! sm:text-4xl!">{CONSENT_SECTIONS.title}</h1>
        <p className="m-0 leading-7 text-[var(--muted)]">
          {CONSENT_SECTIONS.introduction}
        </p>
      </header>

      <ol className="m-0 grid list-none gap-4 p-0">
        {CONSENT_SECTIONS.items.map((item, index) => (
          <li
            className="grid gap-3 rounded-2xl bg-[var(--surface)] p-6 shadow-sm [counter-increment:consent]"
            key={item.title}
          >
            <h2 className="m-0 text-xl">
              <span aria-hidden="true" className="mr-2 text-[var(--muted)]">
                {index + 1}.
              </span>
              {item.title}
            </h2>
            {item.body ? <p className="m-0 leading-7">{item.body}</p> : null}
            {item.details.length > 0 ? (
              <ul className="m-0 grid gap-2 pl-5 leading-7">
                {item.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      <ConsentActions
        deptIds={deptIds}
        laterPath={`/d/${laterDeptId}`}
        nextPath={nextPath}
      />
    </main>
  );
}
