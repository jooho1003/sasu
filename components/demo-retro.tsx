"use client";
import { useState } from "react";
import { RetroTimeline } from "./retro-timeline";
import { RetroDetail, type RetroDetailData } from "./retro-detail";
export function DemoRetro({ days }: { days: RetroDetailData[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const day = days.find(d=>d.day.id===selected);
  return <div className="grid gap-6"><p className="rounded-xl bg-accent/10 p-4">합성 회고 체험 · 실제 개인 활동은 포함하지 않습니다. 화면 조작과 복사는 브라우저 안에서만 처리합니다.</p>{day ? <><button className="w-fit text-accent underline" onClick={()=>setSelected(null)}>← 회고 목록</button><RetroDetail key={day.day.id} dept={day.day.dept_id} id={day.day.id} initial={day} readOnly /></> : <RetroTimeline dept={days[0]?.day.dept_id ?? ""} userId={days[0]?.day.user_id ?? ""} initialDays={days.map(d=>d.day)} readOnly onSelect={setSelected} />}</div>;
}
