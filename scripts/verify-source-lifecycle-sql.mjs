import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifySourceLifecycleSql({ q, check, asUser }) {
  const id=Object.fromEntries(['org','dept','lead','member','source','item','notion'].map(k=>[k,randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Source lifecycle QA')",[id.org]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Source QA')",[id.dept,id.org]);
  await q('insert into auth.users(id) values($1),($2)',[id.lead,id.member]);
  await q("insert into members(user_id,dept_id,role,display_name,slack_user_id,consented_at) values($1,$3,'lead','QA','ULIFECYCLE',now()),($2,$3,'member','QA 멤버','ULIFEMEMBER',null)",[id.lead,id.member,id.dept]);
  await q("insert into sources(id,dept_id,kind,external_id,active) values($1,$3,'slack_channel','CLIFECYCLE',true),($2,$3,'notion_page','page',true)",[id.source,id.notion,id.dept]);
  await q("insert into items(id,dept_id,source_id,external_ref,author_ext_id,content) values($1,$2,$3,'100.000001','ULIFECYCLE','처음 원문')",[id.item,id.dept,id.source]);
  const edit=async(event,time,content,deleted=false,ref='100.000001',author='ULIFECYCLE')=>(await q('select apply_slack_change($1,$2,$3,$4,$5,$6,$7) ok',[event,id.source,ref,time,author,content,deleted])).rows[0].ok;
  const item=async()=>(await q('select * from items where id=$1',[id.item])).rows[0];
  await check('source lifecycle: edits are ordered, masked upstream, deduplicated, and enqueue once',async()=>{
    assert.equal(await edit('life-edit','101.000001','바뀐 원문 [이메일]'),true);
    assert.equal((await item()).content_version,2);
    assert.equal(await edit('life-old','100.999999','늦은 옛 원문'),false);
    assert.equal(await edit('life-edit','101.000001','바뀐 원문 [이메일]'),false);
    assert.equal((await item()).content,'바뀐 원문 [이메일]');
    assert.equal((await q("select count(*)::int n from jobs where payload->>'itemId'=$1 and kind='classify'",[id.item])).rows[0].n,1);
  });
  await check('source lifecycle: unconsented/forged edit writes no event or content',async()=>{
    assert.equal(await edit('life-unconsented','102.000001','미동의 원문',false,'100.000001','ULIFEMEMBER'),false);
    await q('update members set consented_at=now() where user_id=$1',[id.member]);
    assert.equal(await edit('life-forged','102.000001','다른 작성자',false,'100.000001','ULIFEMEMBER'),false);
    assert.equal((await q("select count(*)::int n from ingest_events where event_id like 'life-unconsented' or event_id='life-forged'")).rows[0].n,0);
  });
  await check('source lifecycle: stale AI completion cannot overwrite the current version',async()=>{
    const values=JSON.stringify({label:'info',method:'llm',confidence:1,deadline_hint:null,assignee_hint:null,reasoning:null});
    assert.equal((await q('select complete_item_classification($1,1,$2::jsonb) ok',[id.item,values])).rows[0].ok,false);
    assert.equal((await q('select complete_item_classification($1,2,$2::jsonb) ok',[id.item,values])).rows[0].ok,true);
    const vector=JSON.stringify(Array(1024).fill(0));
    assert.equal((await q("select complete_item_embedding($1,1,$2::vector,'qa') ok",[id.item,vector])).rows[0].ok,false);
    assert.equal((await q("select complete_item_embedding($1,2,$2::vector,'qa') ok",[id.item,vector])).rows[0].ok,true);
    const oldJob=randomUUID(); await q("insert into jobs(id,kind,payload) values($1,'classify',$2::jsonb)",[oldJob,JSON.stringify({itemId:id.item,contentVersion:1})]);
    await q('select fail_source_job($1)',[oldJob]);
    assert.equal((await q('select label from classifications where item_id=$1',[id.item])).rows[0].label,'info');
  });
  await check('source lifecycle: delete erases text/vectors/classification and rejects resurrection',async()=>{
    assert.equal(await edit('life-delete','103.000001',null,true),true);
    const deleted=await item(); assert.equal(deleted.content,''); assert.equal(deleted.embedding,null); assert.ok(deleted.deleted_at);
    assert.equal((await q('select count(*)::int n from classifications where item_id=$1',[id.item])).rows[0].n,0);
    assert.equal(await edit('life-after-delete','104.000001','복원 시도'),false);
    await edit('life-delete-first','103.000001',null,true,'99.000001');
    await q("insert into items(dept_id,source_id,external_ref,content) values($1,$2,'99.000001','지연된 수집')",[id.dept,id.source]);
    assert.equal((await q("select count(*)::int n from items where source_id=$1 and external_ref='99.000001'",[id.source])).rows[0].n,0);
  });
  await check('source lifecycle: changing cited content blocks publication/merge, retains decision snapshots and retracts DM',async()=>{
    const original=randomUUID(),card=randomUUID(),decision=randomUUID();
    await q("insert into items(id,source_id,dept_id,external_ref,content,author_ext_id) values($1,$2,$3,'200.000001','검증된 최초 원문','ULIFECYCLE')",[original,id.source,id.dept]);
    await q("insert into decision_requests(id,dept_id,origin_item_id,origin_content_version,title,background,status,slack_channel_id,slack_message_ts) values($1,$2,$3,1,'최초 카드','근거','open','DLIFECYCLE','210.000001')",[card,id.dept,original]);
    await q("insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,$3,'QA','결정','이전 근거 판단')",[decision,id.dept,id.lead]);
    await q("insert into citations(owner_kind,owner_id,item_id,quote) values('decision_request',$1,$3,'검증된 최초 원문'),('decision',$2,$3,'검증된 최초 원문')",[card,decision,original]);
    await edit('life-card-edit','211.000001','바뀐 근거',false,'200.000001');
    const current=(await q('select * from decision_requests where id=$1',[card])).rows[0];
    assert.equal(current.status,'needs_review'); assert.equal(current.source_invalidated,true);
    assert.equal((await q("select count(*)::int n from jobs where kind='send_slack' and payload->>'requestId'=$1",[card])).rows[0].n,1);
    await assert.rejects(()=>q("update decision_requests set status='open' where id=$1",[card]),e=>e.code==='40001');
    assert.equal((await q('select append_current_card_evidence($1,$2,1,$3) ok',[card,original,'검증된 최초 원문'])).rows[0].ok,false);
    await assert.rejects(()=>q("insert into decision_requests(dept_id,origin_item_id,origin_content_version,title,background,status) values($1,$2,1,'지연 카드','배경','needs_review')",[id.dept,original]),e=>e.code==='40001');
    assert.equal((await q("select quote from citations where owner_kind='decision' and owner_id=$1",[decision])).rows[0].quote,'검증된 최초 원문');
    await asUser(id.lead,async()=>assert.equal((await q("select count(*)::int n from citations where owner_kind='decision_request' and owner_id=$1",[card])).rows[0].n,0));
  });
  await check('source lifecycle: Notion snapshots use a lease, remove text, and discard late results',async()=>{
    const lease=randomUUID();
    assert.equal((await q('select begin_notion_sync($1,$2) ok',[id.notion,lease])).rows[0].ok,true);
    assert.equal((await q('select begin_notion_sync($1,$2) ok',[id.notion,randomUUID()])).rows[0].ok,false);
    const snapshot=JSON.stringify([{external_ref:'block-a',content:'원칙 A'},{external_ref:'block-b',content:'원칙 B'}]);
    assert.deepEqual((await q('select finish_notion_sync($1,$2,$3::jsonb,null) result',[id.notion,lease,snapshot])).rows[0].result,{inserted:2,updated:0,deleted:0});
    assert.equal((await q("select finish_notion_sync($1,$2,'[]'::jsonb,null) result",[id.notion,lease])).rows[0].result,null);
    const second=randomUUID(); await q('select begin_notion_sync($1,$2)',[id.notion,second]);
    assert.deepEqual((await q('select finish_notion_sync($1,$2,$3::jsonb,null) result',[id.notion,second,JSON.stringify([{external_ref:'block-a',content:'새 원칙 A'}])])).rows[0].result,{inserted:0,updated:1,deleted:1});
    const removed=(await q("select content,deleted_at from items where source_id=$1 and external_ref='block-b'",[id.notion])).rows[0];
    assert.equal(removed.content,''); assert.ok(removed.deleted_at);
  });
  await check('source lifecycle: automatic sync is lead-controlled and one pending job per source',async()=>{
    await asUser(id.member,()=>assert.rejects(()=>q('select set_notion_auto_sync($1,true)',[id.notion]),e=>e.code==='42501'));
    await asUser(id.lead,()=>q('select set_notion_auto_sync($1,true)',[id.notion]));
    assert.equal((await q('select schedule_source_syncs() n')).rows[0].n,1);
    assert.equal((await q('select schedule_source_syncs() n')).rows[0].n,0);
    await asUser(id.lead,()=>q('select set_notion_auto_sync($1,false)',[id.notion]));
  });
  await check('source lifecycle: all worker writes/tombstones are unavailable to users',async()=>{
    const names=['apply_slack_change','complete_item_classification','complete_item_embedding','begin_notion_sync','finish_notion_sync','release_notion_sync','schedule_source_syncs','fail_source_job','append_current_card_evidence'];
    for(const role of ['anon','authenticated']) {
      const rows=(await q("select has_function_privilege($1,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($2::text[])",[role,names])).rows;
      assert.equal(rows.length,names.length); assert.ok(rows.every(r=>!r.allowed));
    }
  });
}
