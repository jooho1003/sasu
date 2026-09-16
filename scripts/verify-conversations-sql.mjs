import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyConversationsSql({q,check,asUser}) {
  const id=Object.fromEntries(['org','dept','otherDept','user','other'].map(k=>[k,randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Conversation QA')",[id.org]);
  await q("insert into departments(id,org_id,name) values($1,$3,'Conversation'),($2,$3,'Other')",[id.dept,id.otherDept,id.org]);
  await q('insert into auth.users(id) values($1),($2)',[id.user,id.other]);
  await q("insert into members(user_id,dept_id,role,display_name,slack_user_id,consented_at) values($1,$3,'lead','QA','UCONV',now()),($2,$3,'member','Other','UCONVOTHER',now()),($1,$4,'member','QA','UCONV',now())",[id.user,id.other,id.dept,id.otherDept]);
  const runAs=async(user,fn)=>{let out;await asUser(user,async()=>{out=await fn()});return out;};
  const ask=async(user,dept,parent=null)=>(await runAs(user,()=>q('select ask_question($1,$2,$3) value',[dept,'계약 승인 기준이 무엇인가요?',parent]))).rows[0].value;
  let root,child;
  await check('conversations: web ASK queues atomically and history is actor/dept-bound',async()=>{
    root=await ask(id.user,id.dept); await ask(id.other,id.dept); await ask(id.user,id.otherDept);
    assert.equal((await q('select kind from jobs where id=$1',[root.job_id])).rows[0].kind,'answer');
    const history=await runAs(id.user,()=>q('select * from my_question_history($1)',[id.dept]));
    assert.deepEqual(history.rows.map(r=>r.id),[root.answer_id]);
    await assert.rejects(()=>ask(id.other,id.dept,root.answer_id),e=>e.code==='42501');
    await assert.rejects(()=>ask(id.user,id.otherDept,root.answer_id),e=>e.code==='42501');
    await assert.rejects(()=>ask(id.user,id.dept,root.answer_id),e=>e.code==='42501');
    await q("update answers set status='refused',refused=true where id=$1",[root.answer_id]);
    child=await ask(id.user,id.dept,root.answer_id);
    assert.equal((await q('select parent_id from answers where id=$1',[child.answer_id])).rows[0].parent_id,root.answer_id);
  });
  await check('conversations: followup only supplies previous questions, never old answers/evidence',async()=>{
    const context=(await q("select answer_conversation_context($1,'user') value",[child.answer_id])).rows[0].value;
    assert.deepEqual(context,[{question:'계약 승인 기준이 무엇인가요?'}]);
    assert.deepEqual((await q("select answer_conversation_context($1,'channel') value",[child.answer_id])).rows[0].value,[]);
    await q('update members set consented_at=null where user_id=$1 and dept_id=$2',[id.user,id.dept]);
    assert.deepEqual((await q("select answer_conversation_context($1,'user') value",[child.answer_id])).rows[0].value,[]);
    await assert.rejects(()=>ask(id.user,id.dept),e=>e.code==='42501');
    await q('update members set consented_at=now() where user_id=$1 and dept_id=$2',[id.user,id.dept]);
  });
  await check('conversations: Slack thread continuity never crosses users, channels or departments',async()=>{
    const ingest=async(event,author,channel,thread,dept)=>(await q('select ingest_slack_question($1,$2,$3,$4,$5,$6,true) value',[event,author,channel,thread,dept,'다음 승인 절차는 무엇인가요?'])).rows[0].value.answer_id;
    const a=await ingest('conv-first','UCONV','DCONV','123.001',id.dept);
    await q("update answers set status='refused',refused=true where id=$1",[a]);
    const b=await ingest('conv-next','UCONV','DCONV','123.001',id.dept);
    assert.equal((await q('select parent_id from answers where id=$1',[b])).rows[0].parent_id,a);
    for(const [event,author,channel,thread,dept] of [
      ['conv-other-user','UCONVOTHER','DCONV','123.001',id.dept],
      ['conv-other-channel','UCONV','DOTHER','123.001',id.dept],
      ['conv-other-thread','UCONV','DCONV','456.001',id.dept],
      ['conv-other-dept','UCONV','DCONV','123.001',id.otherDept],
    ]) {
      const next=await ingest(event,author,channel,thread,dept);
      assert.equal((await q('select parent_id from answers where id=$1',[next])).rows[0].parent_id,null);
    }
  });
  await check('conversations: history keyset pagination has no duplicates for identical timestamps',async()=>{
    for(let n=0;n<23;n++) await ask(id.other,id.dept);
    const first=(await runAs(id.other,()=>q('select * from my_question_history($1)',[id.dept]))).rows;
    assert.equal(first.length,21);
    const edge=first[19];
    const second=(await runAs(id.other,()=>q('select * from my_question_history($1,$2,$3)',[id.dept,edge.created_at,edge.id]))).rows;
    assert.ok(second.length>0); assert.ok(second.every(r=>!first.slice(0,20).some(x=>x.id===r.id)));
  });
}
