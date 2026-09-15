import Link from "next/link";
import { DemoQuestions } from "@/components/demo-questions";
import { Icon } from "@/components/ui/icon";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Answer = {
  id: string;
  question_key: string;
  question: string;
  answer: string | null;
  generic_answer: string | null;
};
type Citation = { owner_id: string; quote: string };

export default async function DemoAskPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: answers, error: answersError } = await supabase
    .from("answers")
    .select("id, question_key, question, answer, generic_answer")
    .eq("dept_id", dept)
    .eq("status", "done")
    .order("created_at", { ascending: true });
  if (answersError) throw new Error("게스트 답변 조회 실패");
  const rows = (answers ?? []) as Answer[];
  const { data: citations, error: citationsError } = rows.length
    ? await supabase
        .from("citations")
        .select("owner_id, quote")
        .eq("owner_kind", "answer")
        .in(
          "owner_id",
          rows.map((row) => row.id),
        )
    : { data: [] as Citation[], error: null };
  if (citationsError) throw new Error("게스트 답변 근거 조회 실패");
  const citationMap = new Map<string, string[]>();
  for (const citation of (citations ?? []) as Citation[]) {
    if (citation.quote.trim())
      citationMap.set(citation.owner_id, [
        ...(citationMap.get(citation.owner_id) ?? []),
        citation.quote,
      ]);
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
