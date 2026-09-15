import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
export async function verifyTrailerAssessmentSql({db,q,check,asUser,ids}) {
  const t=randomUUID(), demo=randomUUID(), attempt=randomUUID(), candidate=randomUUID(), other=randomUUID();
  const scenarios=JSON.parse(readFileSync("tests/fixtures/trailer-approval.json","utf8")).scenarios;
  const decision=(await q("select id from decisions where dept_id=$1 limit 1",[ids.dept])).rows[0].id;
  const demoDept=(await q("select d.id from departments d join orgs o on o.id=d.org_id where o.is_demo limit 1")).rows[0].id;
  for(const [id,dept] of [[t,ids.dept],[demo,demoDept]]) await q("insert into trailers(id,dept_id,status,source_decision_ids,scenarios,rubric) values($1,$2,'review',$3::uuid[],$4::jsonb,'[{\"key\":\"a\",\"label\":\"근거\",\"weight\":3,\"description\":\"확인\"}]')",[id,dept,[decision],JSON.stringify(scenarios)]);
  const submissions=JSON.stringify([{scenario_id:"first",choice_id:"yes",reason:"합성 이유",fact_ids:["fact"],events:[]}]);
  async function service(fn) { await db.exec("set role service_role"); await q("select set_config('request.jwt.claim.role','service_role',false)"); try{return await fn();}finally{await db.exec("reset role");} }
  const create=(id=attempt,kind="synthetic",json=submissions,trailer=t)=>q("select * from create_trailer_attempt($1,$2,$3,'합성 지원자 A',$4::jsonb)",[id,trailer,kind,json]);
  const rejects=code=>error=>error.message===code;
  await check("assessment candidate is disabled in both service RPC and direct-write trigger",async()=>{
    await service(()=>assert.rejects(()=>create(candidate,"candidate"),rejects("trailer_assessment_disabled")));
    await service(()=>assert.rejects(()=>q("insert into trailer_attempts(trailer_id,kind,label,submissions) values($1,'candidate','합성 검사',$2::jsonb)",[t,submissions]),rejects("trailer_assessment_disabled")));
    await q("update orgs set trailer_assessment_enabled=true where id=$1",[ids.org]);await service(()=>create(candidate,"candidate"));
    await q("update orgs set trailer_assessment_enabled=false where id=$1",[ids.org]);
    await service(()=>assert.rejects(()=>q("update trailer_attempts set kind=kind where id=$1",[candidate]),rejects("trailer_assessment_disabled")));
  });
  await check("assessment creation is service-only and retries preserve immutable submissions",async()=>{
    for(const role of ["anon","authenticated","service_role"]) assert.equal((await q("select has_function_privilege($1,'create_trailer_attempt(uuid,uuid,text,text,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,role==="service_role");
    await asUser(ids.lead,()=>assert.rejects(()=>create(),error=>error.code==="42501"));
    await db.exec("set role anon");try{await assert.rejects(()=>create(),error=>error.code==="42501");}finally{await db.exec("reset role");}
    await service(()=>create());await service(()=>q("update trailer_attempts set status='scored',result='{}',weighted_score=2 where id=$1",[attempt]));await service(()=>create());
    const row=(await q("select * from trailer_attempts where id=$1",[attempt])).rows[0];assert.equal(row.dept_id,ids.dept);assert.equal(row.status,"scoring");assert.equal(row.result,null);assert.equal(row.weighted_score,null);
    await service(()=>assert.rejects(()=>create(attempt,"synthetic",JSON.stringify([{different:true}])),rejects("attempt_submissions_mismatch")));
    await service(()=>assert.rejects(()=>q("update trailer_attempts set submissions='[{}]' where id=$1",[attempt]),error=>error.code==="42501"));
    await service(()=>q("insert into trailer_attempts(id,trailer_id,dept_id,kind,label,submissions) values($1,$2,$3,'synthetic','합성 지원자 B',$4::jsonb)",[other,demo,ids.dept,submissions]));
    assert.equal((await q("select dept_id from trailer_attempts where id=$1",[other])).rows[0].dept_id,demoDept);
  });
  await check("assessment RLS grants only own leads and anonymous demo reads",async()=>{
    // The older org-admin tests promoted ids.member, so use a fresh ordinary member.
    const member=randomUUID(),otherLead=randomUUID(),otherDept=randomUUID(); await q("insert into auth.users(id) values($1),($2)",[member,otherLead]);
    await q("insert into departments(id,org_id,name) values($1,$2,'채점 다른 부서')",[otherDept,ids.org]);
    await q("insert into members(user_id,dept_id,role,display_name) values($1,$2,'member','멤버'),($3,$4,'lead','다른 부서장')",[member,ids.dept,otherLead,otherDept]);
    for(const user of [member,otherLead]) await asUser(user,async()=>assert.equal((await q("select count(*)::int n from trailer_attempts where id=$1",[attempt])).rows[0].n,0));
    await asUser(ids.lead,async()=>assert.equal((await q("select count(*)::int n from trailer_attempts where id=$1",[attempt])).rows[0].n,1));
    await db.exec("set role anon");try{const rows=(await q("select id from trailer_attempts")).rows;assert.deepEqual(rows.map(row=>row.id),[other]);}finally{await db.exec("reset role");}
    for(const role of ["anon","authenticated"])for(const command of ["INSERT","UPDATE","DELETE"])assert.equal((await q("select has_table_privilege($1,'trailer_attempts',$2) allowed",[role,command])).rows[0].allowed,false);
  });
  await check("deleting a trailer cascades its assessment attempts",async()=>{await q("delete from trailers where id=$1",[t]);assert.equal((await q("select count(*)::int n from trailer_attempts where trailer_id=$1",[t])).rows[0].n,0);});
}
