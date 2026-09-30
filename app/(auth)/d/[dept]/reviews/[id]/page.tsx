import { ReviewDetail } from "@/components/review-detail";
import { requirePageMembership } from "@/lib/supabase/membership";
export default async function Page({params,searchParams}:{params:Promise<{dept:string;id:string}>;searchParams:Promise<{section?:string|string[]}>}){
  const {dept,id}=await params;const member=await requirePageMembership(dept,`/d/${dept}/reviews/${id}`);
  const raw=(await searchParams).section;
  const section=typeof raw==="string" && /^(0|[1-9]\d{0,4})$/u.test(raw) ? Number(raw) : null;
  return <ReviewDetail deptId={member.deptId} id={id} citationSection={section}/>;
}
