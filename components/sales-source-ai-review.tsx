"use client";

import {useEffect,useRef,useState} from "react";
import type {SalesSourceReviewResult} from "@/lib/sales-source-review";

type Selection={request:string;old_quote:string;new_quote:string;policy:string};
type Task={id:string;status:"queued"|"processing"|"ready"|"refused"|"failed";result:SalesSourceReviewResult|null};
const ROLE_LABEL={request:"고객 요청",old_quote:"기존 견적",new_quote:"변경 견적",policy:"영업 원칙"};

export default function SalesSourceAiReview({deptId,selection,onBusy,onUnavailable}:{
  deptId:string;selection:Selection;onBusy:(busy:boolean)=>void;onUnavailable:()=>void;
}) {
  const [task,setTask]=useState<Task|null>(null);
  const [creating,setCreating]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const controller=useRef<AbortController|null>(null);
  const pollController=useRef<AbortController|null>(null);
  const started=useRef(0);
  const endpoint=`/api/d/${encodeURIComponent(deptId)}/sales-review/ai`;
  const callbacks=useRef({onBusy,onUnavailable});
  useEffect(()=>{callbacks.current={onBusy,onUnavailable};},[onBusy,onUnavailable]);
  const pending=creating || task?.status==="queued" || task?.status==="processing";
  useEffect(()=>{callbacks.current.onBusy(pending);},[pending]);
  useEffect(()=>{
    if(!pending) return;
    const timer=setTimeout(()=>{
      controller.current?.abort();pollController.current?.abort();
      setCreating(false);setTask(null);
      setError("검토가 오래 걸려 확인을 멈췄습니다. 원문을 확인한 뒤 다시 시도해 주세요.");
    },Math.max(0,120_000-(Date.now()-started.current)));
    return ()=>clearTimeout(timer);
  },[pending]);
  useEffect(()=>()=>{controller.current?.abort();callbacks.current.onBusy(false);},[]);

  async function start() {
    controller.current?.abort();
    const current=new AbortController();controller.current=current;
    started.current=Date.now();
    setTask(null);setError(null);setCreating(true);
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",signal:current.signal,
        body:JSON.stringify({request_item_id:selection.request,old_quote_item_id:selection.old_quote,new_quote_item_id:selection.new_quote,policy_item_id:selection.policy,request_id:crypto.randomUUID()})});
      const body=await response.json() as {task_id?:string;error?:string};
      if(!response.ok || !body.task_id) {
        if(response.status===403 || response.status===404) callbacks.current.onUnavailable();
        throw Error(body.error??"사수 검토를 시작하지 못했습니다. 다시 시도해 주세요.");
      }
      if(!current.signal.aborted) setTask({id:body.task_id,status:"queued",result:null});
    } catch(cause) {
      if(!current.signal.aborted) setError(cause instanceof Error?cause.message:"사수 검토를 시작하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if(!current.signal.aborted) setCreating(false);
    }
  }

  const taskId=task?.id??null;
  useEffect(()=>{
    if(!taskId) return;
    const current=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let reading=false;
    pollController.current=current;
    async function poll() {
      if(reading || current.signal.aborted) return;
      reading=true;
      try {
        const response=await fetch(`${endpoint}?task_id=${encodeURIComponent(taskId!)}`,{cache:"no-store",signal:current.signal});
        const body=await response.json() as {task?:Task;error?:string};
        if(!response.ok || !body.task) {
          if(response.status===403 || response.status===404) callbacks.current.onUnavailable();
          throw Error(body.error??"검토를 확인하지 못했습니다. 다시 시도해 주세요.");
        }
        if(current.signal.aborted) return;
        if(body.task.status==="queued" || body.task.status==="processing") {
          if(Date.now()-started.current>=120_000) throw Error("검토가 오래 걸려 확인을 멈췄습니다. 원문을 확인한 뒤 다시 시도해 주세요.");
          setTask(body.task);timer=setTimeout(()=>void poll(),1500);
        } else setTask(body.task);
      } catch(cause) {
        if(!current.signal.aborted) {setTask(null);setError(cause instanceof Error?cause.message:"검토를 확인하지 못했습니다. 다시 시도해 주세요.");}
      } finally {reading=false;}
    }
    void poll();
    const recheck=()=>{if(timer)clearTimeout(timer);void poll();};
    window.addEventListener("focus",recheck);
    return ()=>{current.abort();if(pollController.current===current)pollController.current=null;if(timer)clearTimeout(timer);window.removeEventListener("focus",recheck);};
  },[taskId,endpoint]);

  return <section className="grid gap-3 rounded-xl border border-black/10 bg-white p-4" aria-label="사수 원문 근거 검토">
    <div><h3 className="m-0 text-lg">사수 원문 근거 검토</h3>
      <p className="m-0 text-sm leading-6 text-[var(--muted)]">사수가 확인할 문단을 고르고 질문과 함께 보여 줍니다. 문단의 관련성과 조건의 의미는 원문에서 확인해 주세요.</p></div>
    <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50" type="button" disabled={pending} onClick={()=>void start()}>{pending?"사수 검토 중…":task||error?"사수 검토 다시 하기":"사수로 확인할 근거 찾기"}</button>
    {pending?<p className="m-0 text-sm" role="status">선택한 자료에서 확인할 문단을 찾고 있습니다. 최대 2분 동안 진행을 확인합니다.</p>:null}
    {error?<p className="m-0 rounded-lg bg-[var(--urgent)]/10 p-3" role="alert">{error}</p>:null}
    {task?.status==="failed"?<p className="m-0 text-sm" role="alert">사수 검토를 완료하지 못했습니다. 원문을 확인한 뒤 다시 시도해 주세요.</p>:null}
    {task?.status==="refused"?<p className="m-0 text-sm" role="status">사수가 확인할 근거를 선택하지 못했습니다. 원문을 직접 확인하거나 자료를 다시 선택해 주세요.</p>:null}
    {task?.status==="ready" && task.result?.topics.map(topic=><article className="grid gap-3 rounded-xl border border-black/10 p-4" key={topic.id} aria-label={`사수 ${topic.label} 확인`}>
      <h4 className="m-0 text-base">{topic.label}</h4><p className="m-0 font-bold">{topic.question}</p>
      {topic.evidence.map(entry=><div key={entry.source_id} className="rounded-lg bg-black/5 p-3">
        <p className="m-0 text-sm font-bold">{ROLE_LABEL[entry.role]} · {entry.title}</p>
        <blockquote className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{entry.quote}</blockquote>
        <a className="mt-2 inline-block text-sm font-bold text-[var(--accent)] underline" href={entry.href}>원문에서 확인</a>
      </div>)}
    </article>)}
  </section>;
}
