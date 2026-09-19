import type { Metadata } from "next";
import { HiringDemo } from "@/components/hiring-demo";
import { hiringMissions } from "@/fixtures/hiring/missions";

export const metadata: Metadata = { title: "부서별 신입 미션 데모 | 사수", robots: { index: false, follow: false } };
// ADR-059: static synthetic inputs only; no auth, database, or submission API.
export default function HiringDemoPage() { return <HiringDemo missions={hiringMissions} />; }
