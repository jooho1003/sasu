import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export async function verifyRetroSql({ db, q, check, asUser }) {
  const ids = Object.fromEntries(["org","dept","a","b","lead","demoOrg","demoDept","demoUser","day"].map(k=>[k,randomUUID()]));
  await q("insert into orgs(id,name,is_demo) values($1,'회고 QA',false),($2,'합성 회고',true)",[ids.org,ids.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$3,'회고 QA'),($2,$4,'합성 회고')",[ids.dept,ids.demoDept,ids.org,ids.demoOrg]);
  for(const key of ["a","b","lead","demoUser"]) await q("insert into auth.users(id) values($1)",[ids[key]]);
  for(const key of ["a","b","lead"]) await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,$3,$4,now())",[ids[key],ids.dept,key==='lead'?'lead':'member',key]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','demo',now())",[ids.demoUser,ids.demoDept]);
  const date=(await q("select (now() at time zone 'Asia/Seoul')::date::text d")).rows[0].d;
  const activity={kind:"git_commit",ref:"commit-1",title:"근거 검증 완료",text:"연락처 010-1234-5678",at:`${date}T01:00:00Z`,meta:{}};
  const bundle={activities:[activity]};
  const create=(value=bundle,id=ids.day,dept=ids.dept)=>q("select create_retro_day($1,$2,$3,'Asia/Seoul','1',$4::jsonb) value",[dept,id,date,JSON.stringify(value)]);
  async function service(fn){await db.exec("set role service_role");await q("select set_config('request.jwt.claim.role','service_role',false)");try{return await fn();}finally{await db.exec("reset role");await q("select set_config('request.jwt.claim.role','',false)");}}
  const rejected=(fn,message)=>assert.rejects(fn,e=>message?e.message===message:e.code==='42501');
  let opened,aid,claim;
  await check("retro: canonical day, masked activities and deterministic retry",async()=>{
    await asUser(ids.a,async()=>{opened=(await create()).rows[0].value;const again=(await create(bundle,randomUUID())).rows[0].value;assert.deepEqual(again,opened);});
    const rows=(await q("select * from retro_activities where day_id=$1",[ids.day])).rows;assert.equal(rows.length,1);aid=rows[0].id;assert.ok(rows[0].text.includes('[전화번호]'));
    assert.equal((await q("select count(*)::int n from jobs where kind='retro_draft' and payload->>'dayId'=$1",[ids.day])).rows[0].n,1);
  });
  await check("retro: direct writes, server kinds, bounds, consent and demo are denied",async()=>{
    await asUser(ids.a,async()=>{
      await rejected(()=>q("update retro_days set visibility='dept' where id=$1",[ids.day]));
      await rejected(()=>create({activities:[{...activity,kind:'sasu_decision'}]}),'server_only_kind');
      await rejected(()=>create({activities:Array.from({length:501},(_,i)=>({...activity,ref:String(i)}))}),'invalid_bundle');
      await rejected(()=>create({activities:[{...activity,text:'x'.repeat(501)}]}),'invalid_bundle');
      await rejected(()=>q("select claim_retro_draft($1,0,1)",[ids.day]));
    });
    await asUser(ids.demoUser,()=>rejected(()=>create(bundle,randomUUID(),ids.demoDept),'demo_org'));
    await q("update members set consented_at=null where user_id=$1",[ids.b]);
    await asUser(ids.b,()=>rejected(()=>create(bundle,randomUUID()),'consent_required'));
    await q("update members set consented_at=now() where user_id=$1",[ids.b]);
  });
  await check("retro: self is invisible to another member and lead",async()=>{
    for(const who of [ids.b,ids.lead]) await asUser(who,async()=>assert.equal((await q("select id from retro_days where id=$1",[ids.day])).rows.length,0));
  });
  const body={did:[{text:'근거를 검증했다.',citations:[{activity_id:aid,quote:'근거 검증 완료'}]}],learned:[],decided:[],next:[]};
  async function finish(c,error=null){return (await service(()=>q("select finish_retro_draft($1,$2,$3,$4,'오늘 회고',$5::jsonb,array['검증'],$6) value",[ids.day,c.day.revision,c.day.generation,c.lease,JSON.stringify(body),error]))).rows[0].value;}
  await check("retro: one lease, stale generation and late completion cannot overwrite",async()=>{
    claim=(await service(()=>q("select claim_retro_draft($1,0,1) value",[ids.day]))).rows[0].value;
    assert.ok(claim.lease);
    assert.equal((await service(()=>q("select claim_retro_draft($1,0,1) value",[ids.day]))).rows[0].value,null);
    await asUser(ids.a,()=>q("select regenerate_retro($1)",[ids.day]));
    assert.equal(await finish(claim),false);
    claim=(await service(()=>q("select claim_retro_draft($1,0,2) value",[ids.day]))).rows[0].value;
    assert.equal(await finish(claim),true);
  });
  await check("retro: citations and optimistic revision checks are enforced",async()=>asUser(ids.a,async()=>{
    await rejected(()=>q("select save_retro($1,null,'NULL 수정',$2::jsonb,array['검증'])",[ids.day,JSON.stringify(body)]),'stale_retro');
    await rejected(()=>q("select save_retro($1,1,null,$2::jsonb,array['검증'])",[ids.day,JSON.stringify(body)]),'invalid_retro');
    await rejected(()=>q("select save_retro($1,1,'제목',$2::jsonb,array[null]::text[])",[ids.day,JSON.stringify(body)]),'invalid_retro');
    await rejected(()=>q("select save_retro($1,1,'제목',$2::jsonb,array['검증'])",[ids.day,JSON.stringify({...body,did:[{citations:body.did[0].citations}]})]),'invalid_retro');
    await rejected(()=>q("select save_retro($1,0,'오래된 수정',$2::jsonb,array['검증'])",[ids.day,JSON.stringify(body)]),'stale_retro');
    await rejected(()=>q("select save_retro($1,1,'나쁜 근거',$2::jsonb,array['검증'])",[ids.day,JSON.stringify({...body,did:[{text:'오류',citations:[{activity_id:aid,quote:'없는 문자열'}]}]})]),'citation_invalid');
    await q("select save_retro($1,1,'수정 회고',$2::jsonb,array['검증'])",[ids.day,JSON.stringify(body)]);
    await q("select confirm_retro($1,2)",[ids.day]);
    await q("select set_retro_visibility($1,'dept')",[ids.day]);
  }));
  await check("retro: shared readers see only confirmed cited activity and revision",async()=>{
    await asUser(ids.a,()=>create({activities:[{...activity,ref:'private-extra',title:'미인용 개인 기록'}]}));
    await asUser(ids.b,async()=>{
      assert.equal((await q("select * from retro_days where id=$1",[ids.day])).rows.length,1);
      const revisions=(await q("select revision from retro_revisions where day_id=$1",[ids.day])).rows;
      assert.deepEqual(revisions.map(r=>r.revision),[3]);
      assert.deepEqual((await q("select id from retro_activities where day_id=$1",[ids.day])).rows.map(a=>a.id),[aid]);
      assert.equal((await q("select * from retro_exports where day_id=$1",[ids.day])).rows.length,0);
    });
    await asUser(ids.a,()=>rejected(()=>create({activities:[{...activity,title:'확정 근거 변경'}]}),'cited_activity_changed'));
  });
  await check("retro: a narrower citation blocks broad confirmation and sharing",async()=>{
    await q("update retro_activities set source_visibility='leads_only' where id=$1",[aid]);
    await asUser(ids.a,async()=>{await rejected(()=>q("select set_retro_visibility($1,'dept')",[ids.day]),'visibility_narrower_source');await q("select set_retro_visibility($1,'leads_only')",[ids.day]);});
    await asUser(ids.b,async()=>assert.equal((await q("select id from retro_days where id=$1",[ids.day])).rows.length,0));
    await asUser(ids.lead,async()=>assert.equal((await q("select id from retro_days where id=$1",[ids.day])).rows.length,1));
  });
  await check("retro: exclusion, regeneration, timeout and no-citation recovery",async()=>{
    await asUser(ids.a,async()=>{await q("select exclude_retro_activity($1,$2,true)",[ids.day,aid]);await q("select regenerate_retro($1)",[ids.day]);});
    const d=(await q("select revision,generation from retro_days where id=$1",[ids.day])).rows[0];
    const c=(await service(()=>q("select claim_retro_draft($1,$2,$3) value",[ids.day,d.revision,d.generation]))).rows[0].value;
    assert.ok(!c.activities.some(a=>a.id===aid));
    assert.equal(await finish(c,'retro_no_citations'),true);
    assert.equal((await q("select status from retro_days where id=$1",[ids.day])).rows[0].status,'needs_review');
    await asUser(ids.a,()=>q("select regenerate_retro($1)",[ids.day]));
    await q("update retro_days set updated_at=now()-interval '3 minutes' where id=$1",[ids.day]);
    await service(()=>q("select sweep_retro_drafts()"));
    assert.equal((await q("select status from retro_days where id=$1",[ids.day])).rows[0].status,'failed');
    assert.equal(await finish(c),false);
  });
  await check("retro: export and deletion are owner-only and delete cascades",async()=>{
    await asUser(ids.a,()=>q("select record_retro_export($1,3,'markdown')",[ids.day]));
    await asUser(ids.b,()=>rejected(()=>q("select delete_retro_day($1)",[ids.day]),'retro_not_found'));
    await asUser(ids.a,()=>q("select delete_retro_day($1)",[ids.day]));
    for(const table of ['retro_days','retro_activities','retro_revisions','retro_exports']) assert.equal((await q(`select count(*)::int n from ${table} where ${table==='retro_days'?'id':'day_id'}=$1`,[ids.day])).rows[0].n,0);
  });
  await check("retro: API function privilege matrix is explicit",async()=>{
    for(const [name,role] of [['create_retro_day','authenticated'],['save_retro','authenticated'],['claim_retro_draft','service_role'],['finish_retro_draft','service_role'],['sweep_retro_drafts','service_role'],['record_retro_export','authenticated']]){
      const f=(await q("select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name])).rows[0].f;
      for(const actor of ['anon','authenticated','service_role']) assert.equal((await q("select has_function_privilege($1,$2,'execute') ok",[actor,f])).rows[0].ok,actor===role,`${name}:${actor}`);
    }
  });
  await check("retro: NULL lease, empty success and exclusion fence cannot create a draft",async()=>{
    await asUser(ids.a,()=>create());
    assert.equal((await service(()=>q("select finish_retro_draft($1,0,1,null,'제목',$2::jsonb,array['검증'],null) value",[ids.day,JSON.stringify(body)]))).rows[0].value,false);
    const c=(await service(()=>q("select claim_retro_draft($1,0,1) value",[ids.day]))).rows[0].value;
    assert.equal(await finish({...c,day:{...c.day,generation:null}}),false);
    assert.equal((await service(()=>q("select finish_retro_draft($1,0,1,$2,'제목',$3::jsonb,array['검증'],null) value",[ids.day,c.lease,JSON.stringify({did:[],learned:[],decided:[],next:[]})]))).rows[0].value,true);
    assert.equal((await q("select status from retro_days where id=$1",[ids.day])).rows[0].status,'needs_review');
    await asUser(ids.a,()=>q("select regenerate_retro($1)",[ids.day]));
    const next=(await service(()=>q("select claim_retro_draft($1,0,2) value",[ids.day]))).rows[0].value;
    const a=(await q("select id from retro_activities where day_id=$1",[ids.day])).rows[0];
    await asUser(ids.a,()=>q("select exclude_retro_activity($1,$2,true)",[ids.day,a.id]));
    assert.equal(await finish(next,'llm_timeout'),false);
    await asUser(ids.a,()=>q("select delete_retro_day($1)",[ids.day]));
  });
  await check("retro: live answer evidence revocation hides activity, revision, sharing and export",async()=>{
    const source=randomUUID(),item=randomUUID(),answer=randomUUID();
    await q("insert into sources(id,dept_id,kind,external_id,visibility) values($1::uuid,$2,'notion_page',$1::uuid::text,'dept')",[source,ids.dept]);
    await q("insert into items(id,source_id,dept_id,content) values($1,$2,$3,'합성 승인 기준')",[item,source,ids.dept]);
    await q("insert into answers(id,dept_id,asked_by,question,answer,status,verified) values($1,$2,$3,'합성 승인 질문','합성 승인 기준','done',true)",[answer,ids.dept,ids.a]);
    await q("insert into citations(owner_kind,owner_id,item_id,quote) values('answer',$1,$2,'합성 승인 기준')",[answer,item]);
    await asUser(ids.a,()=>create({activities:[]}));
    const activity=(await q("select * from retro_activities where day_id=$1 and kind='sasu_answer'",[ids.day])).rows[0];
    assert.ok(activity);
    const evidenceBody={did:[{text:'승인 기준을 확인했다.',citations:[{activity_id:activity.id,quote:activity.title}]}],learned:[],decided:[],next:[]};
    await asUser(ids.a,async()=>{
      await q("select save_retro($1,0,'합성 회고',$2::jsonb,array['검증'])",[ids.day,JSON.stringify(evidenceBody)]);
      await q("select confirm_retro($1,1)",[ids.day]); await q("select set_retro_visibility($1,'dept')",[ids.day]);
    });
    await asUser(ids.b,async()=>{
      assert.equal((await q("select * from retro_revisions where day_id=$1",[ids.day])).rows.length,1);
      assert.equal((await q("select id from answers where id=$1",[answer])).rows.length,0);
    });
    await q("update sources set visibility='leads_only' where id=$1",[source]);
    for(const who of [ids.a,ids.b]) await asUser(who,async()=>{
      assert.equal((await q("select id from retro_activities where day_id=$1",[ids.day])).rows.length,0);
      assert.equal((await q("select revision from retro_revisions where day_id=$1",[ids.day])).rows.length,0);
    });
    await asUser(ids.a,async()=>{
      await rejected(()=>q("select record_retro_export($1,2,'markdown')",[ids.day]),'not_confirmed');
      assert.deepEqual((await q("select value->'topics' topics from retro_timeline($1,$2,$2) value",[ids.dept,date])).rows[0].topics,[]);
      await q("select regenerate_retro($1)",[ids.day]);
    });
    const c=(await service(()=>q("select claim_retro_draft($1,2,2) value",[ids.day]))).rows[0].value;
    assert.deepEqual(c.activities,[]);
    await q("update sources set visibility='dept',active=false where id=$1",[source]);
    await asUser(ids.b,async()=>assert.equal((await q("select id from retro_days where id=$1",[ids.day])).rows.length,0));
    await q("update members set consented_at=null where user_id=$1",[ids.a]);
    assert.equal((await service(()=>q("select renew_retro_draft($1,2,2,$2) value",[ids.day,c.lease]))).rows[0].value,false);
    await q("update members set consented_at=now() where user_id=$1",[ids.a]);
  });
  await check("retro: demo anon reads confirmed dept only, no private drafts or self days",async()=>{
    const demo=randomUUID(),self=randomUUID(),activity=randomUUID();
    await q("insert into retro_days(id,dept_id,user_id,retro_date,visibility,status,revision,confirmed_revision) values($1,$3,$4,$5,'dept','confirmed',2,2),($2,$3,$4,$5::date-1,'self','confirmed',2,2)",[demo,self,ids.demoDept,ids.demoUser,date]);
    await q("insert into retro_activities(id,day_id,kind,ref,title,text,at) values($1,$2,'git_commit','synthetic','합성 업무','',now())",[activity,demo]);
    const content={did:[{text:'합성 업무 확인',citations:[{activity_id:activity,quote:'합성 업무'}]}],learned:[],decided:[],next:[]};
    await q("insert into retro_revisions(day_id,revision,origin,title,body) values($1,1,'draft','비공개 초안',$2::jsonb),($1,2,'confirm','합성 확정',$2::jsonb)",[demo,JSON.stringify(content)]);
    await db.exec("set role anon"); await q("select set_config('request.jwt.claim.role','anon',false)");
    try {
      assert.deepEqual((await q("select id from retro_days where dept_id=$1",[ids.demoDept])).rows.map(r=>r.id),[demo]);
      assert.deepEqual((await q("select revision from retro_revisions where day_id=$1",[demo])).rows.map(r=>r.revision),[2]);
      assert.equal((await q("select id from retro_days where dept_id=$1",[ids.dept])).rows.length,0);
    } finally { await db.exec("reset role"); await q("select set_config('request.jwt.claim.role','',false)"); }
  });
  await check("retro: 0047 then 0046 rollback removes only the retrospective schema",async()=>{
    await db.exec("begin");
    try {
      await db.exec(readFileSync("supabase/rollback/0047_retro_exports_rpc_down.sql","utf8"));
      await db.exec(readFileSync("supabase/rollback/0046_daily_retro_down.sql","utf8"));
      assert.equal((await q("select to_regclass('public.retro_days') value")).rows[0].value,null);
      assert.ok((await q("select to_regclass('public.decisions') value")).rows[0].value);
    } finally {await db.exec("rollback");}
  });
}

// Standalone entry reuses the full isolated schema bootstrap, never an external DB.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const result=spawnSync(process.execPath,[fileURLToPath(new URL("./verify-security-sql.mjs",import.meta.url)),...process.argv.slice(2)],{stdio:"inherit",windowsHide:true}); process.exitCode=result.status ?? 1; }
