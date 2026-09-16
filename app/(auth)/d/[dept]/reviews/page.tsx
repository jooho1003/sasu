import { ReviewedMaterials } from "@/components/reviewed-materials";
import { requirePageMembership } from "@/lib/supabase/membership";
export default async function Page({params}:{params:Promise<{dept:string}>}) {
  const {dept}=await params;const member=await requirePageMembership(dept,`/d/${dept}/reviews`);
  return <ReviewedMaterials deptId={member.deptId} role={member.role}/>;
}
