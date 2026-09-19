export type EvidenceOption={id:string;sourceId?:string;source?:string;content:string;at?:string|null};
export function groupEvidenceOptions(items:readonly EvidenceOption[],query="") {
  const groups=new Map<string,{id:string;source:string;options:EvidenceOption[];latest:number}>(),ids=new Set<string>(),texts=new Set<string>();
  const search=query.trim().toLocaleLowerCase("ko");
  for(const item of items) {
    const source=item.source||"부서 기록",key=item.sourceId||source,textKey=JSON.stringify([key,item.content.trim()]);
    if(item.id ? ids.has(item.id) : texts.has(textKey))continue;
    if(item.id)ids.add(item.id);else texts.add(textKey);
    if(search&&!`${source} ${item.content}`.toLocaleLowerCase("ko").includes(search))continue;
    const group=groups.get(key)||{id:key,source,options:[],latest:0};
    group.latest=Math.max(group.latest,Date.parse(item.at??"")||0);group.options.push(item);groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>b.latest-a.latest);
}
