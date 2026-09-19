"use client";
export function RetroCollectorSettings() {
  function download() {
    const config={repos:[],author_emails:[],claude:{enabled:true},codex:{enabled:true},memory:{enabled:true},chrome:{enabled:false,profile:"Default",mode:"denylist",domains:[]},search_terms:false,tz:"Asia/Seoul"};
    const url=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="retro.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel grid gap-4" id="retro-collector"><h2 className="m-0">회고 수집기</h2><p className="m-0">설정 파일에 내 저장소와 커밋 이메일을 입력한 뒤 로컬 수집기를 실행하세요. 만들어진 JSON 파일을 회고 화면에 놓으면 됩니다. Chrome 방문 기록은 기본으로 꺼져 있고 검색어는 별도 동의가 필요합니다.</p><button className="w-fit rounded-xl border px-4 py-2" onClick={download}>수집기 설정 파일 내려받기</button><details><summary className="cursor-pointer">실행·스케줄 안내</summary><p>Node.js 24 환경에서 프로젝트 폴더의 수집기를 실행합니다.</p><code className="block overflow-x-auto">npx tsx scripts/retro-collect.ts --config ./retro.json</code><p>Windows 작업 스케줄러 또는 macOS launchd에서 매일 원하는 시각에 같은 명령을 실행할 수 있습니다. 실행 경로와 설정 파일은 절대 경로로 지정하세요.</p></details><p className="m-0 text-sm text-muted">자동 업로드 토큰은 준비 중입니다. 수집기는 네트워크로 활동을 전송하지 않습니다.</p></section>;
}
