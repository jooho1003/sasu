import { RetentionConsole } from "@/components/retention-console";
import { requirePageMembership } from "@/lib/supabase/membership";
export default async function Page({params}:{params:Promise<{dept:string}>}){
  const {dept}=await params;const member=await requirePageMembership(dept,`/d/${dept}/retention`);
  if(member.role!=="lead")return <main className="workspace-page"><h1>기록 보관</h1><p>기록 보관은 팀장이 관리합니다.</p></main>;
  return <RetentionConsole deptId={member.deptId}/>;
}
