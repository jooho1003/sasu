import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
export async function verifySlackInstallationsSql({q,check,asUser}) {
  const id=Object.fromEntries(['orgA','orgB','deptA','deptB','adminA','adminB','memberA','memberB','sourceA','sourceB','cardA'].map(k=>[k,randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Slack A'),($2,'Slack B')",[id.orgA,id.orgB]);
  await q("insert into departments(id,org_id,name) values($1,$3,'A'),($2,$4,'B')",[id.deptA,id.deptB,id.orgA,id.orgB]);
  await q('insert into auth.users(id) values($1),($2),($3),($4)',[id.adminA,id.adminB,id.memberA,id.memberB]);
  await q("insert into org_admins(org_id,user_id,granted_by) values($1,$3,'qa'),($2,$4,'qa')",[id.orgA,id.orgB,id.adminA,id.adminB]);
  const runAs=async(user,fn)=>{let out;await asUser(user,async()=>{out=await fn()});return out;};
  const hash=()=>createHash('sha256').update(randomUUID()).digest('hex');
  const begin=(actor,h)=>runAs(actor,()=>q('select begin_slack_installation($1) org',[h]));
  const consume=(actor,h)=>runAs(actor,()=>q('select consume_slack_installation_state($1) org',[h]));
  const save=(actor,org,h,team)=>q("select complete_slack_installation($1,$2,$3,$4,'QA','UBOT','v1.synthetic',array['chat:write']) ok",[h,actor,org,team]);
  await check('Slack installation: state belongs to admin/session/org, expires and consumes once',async()=>{
    const h=hash();
    await assert.rejects(()=>begin(id.memberA,h),e=>e.code==='42501');
    await begin(id.adminA,h);
    assert.equal((await consume(id.adminB,h)).rows[0].org,null);
    assert.equal((await consume(id.adminA,h)).rows[0].org,id.orgA);
    assert.equal((await consume(id.adminA,h)).rows[0].org,null);
    assert.equal((await save(id.adminA,id.orgA,h,'TINSTALLA')).rows[0].ok,true);
    await assert.rejects(()=>save(id.adminA,id.orgA,h,'TINSTALLA'),e=>e.code==='42501');
    const expired=hash(); await begin(id.adminA,expired); await q("update slack_oauth_states set expires_at=now()-interval '1 second' where state_hash=$1",[expired]);
    assert.equal((await consume(id.adminA,expired)).rows[0].org,null);
  });
  await check('Slack installation: browser cannot forge tokens; workspace and organization cannot be reassigned',async()=>{
    const h=hash(); await begin(id.adminB,h); await consume(id.adminB,h);
    await runAs(id.adminB,()=>assert.rejects(()=>save(id.adminB,id.orgB,h,'TINSTALLB'),e=>e.code==='42501'));
    await assert.rejects(()=>save(id.adminB,id.orgB,h,'TINSTALLA'),e=>e.code==='23505');
    await save(id.adminB,id.orgB,h,'TINSTALLB');
    const rebind=hash(); await begin(id.adminA,rebind); await consume(id.adminA,rebind);
    await assert.rejects(()=>save(id.adminA,id.orgA,rebind,'TTHIRD'),e=>e.code==='23505');
    const status=(await runAs(id.adminA,()=>q('select admin_slack_installation() value'))).rows[0].value;
    assert.equal(status.team_id,'TINSTALLA'); assert.equal(JSON.stringify(status).includes('encrypted'),false);
  });
  await q("insert into members(user_id,dept_id,role,display_name,slack_user_id,consented_at) values($1,$3,'lead','A','USAMEID',now()),($2,$4,'lead','B','USAMEID',now())",[id.memberA,id.memberB,id.deptA,id.deptB]);
  await q("insert into sources(id,dept_id,kind,external_id,active) values($1,$3,'slack_channel','CSAMEID',true),($2,$4,'slack_channel','CSAMEID',true)",[id.sourceA,id.sourceB,id.deptA,id.deptB]);
  await check('Slack installation: identical Slack IDs in different workspaces never cross organizations',async()=>{
    assert.deepEqual((await q("select slack_team_id from sources where id=any($1::uuid[]) order by slack_team_id",[[id.sourceA,id.sourceB]])).rows.map(r=>r.slack_team_id),['TINSTALLA','TINSTALLB']);
    const contexts=(await q("select slack_question_context_for_team('TINSTALLA','USAMEID','CSAMEID',false) value")).rows[0].value;
    assert.deepEqual(contexts.map(r=>r.id),[id.deptA]);
    assert.equal((await q("select ingest_slack_question_for_team('TINSTALLA','foreign-event','USAMEID','CSAMEID','123.001',$1,'타 조직에 저장하려는 질문',false) value",[id.deptB])).rows[0].value.status,'not_connected');
    assert.equal((await q("select consent_via_slack_for_team('TINSTALLA','USAMEID',$1) value",[id.deptB])).rows[0].value,false);
    const privateRow=(await runAs(id.memberA,()=>q('select slack_installation_for_department($1) value',[id.deptB]))).rows[0].value;
    assert.equal(privateRow,null);
    await runAs(id.memberA,()=>q("update sources set slack_team_id='TINSTALLB' where id=$1",[id.sourceA]));
    assert.equal((await q('select slack_team_id from sources where id=$1',[id.sourceA])).rows[0].slack_team_id,'TINSTALLA');
  });
  await check('Slack installation: uninstall destroys token and stops collection/delivery, preserves other organizations',async()=>{
    await q("select ingest_slack_question_for_team('TINSTALLA','own-event','USAMEID','CSAMEID','123.001',$1,'우리 조직에 남기는 질문',false)",[id.deptA]);
    assert.equal((await q("select revoke_slack_installation('TINSTALLA') ok")).rows[0].ok,true);
    assert.equal((await q("select slack_installation_for_team('TINSTALLA') value")).rows[0].value,null);
    assert.equal((await q('select encrypted_token from slack_installations where org_id=$1',[id.orgA])).rows[0].encrypted_token,null);
    assert.equal((await q('select active from sources where id=$1',[id.sourceA])).rows[0].active,false);
    assert.equal((await q('select active from sources where id=$1',[id.sourceB])).rows[0].active,true);
    assert.ok((await q('select state from slack_answer_deliveries s join answers a on a.id=s.answer_id where a.dept_id=$1',[id.deptA])).rows.every(r=>r.state==='cancelled'));
    const again=hash(); await begin(id.adminA,again); await consume(id.adminA,again); await save(id.adminA,id.orgA,again,'TINSTALLA');
    assert.equal((await q('select active from sources where id=$1',[id.sourceA])).rows[0].active,false);
  });
  await check('Slack installation: credentials/state tables and worker RPCs are never browser accessible',async()=>{
    for(const role of ['anon','authenticated']) {
      for(const table of ['slack_installations','slack_oauth_states']) assert.equal((await q("select has_table_privilege($1,$2,'SELECT') allowed",[role,table])).rows[0].allowed,false);
      const rows=(await q("select has_function_privilege($1,p.oid,'EXECUTE') allowed from pg_proc p where proname=any($2::text[])",[role,['complete_slack_installation','slack_installation_for_team','slack_installation_for_job','revoke_slack_installation','slack_question_context_for_team','ingest_slack_question_for_team','consent_via_slack_for_team']])).rows;
      assert.equal(rows.length,7); assert.ok(rows.every(r=>!r.allowed));
    }
  });
}
