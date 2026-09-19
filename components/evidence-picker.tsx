"use client";
import { useId, useMemo, useState } from "react";
import { groupEvidenceOptions, type EvidenceOption } from "@/lib/evidence-options";

export function EvidencePicker({options,value,onChange,optional=false}:{options:readonly EvidenceOption[];value:string;onChange:(id:string)=>void;optional?:boolean}) {
  const name=useId(),[query,setQuery]=useState("");
  const groups=useMemo(()=>groupEvidenceOptions(options,query),[options,query]);
  const selected=options.find(o=>o.id===value);
  return <fieldset className="grid min-w-0 gap-3 rounded-xl border border-black/10 p-4">
    <legend className="px-1 font-bold">판단 근거 선택{optional?" (선택)":""}</legend>
    <label className="grid gap-2 text-sm">출처·본문 검색<input className="rounded-lg border bg-surface p-2" value={query} onChange={e=>setQuery(e.target.value)} placeholder="문서 이름이나 기억나는 말" /></label>
    {selected?<p className="m-0 rounded-lg bg-accent/10 p-2 text-sm" aria-live="polite">선택한 근거: {selected.source??"부서 기록"} · {selected.content.slice(0,80)}{optional?<button type="button" className="ml-2 underline" onClick={()=>onChange("")}>선택 지우기</button>:null}</p>:<p className="m-0 text-sm text-muted">{optional?"근거 없이도 기록할 수 있습니다.":"아래에서 근거를 하나 고르세요."}</p>}
    {groups.map((group,index)=><details key={`${group.id}:${query}`} open={query?true:index===0} className="rounded-lg border border-black/10 p-3">
      <summary className="cursor-pointer font-medium">{group.source} · {group.options.length}개</summary>
      <div className="mt-3 grid max-h-72 gap-3 overflow-y-auto">{group.options.map(option=><label key={option.id} className="flex cursor-pointer items-start gap-3 text-[15px]"><input className="mt-1 size-4 shrink-0" type="radio" name={name} value={option.id} checked={value===option.id} onChange={()=>onChange(option.id)} /><span className="min-w-0 whitespace-pre-wrap break-words">{option.content}</span></label>)}</div>
    </details>)}
    {!groups.length?<p className="m-0 text-sm">찾는 근거가 없습니다. 다른 말로 검색해 보세요.</p>:null}
  </fieldset>;
}
