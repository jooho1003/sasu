import Link from "next/link";
import { DemoQuestions } from "@/components/demo-questions";
import { Icon } from "@/components/ui/icon";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Answer = {
  id: string;
  dept_id: string;
  question_key: string;
  question: string;
  answer: string | null;
  generic_answer: string | null;
  status: "done" | "refused";
  refused: boolean;
};
type Citation = { owner_id: string; quote: string };
type DemoDepartment = { id: string; name: string };

export default async function DemoAskPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { dept } = await params;
  const { q } = await searchParams;
  const supabase = createPublicSupabaseClient();
  const [{ data: answers, error: answersError }, { data: departments }] =
    await Promise.all([
      supabase
        .from("answers")
        .select("id, dept_id, question_key, question, answer, generic_answer, status, refused")
        .eq("dept_id", dept)
        .in("status", ["done", "refused"])
        .order("created_at", { ascending: true }),
      supabase.rpc("demo_departments"),
    ]);
  if (answersError) throw new Error("게스트 답변 조회 실패");
  const rows = (answers ?? []) as Answer[];
  const departmentRows = (departments ?? []) as DemoDepartment[];
  const otherDepartmentIds = departmentRows
    .filter((department) => department.id !== dept)
    .map((department) => department.id);
  const [citationResult, comparisonResult] = await Promise.all([
    rows.length
      ? supabase
          .from("citations")
          .select("owner_id, quote")
          .eq("owner_kind", "answer")
          .in(
            "owner_id",
            rows.map((row) => row.id),
          )
      : Promise.resolve({ data: [] as Citation[], error: null }),
    otherDepartmentIds.length
      ? supabase
          .from("answers")
          .select("dept_id, question_key")
          .in("dept_id", otherDepartmentIds)
          .in("status", ["done", "refused"])
      : Promise.resolve({ data: [] as Pick<Answer, "dept_id" | "question_key">[], error: null }),
  ]);
  const { data: citations, error: citationsError } = citationResult;
  if (citationsError) throw new Error("게스트 답변 근거 조회 실패");
  if (comparisonResult.error) throw new Error("게스트 비교 질문 조회 실패");
  const citationMap = new Map<string, string[]>();
  for (const citation of (citations ?? []) as Citation[]) {
    if (citation.quote.trim())
      citationMap.set(citation.owner_id, [
        ...(citationMap.get(citation.owner_id) ?? []),
        citation.quote,
      ]);
  }
  const departmentNameMap = new Map(
    departmentRows.map((department) => [department.id, department.name]),
  );
  const comparisonByQuestionKey: Record<
    string,
    { href: string; departmentName: string }
  > = {};
  for (const answer of comparisonResult.data ?? []) {
    if (comparisonByQuestionKey[answer.question_key]) continue;
    const departmentName = departmentNameMap.get(answer.dept_id);
    if (!departmentName) continue;
    comparisonByQuestionKey[answer.question_key] = {
      href: `/demo/d/${answer.dept_id}/ask?q=${encodeURIComponent(answer.question_key)}`,
      departmentName,
    };
  }
  return (
    <main className="workspace-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">팀의 맥락을 아는 AI</p>
          <h1>사수에게 묻기</h1>
          <p>
            궁금한 질문을 골라보세요. 답변 옆에서 원문 근거를 확인할 수
            있습니다.
          </p>
        </div>
        <span className="badge badge-neutral">
          <Icon name="lock" size={12} />이 부서의 기록만 참고
        </span>
      </header>
      <DemoQuestions
        key={`${dept}:${q ?? ""}`}
        initialQuestionKey={q}
        comparisonByQuestionKey={comparisonByQuestionKey}
        answers={rows.map((row) => ({
          ...row,
          quotes: citationMap.get(row.id) ?? [],
        }))}
      />
      <section className="ask-invite">
        <div>
          <h2>우리 팀의 이야기도 물어보세요</h2>
          <p>
            데모에서는 준비된 질문을 살펴볼 수 있어요. 자유 질문은 로그인 후
            이용하세요.
          </p>
        </div>
        <Link className="button button-secondary button-small" href="/login">
          우리 팀으로 로그인 <Icon name="arrow" size={14} />
        </Link>
      </section>
    </main>
  );
}
