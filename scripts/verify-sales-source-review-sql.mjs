import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

export async function verifySalesSourceReviewSql({q,check,asUser,ids}) {
  const denyAction=async action=>assert.rejects(action,error=>/^[0-9A-Z]{5}$/.test(error.code));
  const a=Object.fromEntries(["dept","lead","lead2","member","outsider","unconsented","otherDept","demoOrg","demoDept","demoLead"].map(k=>[k,randomUUID()]));
  const sourceIds=Array.from({length:4},()=>randomUUID()),itemIds=Array.from({length:4},()=>randomUUID());
  await q("insert into departments(id,org_id,name) values($1,$3,'Source AI QA'),($2,$3,'Other AI QA')",[a.dept,a.otherDept,ids.org]);
  for(const user of [a.lead,a.lead2,a.member,a.outsider,a.unconsented,a.demoLead]) await q("insert into auth.users(id) values($1)",[user]);
  for(const [user,dept,role,consent] of [[a.lead,a.dept,"lead",true],[a.lead2,a.dept,"lead",true],[a.member,a.dept,"member",true],[a.outsider,a.otherDept,"lead",true],[a.unconsented,a.dept,"lead",false]])
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,$3,'AI QA',case when $4 then now() else null end)",[user,dept,role,consent]);
  await q("insert into orgs(id,name,is_demo) values($1,'AI demo',true)",[a.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$2,'AI demo')",[a.demoDept,a.demoOrg]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','Demo',now())",[a.demoLead,a.demoDept]);
  for(let i=0;i<4;i++) {
    await q("insert into sources(id,dept_id,kind,visibility,title,active,is_principles,external_id) values($1,$2,'document','leads_only','Source',true,$3,$4)",[sourceIds[i],a.dept,i===3,"source-ai:"+sourceIds[i]]);
    await q("insert into items(id,source_id,dept_id,content) values($1,$2,$3,$4)",[itemIds[i],sourceIds[i],a.dept,"소개\r\n\r\n가격 확정은 승인 후입니다."]);
  }
  const versions=(await q("select encode(sha256(convert_to(content,'UTF8')),'hex') value from items where id=any($1::uuid[]) order by array_position($1::uuid[],id)",[itemIds])).rows.map(r=>r.value);
  const request=async(user=a.lead,dept=a.dept,requestId=randomUUID(),items=itemIds,v=versions)=>{
    let value;
    await asUser(user,async()=>{value=(await q("select request_sales_source_review($1,$2::uuid[],$3,$4::text[]) id",[dept,items,requestId,v])).rows[0].id;});
    return value;
  };
  let task; const req=randomUUID();
  await check("source AI: lead creates atomic task and job; idempotent retry",async()=>{
    task=await request(a.lead,a.dept,req);assert.equal(await request(a.lead,a.dept,req),task);
    assert.equal((await q("select count(*)::int n from jobs where kind='run_sales_source_review' and payload->>'taskId'=$1",[task])).rows[0].n,1);
  });
  for(const [name,user,dept] of [["member",a.member,a.dept],["outsider",a.outsider,a.dept],["nonconsent",a.unconsented,a.dept],["demo",a.demoLead,a.demoDept]])
    await check("source AI: "+name+" request denied",()=>denyAction(()=>request(user,dept)));
  await check("source AI: strict IDs and current version",async()=>{
    await denyAction(()=>request(a.lead,a.dept,randomUUID(),[itemIds[0],itemIds[0],itemIds[2],itemIds[3]]));
    await denyAction(()=>request(a.lead,a.dept,randomUUID(),itemIds,["wrong",...versions.slice(1)]));
    await denyAction(()=>request(a.lead,a.dept,req,[itemIds[1],itemIds[0],itemIds[2],itemIds[3]]));
  });
  await check("source AI: owner-only current RLS, direct writes/worker RPC denied",async()=>{
    await asUser(a.lead,async()=>assert.equal((await q("select id from sales_source_reviews where id=$1",[task])).rows.length,1));
    for(const u of [a.lead2,a.member,a.outsider]) await asUser(u,async()=>{
      assert.equal((await q("select id from sales_source_reviews where id=$1",[task])).rows.length,0);
      assert.equal((await q("select * from sales_source_review_inputs($1,$2,$3::uuid[],$4::text[])",[a.lead,a.dept,itemIds,versions])).rows.length,0);
    });
    await denyAction(()=>asUser(a.lead,()=>q("update sales_source_reviews set status='failed' where id=$1",[task])));
    await denyAction(()=>asUser(a.lead,()=>q("select claim_sales_source_review($1)",[task])));
    await denyAction(()=>asUser(a.lead,()=>q("select finish_sales_source_review($1,'refused',null)",[task])));
  });
  const visibility=async()=>asUser(a.lead,async()=>assert.equal((await q("select id from sales_source_reviews where id=$1",[task])).rows.length,0));
  for(const [label,change,undo] of [
    ["deleted","update items set deleted_at=now() where id=$1","update items set deleted_at=null where id=$1"],
    ["edited","update items set content=content||' changed' where id=$1","update items set content='소개'||chr(13)||chr(10)||chr(13)||chr(10)||'가격 확정은 승인 후입니다.' where id=$1"],
  ]) await check("source AI: "+label+" hides direct SELECT",async()=>{await q(change,[itemIds[0]]);await visibility();await q(undo,[itemIds[0]]);});
  for(const [label,change,undo] of [
    ["inactive","update sources set active=false where id=$1","update sources set active=true where id=$1"],
    ["no policy","update sources set is_principles=false where id=$1","update sources set is_principles=true where id=$1"],
  ]) await check("source AI: "+label+" hides and blocks request",async()=>{
    await q(change,[sourceIds[3]]);await visibility();await denyAction(()=>request());await q(undo,[sourceIds[3]]);
  });
  await check("source AI: demotion/withdrawal hides current task",async()=>{
    await q("update members set role='member' where user_id=$1 and dept_id=$2",[a.lead,a.dept]);await visibility();
    await q("update members set role='lead',consented_at=null where user_id=$1 and dept_id=$2",[a.lead,a.dept]);await visibility();
    await q("update members set consented_at=now() where user_id=$1 and dept_id=$2",[a.lead,a.dept]);
  });
  await check("source AI: cross-department source replacement is unavailable",async()=>{
    await q("update sources set dept_id=$2 where id=$1",[sourceIds[0],a.otherDept]);
    await visibility();await denyAction(()=>request());
    await q("update sources set dept_id=$2 where id=$1",[sourceIds[0],a.dept]);
  });
  await check("source AI: current demo switch hides existing task",async()=>{
    await q("update orgs set is_demo=true where id=$1",[ids.org]);await visibility();await denyAction(()=>request());
    await q("update orgs set is_demo=false where id=$1",[ids.org]);
  });
  await check("source AI: complete document/paragraph limits including UTF16",async()=>{
    assert.equal((await q("select sales_source_utf16_length('😀😀') n")).rows[0].n,4);
    for(const content of ["a".repeat(20001),"😀".repeat(2001),Array(81).fill("p").join("\n\n")]) {
      await q("update items set content=$2 where id=$1",[itemIds[0],content]);
      await denyAction(()=>request(a.lead,a.dept,randomUUID(),itemIds,null));
    }
    await q("update items set content=$2 where id=$1",[itemIds[0],"소개\r\n\r\n가격 확정은 승인 후입니다."]);
  });
  await check("source AI: finish only active processing and terminal cannot reopen",async()=>{
    assert.equal((await q("select finish_sales_source_review($1,'refused',null) ok",[task])).rows[0].ok,false);
    assert.equal((await q("select * from claim_sales_source_review($1)",[task])).rows.length,1);
    assert.equal((await q("select finish_sales_source_review($1,'refused',null) ok",[task])).rows[0].ok,true);
    assert.equal((await q("select * from claim_sales_source_review($1)",[task])).rows.length,0);
  });
  await check("source AI: edit during model prevents finish and stores no result",async()=>{
    const t=await request();await q("select claim_sales_source_review($1)",[t]);
    await q("update items set content=content||' changed' where id=$1",[itemIds[0]]);
    assert.equal((await q("select finish_sales_source_review($1,'ready',$2::jsonb) ok",[t,JSON.stringify({topics:[]})])).rows[0].ok,false);
    assert.deepEqual((await q("select status,result from sales_source_reviews where id=$1",[t])).rows[0],{status:"failed",result:null});
    await q("update items set content=$2 where id=$1",[itemIds[0],"소개\r\n\r\n가격 확정은 승인 후입니다."]);
  });
  await check("source AI: two-minute deadline blocks claim and late finish",async()=>{
    const t=await request();await q("select claim_sales_source_review($1)",[t]);
    await q("update sales_source_reviews set updated_at=now()-interval '121 seconds' where id=$1",[t]);
    assert.equal((await q("select finish_sales_source_review($1,'refused',null) ok",[t])).rows[0].ok,false);
    assert.equal((await q("select status_reason from sales_source_reviews where id=$1",[t])).rows[0].status_reason,"llm_timeout");
  });
  await check("source AI: KST per-user daily limit and no extra job",async()=>{
    const count=(await q("select count(*)::int n from sales_source_reviews where requested_by=$1",[a.lead])).rows[0].n;
    for(let i=count;i<10;i++) await request();
    await denyAction(()=>request());
    assert.equal((await q("select count(*)::int n from sales_source_reviews where requested_by=$1",[a.lead])).rows[0].n,10);
  });
}
