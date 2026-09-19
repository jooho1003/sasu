// Isolated role/RPC tests. No credentials or network access.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export async function verifyRetroConnectionsSql({db,q,check,asUser}) {
  const ids=Object.fromEntries(['org','dept','a','b','lead','demoOrg','demoDept','demoUser','day','source','otherSource','notion','item','otherItem'].map(k=>[k,randomUUID()]));
  await q("insert into orgs(id,name,is_demo) values($1,'연결 검증',false),($2,'합성 연결',true)",[ids.org,ids.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$3,'개발'),($2,$4,'체험')",[ids.dept,ids.demoDept,ids.org,ids.demoOrg]);
  for(const who of ['a','b','lead','demoUser']) {await q('insert into auth.users(id) values($1)',[ids[who]]);await q("insert into members(user_id,dept_id,role,display_name,slack_user_id,consented_at) values($1,$2,$3,'검증 사용자',$4,now())",[ids[who],who==='demoUser'?ids.demoDept:ids.dept,who==='a'||who==='b'?'member':'lead','U_RC_'+who]);}
  const scalar=async(sql,args=[])=>(await q(sql,args)).rows[0].v;
  const date=await scalar("select (now() at time zone 'Asia/Seoul')::date::text v"), at=`${date}T01:00:00Z`;
  async function service(fn){await db.exec('set role service_role');await q("select set_config('request.jwt.claim.role','service_role',false)");try{return await fn();}finally{await db.exec('reset role');await q("select set_config('request.jwt.claim.role','',false)");}}
  const rejects=(fn,message)=>assert.rejects(fn,e=>message?e.message===message:e.code==='42501');
  async function begin(who=ids.a,dept=ids.dept){const hash=createHash('sha256').update(randomUUID()).digest('hex');await asUser(who,()=>q("select begin_retro_connection($1,'github',$2,'{}','token')",[dept,hash]));return hash;}
  const complete=h=>service(()=>scalar("select complete_retro_connection($1,$2,'v2.synthetic','연결된 개인 계정',array['read']) v",[h,ids.a]));
  let connection,claim,cited;
  await check('retro connections: company snapshots require live lead role and cannot become personal evidence',async()=>{
    const hash=createHash('sha256').update(randomUUID()).digest('hex');
    await asUser(ids.b,()=>rejects(()=>q("select begin_retro_connection($1,'stibee',$2,'{}','token')",[ids.dept,hash]),'forbidden'));
    await asUser(ids.lead,async()=>{await q("select begin_retro_connection($1,'stibee',$2,'{}','token')",[ids.dept,hash]);await q("select consume_retro_connection_state($1,'stibee')",[hash]);});
    const connection=await service(()=>scalar("select complete_retro_connection($1,$2,'v2.synthetic','부서 자료','{}') v",[hash,ids.lead]));
    const claimed=await service(()=>scalar('select claim_retro_pull($1) v',[connection]));
    await service(()=>q('select save_retro_pull($1,$2,$3,$4)',[connection,claimed.lease,date,JSON.stringify([{kind:'department_snapshot',ref:'stibee:1',title:'부서 발송',text:'발송했습니다.',at,meta:{dept_context:false}}])]));
    const activity=(await q('select * from retro_activities where connection_id=$1',[connection])).rows[0];assert.equal(activity.meta.dept_context,true);
    const body=JSON.stringify({did:[{text:'제가 발송했습니다.',citations:[{activity_id:activity.id,quote:'부서 발송'}]}],learned:[],decided:[],next:[]});
    await asUser(ids.lead,()=>rejects(()=>q("select save_retro($1,0,'회고',$2,array[]::text[])",[activity.day_id,body]),'citation_invalid'));
    await q("update members set role='member' where user_id=$1 and dept_id=$2",[ids.lead,ids.dept]);
    await service(()=>rejects(()=>q('select claim_retro_pull($1)',[connection]),'forbidden'));
    await asUser(ids.lead,async()=>assert.equal((await q('select id from retro_activities where connection_id=$1',[connection])).rows.length,0));
    await asUser(ids.lead,()=>q('select revoke_retro_connection($1)',[connection]));
    await q("update members set role='lead' where user_id=$1 and dept_id=$2",[ids.lead,ids.dept]);
  });
  await check('retro connections: bulk manual request is atomic, self-only and throttled once per user',async()=>{
    const own=randomUUID(),other=randomUUID(),second=randomUUID();
    await q("insert into retro_connections(id,user_id,dept_id,provider,account_label,encrypted_secret) values($1,$3,$5,'figma','합성 개인 연결','v2.test'),($2,$4,$5,'figma','다른 계정','v2.test')",[own,other,ids.b,ids.a,ids.dept]);
    await q("insert into retro_connections(id,user_id,dept_id,provider,account_label,encrypted_secret) values($1,$2,$3,'github','합성 개인 연결','v2.test')",[second,ids.b,ids.dept]);
    await asUser(ids.b,async()=>{assert.equal(await scalar('select queue_retro_pulls($1) v',[ids.dept]),2);await rejects(()=>q('select queue_retro_pulls($1)',[ids.dept]),'rate_limited');});
    assert.equal(await scalar("select count(*)::int v from jobs where kind='retro_pull' and payload->>'connectionId'=$1",[second]),1);
    assert.equal(await scalar("select count(*)::int v from jobs where kind='retro_pull' and payload->>'connectionId'=$1",[own]),1);
    assert.equal(await scalar("select count(*)::int v from jobs where kind='retro_pull' and payload->>'connectionId'=$1",[other]),0);
    await q('delete from jobs where payload->>\'connectionId\'=any($1)',[[own,other,second]]);await q('delete from retro_connections where id=any($1)',[[own,other,second]]);
  });
  await check('retro connections: actor/provider binding, expiry, single consumption and completion',async()=>{
    const h=await begin();
    await asUser(ids.b,async()=>assert.equal(await scalar("select consume_retro_connection_state($1,'github') v",[h]),null));
    await asUser(ids.a,async()=>{assert.equal(await scalar("select consume_retro_connection_state($1,'figma') v",[h]),null);assert.equal((await scalar("select consume_retro_connection_state($1,'github') v",[h])).dept_id,ids.dept);assert.equal(await scalar("select consume_retro_connection_state($1,'github') v",[h]),null);});
    connection=await complete(h);await rejects(()=>complete(h),'invalid_state');
    const expired=await begin();await q("update private.retro_connection_states set expires_at=now()-interval '1 second' where hash=$1",[expired]);
    await asUser(ids.a,async()=>assert.equal(await scalar("select consume_retro_connection_state($1,'github') v",[expired]),null));
  });
  await check('retro connections: secret column, wildcard, private states, legacy RPC and direct writes denied',async()=>{
    await asUser(ids.a,async()=>{
      assert.equal((await q('select id,provider from retro_connections where id=$1',[connection])).rows.length,1);
      for(const sql of ['select encrypted_secret from retro_connections','select * from retro_connections','select * from private.retro_connection_states',"update retro_connections set status='active'"]) await rejects(()=>q(sql));
      await rejects(()=>q("select create_retro_connection($1,'github','label','{}','forged')",[ids.dept]));
      await rejects(()=>q('select claim_retro_pull($1)',[connection]));await rejects(()=>q("select upsert_retro_activities_as($1,$2,current_date,'[]')",[ids.a,ids.dept]));
    });
    for(const who of [ids.b,ids.lead]) await asUser(who,async()=>assert.equal((await q('select id from retro_connections where id=$1',[connection])).rows.length,0));
  });
  await check('retro connections: demo, no consent, endpoint injection, preset role and version denied',async()=>{
    await rejects(()=>begin(ids.demoUser,ids.demoDept),'demo_org');await q('update members set consented_at=null where user_id=$1',[ids.b]);await rejects(()=>begin(ids.b),'consent_required');
    await asUser(ids.a,async()=>{
      await rejects(()=>q("select begin_retro_connection($1,'github',$2,'{\"endpoint\":\"https://evil.example\"}','token')",[ids.dept,'a'.repeat(64)]),'invalid_connection');
      await rejects(()=>q("select set_retro_preset($1,'design')",[ids.dept]));await rejects(()=>q("select consent_retro_share($1,'wrong')",[ids.dept]),'invalid_consent_version');
    });
    await asUser(ids.lead,()=>q("select set_retro_preset($1,'planning')",[ids.dept]));await q('update members set consented_at=now() where user_id=$1',[ids.b]);
  });
  await check('retro connections: deterministic queue, per-user throttle, error retry and one lease',async()=>{
    let first;await asUser(ids.a,async()=>{first=await scalar('select queue_retro_pull($1,$2) v',[connection,date]);await rejects(()=>q('select queue_retro_pull($1,$2)',[connection,date]),'rate_limited');});
    await q("update retro_connections set last_requested_at=now()-interval '2 minutes',status='error' where id=$1",[connection]);
    await asUser(ids.a,async()=>assert.equal(await scalar('select queue_retro_pull($1,$2) v',[connection,date]),first));
    await asUser(ids.b,()=>rejects(()=>q('select queue_retro_pull($1,$2)',[connection,date]),'connection_not_found'));
    claim=await service(()=>scalar('select claim_retro_pull($1) v',[connection]));assert.ok(claim.lease);assert.equal(await service(()=>scalar('select claim_retro_pull($1) v',[connection])),null);
  });
  const activity={kind:'github_pr',ref:'repo:pr:1',title:'인용 가능한 변경',text:'연락처 a@example.com',at,meta:{repo:'sasu/qa',redacted:'a@example.com'}};
  const save=(rows=[activity])=>service(()=>scalar('select save_retro_pull($1,$2,$3,$4) v',[connection,claim.lease,date,JSON.stringify(rows)]));
  await check('retro connections: provider/date/200 bounds, metadata masking, stale lease and no automatic draft',async()=>{
    await rejects(()=>save([{...activity,kind:'sasu_decision'}]),'invalid_activities');await rejects(()=>save(Array.from({length:201},(_,i)=>({...activity,ref:String(i)}))),'invalid_activities');
    await rejects(()=>save([{...activity,at:'2000-01-01T00:00:00Z'}]),'invalid_date');assert.equal(await save(),1);
    ids.day=await scalar('select id v from retro_days where user_id=$1 and dept_id=$2 and retro_date=$3',[ids.a,ids.dept,date]);assert.equal(await scalar('select generation v from retro_days where id=$1',[ids.day]),0);
    const row=(await q('select * from retro_activities where day_id=$1',[ids.day])).rows[0];cited=row.id;assert.equal(row.meta.redacted,'[이메일]');assert.ok(row.text.includes('[이메일]'));assert.equal(row.connection_id,connection);assert.equal(await save(),null);
  });
  await check('retro connections: calendar records cannot claim attendance through direct SQL',async()=>{
    const id=randomUUID(); await q("insert into retro_activities(id,day_id,kind,ref,title,text,at) values($1,$2,'calendar_event','calendar-test','등록된 면접 일정','달력 일정',$3)",[id,ids.day,at]);
    const body=text=>JSON.stringify({did:[{text,citations:[{activity_id:id,quote:'등록된 면접 일정'}]}],learned:[],decided:[],next:[]});
    await rejects(()=>q("select private.retro_validate($1,'일정',$2,array[]::text[])",[ids.day,body('면접에 참석했습니다.')]),'citation_invalid');
    await q("select private.retro_validate($1,'일정',$2,array[]::text[])",[ids.day,body('등록된 면접 일정을 확인했습니다.')]);
    await q('delete from retro_activities where id=$1',[id]);
  });
  await check('retro connections: note ownership, 20 cap, kind and masking',async()=>{
    await asUser(ids.b,()=>rejects(()=>q("select add_retro_note($1,'manual_note','본인 기록')",[ids.day]),'retro_not_found'));
    await asUser(ids.a,async()=>{for(let i=0;i<20;i++) await q("select add_retro_note($1,'manual_note','한 줄 010-1234-5678')",[ids.day]);await rejects(()=>q("select add_retro_note($1,'manual_note','초과')",[ids.day]),'note_limit');await rejects(()=>q("select add_retro_note($1,'slack_message','위조')",[ids.day]),'invalid_note');});
    assert.ok((await scalar("select text v from retro_activities where day_id=$1 and kind='manual_note' limit 1",[ids.day])).includes('[전화번호]'));
  });
  await check('retro connections: separate sharing consent and withdrawal',async()=>{
    const body={did:[{text:'변경을 완료했습니다.',citations:[{activity_id:cited,quote:activity.title}]}],learned:[],decided:[],next:[]};
    await asUser(ids.a,async()=>{await q("select save_retro($1,0,'오늘 회고',$2,array['개발'])",[ids.day,JSON.stringify(body)]);await q('select confirm_retro($1,1)',[ids.day]);await rejects(()=>q("select set_retro_visibility($1,'dept')",[ids.day]),'share_consent_required');await q('select consent_retro_share($1)',[ids.dept]);await q("select set_retro_visibility($1,'dept')",[ids.day]);});
    await asUser(ids.b,async()=>assert.equal((await q('select id from retro_days where id=$1',[ids.day])).rows.length,1));
    await asUser(ids.a,()=>q('select withdraw_retro_share($1)',[ids.dept]));assert.equal(await scalar('select visibility v from retro_days where id=$1',[ids.day]),'self');
  });
  await check('retro connections: cited input immutable; revoke deletes only this connection and fences in-flight work',async()=>{
    claim=await service(()=>scalar('select claim_retro_pull($1) v',[connection]));await save([{...activity,title:'바뀐 제목'}]);assert.equal(await scalar('select title v from retro_activities where id=$1',[cited]),activity.title);
    claim=await service(()=>scalar('select claim_retro_pull($1) v',[connection]));await asUser(ids.a,()=>q('select revoke_retro_connection($1)',[connection]));
    assert.equal(await scalar('select encrypted_secret v from retro_connections where id=$1',[connection]),'');assert.equal(await scalar('select count(*)::int v from retro_activities where connection_id=$1',[connection]),0);assert.equal(await scalar("select count(*)::int v from retro_activities where day_id=$1 and kind='manual_note'",[ids.day]),20);assert.equal(await save(),null);
    assert.equal(await service(()=>scalar("select fail_retro_pull($1,$2,'connector_failed') v",[connection,claim.lease])),false);
    await asUser(ids.a,async()=>assert.equal((await q('select * from retro_revisions where day_id=$1',[ids.day])).rows.length,0));
  });
  await check('retro connections: derived activity is self-only, department context cannot be cited, permissions stay live',async()=>{
    await q("insert into sources(id,dept_id,kind,title,visibility,external_id) values($1,$3,'slack_channel','공개 채널','dept','qa-channel'),($2,$3,'notion_page','부서 문서','dept','qa-notion')",[ids.source,ids.notion,ids.dept]);await q('update sources set last_synced_at=$2 where id=$1',[ids.notion,at]);
    for(const [id,author] of [[ids.item,'U_RC_a'],[ids.otherItem,'U_RC_b']]) await q("insert into items(id,dept_id,source_id,external_ref,author_ext_id,content,spoken_at) values($1::uuid,$2,$3,$1::uuid::text,$4,'오늘 변경했습니다.',$5)",[id,ids.dept,ids.source,author,at]);
    await asUser(ids.a,async()=>{
      await q("select create_retro_day($1,$2,$3,'Asia/Seoul','test','{\"activities\":[]}')",[ids.dept,ids.day,date]);const rows=(await q('select kind,ref from retro_activities where day_id=$1',[ids.day])).rows;assert.ok(rows.some(r=>r.ref===ids.item));assert.ok(!rows.some(r=>r.ref===ids.otherItem));
      const context=await scalar("select id v from retro_activities where day_id=$1 and kind='notion_page_changed'",[ids.day]);const body={did:[{text:'제가 문서를 고쳤습니다.',citations:[{activity_id:context,quote:'부서 문서'}]}],learned:[],decided:[],next:[]};await rejects(()=>q("select save_retro($1,2,'잘못된 귀속',$2,array[]::text[])",[ids.day,JSON.stringify(body)]),'citation_invalid');
    });
    await q("update sources set visibility='leads_only' where id=$1",[ids.source]);await asUser(ids.a,async()=>assert.equal((await q('select id from retro_activities where day_id=$1 and ref=$2',[ids.day,ids.item])).rows.length,0));
  });
  await check('retro connections: 0050 + 0049 rollback preserves phase 27 and decision records',async()=>{
    await db.exec('begin');
    try {
      await db.exec(readFileSync('supabase/rollback/0050_retro_connection_boundaries_down.sql','utf8'));
      await db.exec(readFileSync('supabase/rollback/0049_retro_connections_down.sql','utf8'));
      assert.equal(await scalar("select to_regclass('public.retro_connections') v"),null);
      assert.equal(await scalar("select to_regclass('private.retro_connection_states') v"),null);
      assert.ok(await scalar("select to_regclass('public.retro_days') v"));assert.ok(await scalar("select to_regclass('public.decisions') v"));
      await asUser(ids.a,()=>q("select create_retro_day($1,$2,$3,'Asia/Seoul','rollback-test','{\"activities\":[]}')",[ids.dept,randomUUID(),date]));
    } finally {await db.exec('rollback');}
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {const run=spawnSync(process.execPath,[fileURLToPath(new URL('./verify-security-sql.mjs',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});process.exitCode=run.status??1;}
