import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyDecisionFollowupSql({q,check,asUser}) {
  const runAs = async (user, fn) => { let value; await asUser(user, async () => { value = await fn(); }); return value; };
  const id=Object.fromEntries(['org','dept','lead','member','stranger','source','item','decision','corrected','card'].map(k=>[k,randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Followup QA')",[id.org]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Followup')",[id.dept,id.org]);
  await q('insert into auth.users(id) values($1),($2),($3)',[id.lead,id.member,id.stranger]);
  await q("insert into members(user_id,dept_id,role,display_name,slack_user_id,consented_at) values($1,$4,'lead','Lead','UFOLLOWLEAD',now()),($2,$4,'member','Member','UFOLLOWMEMBER',now()),($3,$4,'member','Other','UFOLLOWOTHER',now())",[id.lead,id.member,id.stranger,id.dept]);
  await q("insert into sources(id,dept_id,kind,external_id,active) values($1,$2,'slack_channel','CFOLLOW',true)",[id.source,id.dept]);
  await q("insert into items(id,dept_id,source_id,content) values($1,$2,$3,'기존 근거')",[id.item,id.dept,id.source]);
  await q("insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,$3,'Member','이전 결과','이전 사유')",[id.decision,id.dept,id.member]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values('decision',$1,$2,'기존 근거')",[id.decision,id.item]);
  const correct=(user,previous=id.decision,next=id.corrected)=>runAs(user,()=>q('select correct_decision($1,$2,$3,$4,$5) id',[id.dept,previous,next,'정정 결과','정정 사유']));
  await check('decision followup: only author/lead can append a correction and retry is idempotent',async()=>{
    await assert.rejects(()=>correct(id.stranger),e=>e.code==='42501');
    assert.equal((await correct(id.member)).rows[0].id,id.corrected);
    assert.equal((await correct(id.member)).rows[0].id,id.corrected);
    await assert.rejects(()=>correct(id.lead,id.decision,randomUUID()),e=>e.code==='23505');
    assert.equal((await q('select outcome from decisions where id=$1',[id.decision])).rows[0].outcome,'이전 결과');
    assert.equal((await q("select quote from citations where owner_kind='decision' and owner_id=$1",[id.corrected])).rows[0].quote,'기존 근거');
    assert.equal((await q("select count(*)::int n from jobs where kind='embed_decision' and payload->>'decisionId'=$1",[id.corrected])).rows[0].n,1);
  });
  await check('decision followup: correction respects narrowed source visibility',async()=>{
    await q("update sources set visibility='leads_only' where id=$1",[id.source]);
    await assert.rejects(()=>correct(id.member,id.corrected,randomUUID()),e=>e.code==='42501');
    const next=randomUUID(); await correct(id.lead,id.corrected,next);
    assert.equal((await q('select visibility from decisions where id=$1',[next])).rows[0].visibility,'leads_only');
    await q("update sources set visibility='dept' where id=$1",[id.source]);
  });
  await q("insert into decision_requests(id,dept_id,origin_item_id,title,background,assignee_id,status) values($1,$2,$3,'알림 카드','근거 배경',$4,'open')",[id.card,id.dept,id.item,id.member]);
  await check('decision followup: corrections copy card-owned citations and fresh retrieval excludes superseded decisions',async()=>{
    const decided=randomUUID(),corrected=randomUUID();
    await q("insert into citations(owner_kind,owner_id,item_id,quote) values('decision_request',$1,$2,'기존 근거')",[id.card,id.item]);
    await q("insert into decisions(id,dept_id,request_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,$3,$4,'Member','카드 결정','사유')",[decided,id.dept,id.card,id.member]);
    await correct(id.member,decided,corrected);
    assert.equal((await q("select quote from citations where owner_kind='decision' and owner_id=$1",[corrected])).rows[0].quote,'기존 근거');
    await asUser(id.member,async()=>assert.equal((await q('select id from recent_decisions_as($1,$2,20)',[id.member,id.dept])).rows.some(r=>r.id===decided),false));
    const cardPrecedents=(await q('select id from recent_decisions_for_card($1,20)',[id.dept])).rows;
    assert.equal(cardPrecedents.some(r=>r.id===decided),false);
    assert.equal(cardPrecedents.some(r=>r.id===corrected),true);
    for(const role of ['anon','authenticated']) assert.equal((await q("select has_function_privilege($1,'recent_decisions_for_card(uuid,integer)','EXECUTE') allowed",[role])).rows[0].allowed,false);
  });
  const schedule=(user,at)=>runAs(user,()=>q('select set_card_reminder($1,$2) id',[id.card,at]));
  let reminder;
  await check('decision followup: reminders reject other members and past times, allow reschedule/cancel',async()=>{
    const future=new Date(Date.now()+3600000).toISOString();
    await assert.rejects(()=>schedule(id.stranger,future),e=>e.code==='42501');
    await assert.rejects(()=>schedule(id.member,'2000-01-01'),e=>e.code==='22023');
    reminder=(await schedule(id.member,future)).rows[0].id;
    await schedule(id.member,null);
    assert.equal((await q('select state from card_reminders where id=$1',[reminder])).rows[0].state,'cancelled');
    await schedule(id.lead,future);
    assert.equal((await q('select generation from card_reminders where id=$1',[reminder])).rows[0].generation,3);
  });
  await check('decision followup: due scheduler deduplicates and claims current consenting assignee',async()=>{
    await q("update card_reminders set scheduled_for=now()-interval '1 minute' where id=$1",[reminder]);
    await q('select schedule_card_reminders()'); await q('select schedule_card_reminders()');
    assert.equal((await q("select count(*)::int n from jobs where kind='send_reminder' and payload->>'reminderId'=$1",[reminder])).rows[0].n,1);
    assert.equal((await q('select claim_card_reminder($1,1,$2) value',[reminder,randomUUID()])).rows[0].value,null);
    await q('update decision_requests set assignee_id=$2 where id=$1',[id.card,id.lead]);
    const lease=randomUUID();
    assert.equal((await q('select claim_card_reminder($1,3,$2) value',[reminder,lease])).rows[0].value.slackUserId,'UFOLLOWLEAD');
    assert.equal((await q('select claim_card_reminder($1,3,$2) value',[reminder,randomUUID()])).rows[0].value.busy,true);
    assert.equal((await q('select finish_card_reminder($1,3,$2,true,null) ok',[reminder,randomUUID()])).rows[0].ok,false);
    assert.equal((await q('select finish_card_reminder($1,3,$2,true,null) ok',[reminder,lease])).rows[0].ok,true);
  });
  await check('decision followup: withdrawn consent cancels reminders and deadlines only queue once',async()=>{
    await q("update decision_requests set deadline=now()-interval '1 minute' where id=$1",[id.card]);
    await q('select schedule_card_reminders()'); await q('select schedule_card_reminders()');
    const deadline=(await q("select * from card_reminders where request_id=$1 and kind='deadline'",[id.card])).rows[0];
    assert.equal((await q("select count(*)::int n from jobs where kind='send_reminder' and payload->>'reminderId'=$1",[deadline.id])).rows[0].n,1);
    await q('update members set consented_at=null where user_id=$1',[id.lead]);
    assert.equal((await q('select claim_card_reminder($1,1,$2) value',[deadline.id,randomUUID()])).rows[0].value,null);
    assert.equal((await q('select state from card_reminders where id=$1',[deadline.id])).rows[0].state,'cancelled');
  });
  await check('decision followup: reminder RPCs and storage cannot be forged by users',async()=>{
    for(const role of ['anon','authenticated']) {
      const rows=(await q("select has_function_privilege($1,p.oid,'EXECUTE') allowed from pg_proc p where proname=any($2::text[])",[role,['schedule_card_reminders','claim_card_reminder','finish_card_reminder','reminder_job_failed']])).rows;
      assert.equal(rows.length,4); assert.ok(rows.every(r=>!r.allowed));
      assert.equal((await q("select has_table_privilege($1,'card_reminders','INSERT') allowed",[role])).rows[0].allowed,false);
    }
  });
}
