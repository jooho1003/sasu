"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import SalesSourceAiReview from "@/components/sales-source-ai-review";

type Status="queued"|"processing"|"ready"|"refused"|"failed";
type Row={id:string;created_at:string;status:Status};
type Cursor={created_at:string;id:string};
const labels:Record<Status,string>={queued:"검토 대기",processing:"검토 중",ready:"근거 준비됨",refused:"근거를 찾지 못함",failed:"검토 실패"};
const dateFormat=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"});
const ignoreBusy=()=>{};

export default function SalesSourceReviewHistory({deptId}:{deptId:string}) {
  const [rows,setRows]=useState<Row[]>([]);
  const [cursor,setCursor]=useState<Cursor|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [active,setActive]=useState<{id:string;key:number}|null>(null);
  const request=useRef<AbortController|null>(null);
  const epoch=useRef(0);
  const detailRegion=useRef<HTMLElement|null>(null);
  const endpoint=`/api/d/${encodeURIComponent(deptId)}/sales-review/history`;

  const load=useCallback(async(after:Cursor|null=null)=>{
    request.current?.abort();
    const current=new AbortController();request.current=current;
    setActive(null);setLoading(true);setError(null);
    if(!after) {setRows([]);setCursor(null);}
    const timer=setTimeout(()=>{
      if(request.current!==current || current.signal.aborted)return;
      current.abort();setRows([]);setCursor(null);setLoading(false);
      setError("이력을 불러오는 데 오래 걸려 멈췄습니다. 다시 불러와 주세요.");
    },30_000);
    const query=after?"?"+new URLSearchParams({before_created_at:after.created_at,before_id:after.id}):"";
    try {
      const res=await fetch(endpoint+query,{cache:"no-store",signal:current.signal});
      const body=await res.json() as {tasks?:Row[];next_cursor?:Cursor|null;error?:string};
      if(current.signal.aborted || request.current!==current)return;
      if(!res.ok || !Array.isArray(body.tasks))throw Error(body.error??"검토 이력을 불러오지 못했습니다. 다시 시도해 주세요.");
      const tasks=body.tasks;
      setRows(old=>after?[...old,...tasks.filter(row=>!old.some(existing=>existing.id===row.id))]:tasks);
      setCursor(body.next_cursor??null);
    } catch(cause) {
      if(!current.signal.aborted && request.current===current) {
        setRows([]);setCursor(null);
        setError(cause instanceof Error?cause.message:"검토 이력을 불러오지 못했습니다. 다시 시도해 주세요.");
      }
    } finally {
      clearTimeout(timer);
      if(request.current===current && !current.signal.aborted)setLoading(false);
    }
  },[endpoint]);

  useEffect(()=>{
    const initial=setTimeout(()=>void load(),0);
    const refresh=()=>{setNotice(null);void load();};
    window.addEventListener("focus",refresh);
    return ()=>{clearTimeout(initial);request.current?.abort();window.removeEventListener("focus",refresh);};
  },[load]);

  const unavailable=useCallback(()=>{
    setNotice("현재 확인할 수 없는 검토입니다. 볼 수 있는 이력을 다시 불러왔습니다.");
    void load();
  },[load]);

  useEffect(()=>{
    if(!active) return;
    detailRegion.current?.focus({preventScroll:true});
    detailRegion.current?.scrollIntoView({block:"start"});
  },[active]);

  return <section className="panel grid gap-4 p-6" aria-label="본인 원문 검토 이력">
    <div><h2 className="m-0 text-2xl">내 원문 검토 이력</h2>
      <p className="m-0 text-sm leading-6 text-[var(--muted)]">현재 볼 수 있는 본인의 검토를 최신순으로 보여 줍니다. 다시 열면 현재 원문에서 근거를 확인합니다.</p></div>
    <button type="button" className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 font-bold text-[var(--accent)]" onClick={()=>{setNotice(null);void load();}}>이력 새로고침</button>
    {loading?<p className="m-0" role="status">검토 이력을 불러오고 있습니다.</p>:null}
    {notice?<p className="m-0" role="status">{notice}</p>:null}
    {error?<p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-3" role="alert">{error}</p>:null}
    {!loading && !error && rows.length===0?<p className="m-0">현재 볼 수 있는 검토 이력이 없습니다. 원문을 선택해 사수 검토를 요청해 주세요.</p>:null}
    <ul className="m-0 grid list-none gap-2 p-0">
      {rows.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 p-3">
        <div><time dateTime={row.created_at} className="block text-sm">{dateFormat.format(new Date(row.created_at))} (한국 시간)</time><span className="text-sm font-bold">{labels[row.status]}</span></div>
        <button type="button" disabled={loading} className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50" onClick={()=>setActive({id:row.id,key:++epoch.current})}>다시 열기</button>
      </li>)}
    </ul>
    {cursor?<button type="button" disabled={loading} className="w-fit rounded-lg border border-black/15 px-4 py-2 font-bold disabled:opacity-50" onClick={()=>void load(cursor)}>이력 더 보기</button>:null}
    {active?<section ref={detailRegion} tabIndex={-1} className="grid gap-3" aria-label="이력에서 연 검토">
      <button type="button" className="w-fit underline" onClick={()=>setActive(null)}>검토 닫기</button>
      <SalesSourceAiReview key={active.key} deptId={deptId} initialTaskId={active.id} onBusy={ignoreBusy} onUnavailable={unavailable}/>
    </section>:null}
  </section>;
}
