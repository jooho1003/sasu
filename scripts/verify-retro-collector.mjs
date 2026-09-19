// Synthetic local files only. Never opens the user's Chrome or AI history.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
const root=await mkdtemp(join(tmpdir(),"sasu-retro-fixture-"));
const profile=join(root,"Google","Chrome","User Data","Default");await mkdir(profile,{recursive:true});
const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const visitTime=(Date.parse(`${date}T01:00:00Z`)+11644473600000)*1000;
const db=new DatabaseSync(join(profile,"History"));
db.exec("create table urls(id integer,url text,title text);create table visits(url integer,visit_time integer);create table keyword_search_terms(url_id integer,term text);");
for(const [id,url,title] of [[1,"https://docs.example.com/guide?token=never-export","합성 검증 안내"],[2,"https://bank.example.com/","금융 개인 제목"],[3,"https://google.com/search?q=never-export","개인 검색어 - Google"]]){
  db.prepare("insert into urls values(?,?,?)").run(id,url,title);db.prepare("insert into visits values(?,?)").run(id,visitTime);
}
db.prepare("insert into keyword_search_terms values(3,'합성 검색어')").run();db.close();
const config=join(root,"config.json"),output=join(root,"retro.json");
await writeFile(config,JSON.stringify({repos:[],author_emails:[],claude:{enabled:false},codex:{enabled:false},memory:{enabled:false},chrome:{enabled:false,profile:"Default",mode:"denylist",domains:[]},search_terms:false,tz:"Asia/Seoul"}));
const collect=(...args)=>execFileSync(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/retro-collect.ts","--date",date,"--config",config,...args],{encoding:"utf8",windowsHide:true,env:{...process.env,LOCALAPPDATA:root}});
const before=(await readdir(tmpdir())).filter(p=>p.startsWith("sasu-retro-"));
try {
  const dry=collect("--dry-run","--out",output);assert.match(dry,/activities: 0/);await assert.rejects(readFile(output));
  const run=collect("--chrome","--out",output);assert.match(run,/activities: 1/);assert.ok(!run.includes("합성 검증 안내"));
  const bundle=JSON.parse(await readFile(output,"utf8"));assert.equal(bundle.activities[0].ref,"https://docs.example.com/guide");assert.ok(!JSON.stringify(bundle).includes("never-export"));assert.ok(!JSON.stringify(bundle).includes("개인 검색어"));
  await unlink(output);collect("--chrome","--search-terms","--out",output);const search=JSON.parse(await readFile(output,"utf8"));assert.equal(search.activities.filter(a=>a.kind==="web_search").length,1);
  const fallback=JSON.parse(execFileSync(process.platform==="win32"?"py":"python3",[...(process.platform==="win32"?["-3"]:[]),"scripts/retro-chrome-dump.py",join(profile,"History"),String(visitTime-1000000),String(visitTime+1000000)],{encoding:"utf8",windowsHide:true}));assert.equal(fallback.visits.length,3);assert.deepEqual(fallback.searches,[]);
  assert.deepEqual((await readdir(tmpdir())).filter(p=>p.startsWith("sasu-retro-")).sort(),before.sort());
  console.log(JSON.stringify({passed:7,failed:0,source:"synthetic SQLite",defaultChromeOff:true,searchOptIn:true,temporaryCopiesRemoved:true,pythonFallback:true}));
} finally {
  // Delete only known fixture files and empty ancestors; never recurse over paths.
  for(const path of [output,config,join(profile,"History")]) { const rel=relative(root,resolve(path));if(rel.startsWith("..")||isAbsolute(rel))throw new Error("cleanup_outside_fixture");await unlink(path).catch(()=>undefined);}
  for(const path of [profile,join(root,"Google","Chrome","User Data"),join(root,"Google","Chrome"),join(root,"Google"),root]) await rmdir(path);
}
