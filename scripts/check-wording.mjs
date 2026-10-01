import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { tsImport } from "tsx/esm/api";
import { execFileSync } from "node:child_process";
const {extractStrings,checkStrings}=await tsImport("../lib/wording-check.ts",import.meta.url);
const dictionary=JSON.parse(readFileSync(new URL("./wording/terms.json",import.meta.url),"utf8"));
const args=process.argv.slice(2),report=args.includes("--report"),textIndex=args.indexOf("--text");
const refIndex=args.indexOf("--ref"),ref=refIndex>=0?args[refIndex+1]:null;
if(refIndex>=0&&(!ref||!/^(?:HEAD|[a-f0-9]{7,40})$/.test(ref)))throw new Error("commit_hash_required");
const findings=[],files=new Set();
function walk(path,filter=()=>true) {
  if(!existsSync(path))return;
  if(statSync(path).isDirectory())for(const entry of readdirSync(path))walk(join(path,entry),filter);
  else if(/\.(tsx|ts)$/.test(path)&&!path.includes('.test.')&&filter(path))files.add(path);
}
function inspect(file,items) {
  const styleExempt=["components/recruitment-trailer.tsx","components/trailer-office.tsx"].includes(file);
  for(const finding of checkStrings(items,dictionary.terms,{file,styleExempt,allowEnglish:dictionary.allow_english}))findings.push({file,...finding});
}
if(textIndex>=0)inspect("<text>",[{line:1,text:args[textIndex+1]??"",context:"literal"}]);
else {
  const selected=args.filter((a,i)=>!a.startsWith("--")&&!(refIndex>=0&&i===refIndex+1));
  if(selected.length)for(const path of selected)walk(path);
  else {
    walk("app",p=>p.endsWith('.tsx')||(/[\\/]api[\\/]/.test(p)&&p.endsWith('route.ts')));
    walk("components");walk("lib/slack");walk("desktop/src/renderer",p=>p.endsWith('.tsx'));
    for(const file of ["consent","demo-access","org-admin","trailer-invite","trailer-assessment","labels"])files.add("lib/"+file+".ts");
  }
  const tracked=ref?new Set(execFileSync("git",["ls-tree","-r","--name-only",ref],{encoding:"utf8"}).trim().split("\n")):null;
  if(ref)console.log(`baseline commit: ${ref}; checker and dictionary: working tree`);
  for(const path of [...files].sort()) {
    const file=relative(process.cwd(),path).replaceAll("\\","/");
    if(tracked&&!tracked.has(file)){files.delete(path);continue;}
    const source=ref?execFileSync("git",["show",`${ref}:${file}`],{encoding:"utf8",maxBuffer:4*1024*1024}):readFileSync(path,"utf8");
    inspect(file,extractStrings(source,path.endsWith('.tsx')?'.tsx':'.ts'));
  }
}
for(const f of findings)console.log(`${f.file}:${f.line} [${f.kind}] ${f.text.slice(0,40)} → ${f.suggestion??"확인"}${f.reason?" (예외: "+f.reason.slice(0,40)+")":""}`);
for(const kind of ["banned","english","template","length","style_mix","button_noun"])console.log(`${kind}: ${findings.filter(f=>f.kind===kind).length}`);
const blocking=findings.filter(f=>f.blocking).length;
console.log(`scanned: ${files.size}; blocking: ${blocking}; warnings: ${findings.length-blocking}`);
process.exitCode=report?0:blocking?1:0;
