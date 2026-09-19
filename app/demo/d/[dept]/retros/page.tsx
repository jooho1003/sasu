import { notFound, redirect } from "next/navigation";
export default function DemoDepartmentRetros() {
  if (process.env.SASU_RETRO_ENABLED !== "true") notFound();
  redirect("/demo/retros");
}
