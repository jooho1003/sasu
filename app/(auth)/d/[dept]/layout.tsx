import { requireMembership } from "@/lib/supabase/membership";

type DepartmentLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ dept: string }>;
}>;

export default async function DepartmentLayout({
  children,
  params,
}: DepartmentLayoutProps) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  return (
    <div
      data-membership-dept-id={membership.deptId}
      data-membership-role={membership.role}
    >
      {children}
    </div>
  );
}
