import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifySlackAskSql({ q, check, asUser }) {
  const ids = Object.fromEntries(['org','dept','otherDept','lead','member','other','source','item','secret'].map(k => [k,randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Slack QA')",[ids.org]);
  await q("insert into departments(id,org_id,name) values($1,$3,'QA 영업'),($2,$3,'QA 개발')",[ids.dept,ids.otherDept,ids.org]);
  await q("insert into auth.users(id) values($1),($2),($3)",[ids.lead,ids.member,ids.other]);
  await q("insert into members(user_id,dept_id,role,slack_user_id,display_name,consented_at) values($1,$4,'lead','UQALEAD','QA 리드',now()),($2,$4,'member','UQAMEMBER','QA 멤버',now()),($3,$5,'lead','UQAOTHER','다른 리드',now())",[ids.lead,ids.member,ids.other,ids.dept,ids.otherDept]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility,active) values($1,$2,'slack_channel','CQAASK','dept',true)",[ids.source,ids.dept]);
  await q("insert into items(id,source_id,dept_id,content) values($1,$2,$3,'오늘 배포합니다.')",[ids.item,ids.source,ids.dept]);
  const ingest = async (event, user='UQALEAD', channel='DQAASK', dept=ids.dept, dm=true) => (await q("select ingest_slack_question($1,$2,$3,'1.1',$4,'오늘 배포할까요?',$5) result",[event,user,channel,dept,dm])).rows[0].result;
  const claim = async (answer, lease=randomUUID()) => ({ lease, result:(await q("select claim_slack_answer_delivery($1,$2) result",[answer,lease])).rows[0].result });
  await check('Slack ASK: direct users cannot invoke ingestion or delivery RPCs or access delivery rows',async () => {
    const names=['slack_question_context','ingest_slack_question','claim_slack_answer_delivery','record_slack_answer_message','finish_slack_answer_delivery','release_slack_answer_delivery','enqueue_slack_answer_delivery'];
    for (const role of ['anon','authenticated']) {
      const rows=(await q("select proname,has_function_privilege($1,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($2::text[])",[role,names])).rows;
      assert.equal(rows.length,names.length); assert.ok(rows.every(r=>!r.allowed));
      assert.equal((await q("select has_table_privilege($1,'slack_answer_deliveries','SELECT') allowed",[role])).rows[0].allowed,false);
    }
  });
  await check('Slack ASK: context contains only own departments and active connected channels',async () => {
    const context=async (u,c,dm)=>(await q('select slack_question_context($1,$2,$3) result',[u,c,dm])).rows[0].result;
    assert.equal((await context('UQALEAD','DQAASK',true))[0].id,ids.dept);
    assert.deepEqual(await context('UQAOTHER','CQAASK',false),[]);
    assert.deepEqual(await context('UQALEAD','CUNKNOWN',false),[]);
    assert.deepEqual(await context('UQALEAD','CQAASK',true),[]);
  });
  await check('Slack ASK: a single identity supports multiple memberships without impersonation',async () => {
    await q("insert into members(user_id,dept_id,role,slack_user_id,display_name,consented_at) values($1,$2,'member','UQALEAD','QA 리드',now())",[ids.lead,ids.otherDept]);
    const ctx=(await q("select slack_question_context('UQALEAD','DQAASK',true) result")).rows[0].result;
    assert.equal(ctx.length,2);
    await assert.rejects(()=>q("update members set slack_user_id='UQALEAD' where user_id=$1",[ids.other]),e=>e.code==='23505');
    await q('delete from members where user_id=$1 and dept_id=$2',[ids.lead,ids.otherDept]);
  });
  await check('Slack ASK: forged department and unconsented requests write no answers/events',async () => {
    assert.equal((await ingest('qa-cross','UQALEAD','DQAASK',ids.otherDept)).status,'not_connected');
    await q('update members set consented_at=null where user_id=$1',[ids.member]);
    assert.equal((await ingest('qa-consent','UQAMEMBER')).status,'consent_required');
    assert.equal((await q("select count(*)::int n from ingest_events where event_id in ('qa-cross','qa-consent')")).rows[0].n,0);
    await q('update members set consented_at=now() where user_id=$1',[ids.member]);
  });
  let answer;
  await check('Slack ASK: duplicate event creates one answer and two initial jobs',async () => {
    const first=await ingest('qa-dm'); answer=first.answer_id;
    assert.equal(first.status,'saved'); assert.equal((await ingest('qa-dm')).status,'duplicate');
    assert.equal((await q("select count(*)::int n from jobs where payload->>'answerId'=$1",[answer])).rows[0].n,2);
    const reply=(await q("select payload->'slackReply' reply from jobs where kind='answer' and payload->>'answerId'=$1",[answer])).rows[0].reply;
    assert.equal(reply.scope,'user'); assert.equal(reply.durable,true);
  });
  await check('Slack ASK: progress lease serializes jobs and rejects stale completion',async () => {
    const first=await claim(answer); assert.equal(first.result.status,'pending');
    assert.equal((await claim(answer)).result.busy,true);
    assert.equal((await q("select record_slack_answer_message($1,$2,'2.2') result",[answer,first.lease])).rows[0].result,true);
    assert.equal((await q("select finish_slack_answer_delivery($1,$2,'2.2',false) result",[answer,randomUUID()])).rows[0].result,false);
    assert.equal((await q("select finish_slack_answer_delivery($1,$2,'2.2',false) result",[answer,first.lease])).rows[0].result,true);
  });
  await check('Slack ASK: completion atomically queues delivery and revalidates quote',async () => {
    await q("select complete_answer($1,'오늘 배포합니다.',false,null,$2::jsonb)",[answer,JSON.stringify([{item_id:ids.item,decision_id:null,quote:'오늘 배포합니다.'}])]);
    assert.equal((await q("select count(*)::int n from jobs where kind='deliver_slack_answer' and payload->>'answerId'=$1",[answer])).rows[0].n,2);
    const c=await claim(answer); assert.equal(c.result.status,'done'); assert.equal(c.result.citations.length,1);
    await asUser(ids.lead,async()=>assert.equal((await q('select id from answers where id=$1',[answer])).rows.length,1));
    await q("select release_slack_answer_delivery($1,$2,'slack_rate_limited')",[answer,c.lease]);
    await q("update items set content='원문 수정됨' where id=$1",[ids.item]);
    const stale=await claim(answer); assert.equal(stale.result.status,'refused'); assert.equal(stale.result.answer,null); assert.deepEqual(stale.result.citations,[]);
    await asUser(ids.lead,async()=>assert.equal((await q('select id from answers where id=$1',[answer])).rows.length,0));
    await q("select release_slack_answer_delivery($1,$2,'slack_api_failed')",[answer,stale.lease]);
    await q("update items set content='오늘 배포합니다.' where id=$1",[ids.item]);
  });
  await check('Slack ASK: channel delivery rejects leads_only sources even for lead questioner',async () => {
    const channel=(await ingest('qa-channel','UQALEAD','CQAASK',ids.dept,false)).answer_id;
    await q("select complete_answer($1,'오늘 배포합니다.',false,null,$2::jsonb)",[channel,JSON.stringify([{item_id:ids.item,decision_id:null,quote:'오늘 배포합니다.'}])]);
    await q("update sources set visibility='leads_only' where id=$1",[ids.source]);
    const c=await claim(channel); assert.equal(c.result.status,'refused'); assert.equal(c.result.answer,null);
    const dm=await claim(answer); assert.equal(dm.result.status,'done');
    await q("select release_slack_answer_delivery($1,$2,'slack_api_failed')",[answer,dm.lease]);
    await q("update sources set visibility='dept' where id=$1",[ids.source]);
  });
  await check('Slack ASK: consent withdrawal cancels retry without disclosing stored answer',async () => {
    await q('update members set consented_at=null where user_id=$1',[ids.lead]);
    assert.equal((await claim(answer)).result,null);
    assert.equal((await q('select state from slack_answer_deliveries where answer_id=$1',[answer])).rows[0].state,'cancelled');
    await q('update members set consented_at=now() where user_id=$1',[ids.lead]);
  });
  await check('Slack ASK: timeout status schedules failure-message delivery',async () => {
    const a=(await ingest('qa-timeout')).answer_id;
    await q("update answers set status='failed',error_code='llm_timeout' where id=$1",[a]);
    assert.equal((await q("select count(*)::int n from jobs where kind='deliver_slack_answer' and payload->>'answerId'=$1",[a])).rows[0].n,2);
    assert.equal((await claim(a)).result.status,'failed');
  });
  await check('Slack ASK: failed delivery can be retried only by its questioner, with no new LLM job',async () => {
    const a=(await ingest('qa-retry')).answer_id;
    await q("update answers set status='failed' where id=$1",[a]);
    await q("update slack_answer_deliveries set message_ts='2.2',last_error='slack_message_missing' where answer_id=$1",[a]);
    await q("update jobs set status='failed',attempts=3 where id=md5('slack-result:'||$1)::uuid",[a]);
    await asUser(ids.member,async()=>{
      assert.deepEqual((await q('select my_slack_questions($1) result',[ids.dept])).rows[0].result,[]);
      await assert.rejects(()=>q('select retry_my_slack_answer($1,$2)',[ids.dept,a]),e=>e.code==='42501');
    });
    await asUser(ids.lead,async()=>{
      assert.ok((await q('select my_slack_questions($1) result',[ids.dept])).rows[0].result.some(r=>r.id===a));
      assert.equal((await q('select retry_my_slack_answer($1,$2) result',[ids.dept,a])).rows[0].result,true);
      assert.equal((await q('select retry_my_slack_answer($1,$2) result',[ids.dept,a])).rows[0].result,false);
    });
    assert.equal((await q("select count(*)::int n from jobs where kind='answer' and payload->>'answerId'=$1",[a])).rows[0].n,1);
    assert.equal((await q('select message_ts from slack_answer_deliveries where answer_id=$1',[a])).rows[0].message_ts,null);
  });
  await check('Slack ASK: demo organization creates no question/delivery/jobs',async () => {
    await q('update orgs set is_demo=true where id=$1',[ids.org]);
    assert.equal((await ingest('qa-demo')).status,'not_connected');
    assert.equal((await q("select count(*)::int n from ingest_events where event_id='qa-demo'")).rows[0].n,0);
    await q('update orgs set is_demo=false where id=$1',[ids.org]);
  });
}
