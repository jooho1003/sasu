import { ReviewDetail } from "@/components/review-detail";
import { requirePageMembership } from "@/lib/supabase/membership";
export default async function Page({params}:{params:Promise<{dept:string;id:string}>}){
  const {dept,id}=await params;const member=await requirePageMembership(dept,`/d/${dept}/reviews/${id}`);
  return <ReviewDetail deptId={member.deptId} id={id}/>;
}
