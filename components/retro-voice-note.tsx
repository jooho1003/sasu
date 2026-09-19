"use client";
import { useEffect, useRef, useState } from "react";

export function RetroVoiceNote({endpoint,disabled,onSaved}:{endpoint:string;disabled:boolean;onSaved:()=>Promise<void>}) {
  const [state,setState]=useState<"idle"|"requesting"|"recording"|"saving">("idle"),[message,setMessage]=useState("");
  const recorder=useRef<MediaRecorder|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true),request=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();if(timer.current)clearTimeout(timer.current);const current=recorder.current;if(current){current.onstop=null;if(current.state!=="inactive")current.stop();current.stream.getTracks().forEach(t=>t.stop());}};},[]);
  async function start() {
    if(disabled||state!=="idle")return;
    setMessage("");
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setMessage("이 브라우저에서는 녹음할 수 없습니다. 글로 남겨 주세요.");return;}
    setState("requesting");
    let stream:MediaStream|undefined;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}
      const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error();
      const current=new MediaRecorder(stream,{mimeType:mime});recorder.current=current;
      const parts:Blob[]=[];let size=0,tooLarge=false;
      current.ondataavailable=e=>{size+=e.data.size;if(size>10*1024*1024){tooLarge=true;if(current.state!=="inactive")current.stop();}else if(e.data.size)parts.push(e.data);};
      current.onerror=()=>{if(timer.current)clearTimeout(timer.current);current.onstop=null;current.stream.getTracks().forEach(t=>t.stop());if(mounted.current){setState("idle");setMessage("녹음하지 못했습니다. 다시 시도해 주세요.");}};
      current.onstop=()=>{
        current.stream.getTracks().forEach(t=>t.stop());if(timer.current)clearTimeout(timer.current);
        if(!mounted.current)return;
        if(tooLarge){setState("idle");setMessage("음성은 10메가바이트 이하로 남겨 주세요.");return;}
        setState("saving");const form=new FormData();form.set("audio",new Blob(parts,{type:mime}),mime.includes("mp4")?"note.m4a":"note.webm");
        const controller=new AbortController();request.current=controller;
        void fetch(endpoint,{method:"POST",body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||"음성을 글로 남기지 못했습니다.");await onSaved();if(mounted.current)setMessage("음성을 글로 남겼습니다.");}).catch(error=>{if(mounted.current)setMessage(error instanceof Error?error.message:"음성을 글로 남기지 못했습니다.");}).finally(()=>{if(mounted.current)setState("idle");});
      };
      current.start(1000);setState("recording");timer.current=setTimeout(()=>{if(current.state!=="inactive")current.stop();},60000);
    } catch {stream?.getTracks().forEach(t=>t.stop());if(mounted.current){setState("idle");setMessage("마이크 권한을 확인하거나 글로 남겨 주세요.");}}
  }
  return <div className="grid gap-2"><p className="m-0 text-sm text-muted">음성은 1분까지 녹음합니다. 글로 바꿔 저장하며 원본 음성은 보관하지 않습니다.</p><button className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-40" disabled={state!=="recording"&&(disabled||state!=="idle")} onClick={()=>{if(state==="recording")recorder.current?.stop();else void start();}}>{state==="recording"?"녹음 끝내고 글로 남기기":state==="saving"?"음성을 글로 남기는 중":state==="requesting"?"마이크를 여는 중":"음성으로 한 줄 남기기"}</button>{message?<p className="m-0 text-sm" role="status">{message}</p>:null}</div>;
}
