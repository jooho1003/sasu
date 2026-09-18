import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyNotionPollSql({ db, q, check }) {
  await check("notion poll: active non-demo installation schedules bulk poll and daily idle reconciliation", async () => {
    await db.exec("begin");
    try {
      const org=randomUUID(), dept=randomUUID(), root=randomUUID();
      await q("insert into orgs(id,name) values($1,'poll org')",[org]);
      await q("insert into departments(id,org_id,name) values($1,$2,'poll dept')",[dept,org]);
      await q("insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at,next_poll_at,next_reconcile_at) values($1,$2,'bot','oauth','v1.synthetic',now(),now()-interval '1 minute',now()-interval '1 minute')",[org,`poll-${org}`]);
      await q("insert into notion_roots(id,org_id,dept_id,scope,state,created_role) values($1,$2,$3,'workspace','idle','org_admin')",[root,org,dept]);
      await db.exec("set role service_role");
      await q("select schedule_notion_polls()");
      const jobs=(await q("select kind,lane,payload from jobs where (kind='notion_poll' or kind='notion_discover') and payload->>'rootId'=$1",[root])).rows;
      assert.ok(jobs.some(row=>row.kind==='notion_poll'&&row.lane==='bulk'));
      assert.ok(jobs.some(row=>row.kind==='notion_discover'&&row.lane==='bulk'&&row.payload.reconcile===true));
      assert.equal((await q("select next_poll_at>now() advanced from notion_installations where org_id=$1",[org])).rows[0].advanced,true);
    } finally { await db.exec("reset role").catch(()=>undefined); await db.exec("rollback"); }
  });

  await check("notion poll: inactive or demo installations schedule no jobs and worker RPCs are service-only", async () => {
    const names=["schedule_notion_polls()","claim_notion_poll(uuid,uuid)","save_notion_poll_cursor(uuid,uuid,text,integer,timestamp with time zone)","finish_notion_poll(uuid,uuid,timestamp with time zone)","poll_notion_page(uuid,text,text,timestamp with time zone,text)","claim_notion_reconcile(uuid,uuid)","reconcile_notion_page(uuid,uuid,text,text,timestamp with time zone,text,timestamp with time zone)","finish_notion_reconcile(uuid,uuid,timestamp with time zone)"];
    for (const name of names) for (const role of ["anon","authenticated","service_role"])
      assert.equal((await q("select has_function_privilege($1,$2,'execute') allowed",[role,name])).rows[0].allowed,role==="service_role",`${role} ${name}`);
  });

  await check("notion poll: demo organizations schedule zero poll or reconcile jobs", async () => {
    await db.exec("begin");
    try {
      const org=randomUUID(), dept=randomUUID(), root=randomUUID();
      await q("insert into orgs(id,name,is_demo) values($1,'demo poll org',true)",[org]);
      await q("insert into departments(id,org_id,name) values($1,$2,'demo poll dept')",[dept,org]);
      await q("insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at,next_poll_at,next_reconcile_at) values($1,$2,'bot','oauth','v1.synthetic',now(),now()-interval '1 minute',now()-interval '1 minute')",[org,`demo-poll-${org}`]);
      await q("insert into notion_roots(id,org_id,dept_id,scope,state,created_role) values($1,$2,$3,'workspace','idle','org_admin')",[root,org,dept]);
      await db.exec("set role service_role");
      await q("select schedule_notion_polls()");
      assert.equal((await q("select count(*)::int count from jobs where payload->>'rootId'=$1",[root])).rows[0].count,0);
    } finally { await db.exec("reset role").catch(()=>undefined); await db.exec("rollback"); }
  });

  await check("notion poll: changed and same-minute pages queue bulk imports, new children honor include_new", async () => {
    await db.exec("begin");
    try {
      const org=randomUUID(), dept=randomUUID(), root=randomUUID(), closedRoot=randomUUID();
      const changed=randomUUID(), sameMinute=randomUUID(), parent=randomUUID(), database=randomUUID(), closedParent=randomUUID();
      await q("insert into orgs(id,name) values($1,'poll behavior org')",[org]);
      await q("insert into departments(id,org_id,name) values($1,$2,'poll behavior dept')",[dept,org]);
      await q("insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at) values($1,$2,'bot','oauth','v1.synthetic',now())",[org,`behavior-${org}`]);
      await q("insert into notion_roots(id,org_id,dept_id,scope,notion_id,notion_kind,state,created_role,include_new,last_discovered_at) values($1,$2,$3,'workspace',null,null,'idle','org_admin',true,null),($4,$2,$3,'subtree','closed-root','page','idle','lead',false,now())",[root,org,dept,closedRoot]);
      await q("insert into sources(id,dept_id,kind,external_id,active,import_version,ingest_mode,root_id,remote_edited_at,last_synced_at,parent_external_id) values($1,$6,'notion_page','changed',true,2,'reference',$7,now()-interval '10 minutes',now()-interval '9 minutes',null),($2,$6,'notion_page','same-minute',true,2,'reference',$7,date_trunc('minute',now()),now(),null),($3,$6,'notion_page','parent',true,2,'reference',$7,now(),now(),null),($4,$6,'notion_page','database-parent',true,2,'reference',$7,now(),now(),null),($5,$6,'notion_page','closed-parent',true,2,'reference',$8,now(),now(),'closed-root')",[changed,sameMinute,parent,database,closedParent,dept,root,closedRoot]);
      await db.exec("set role service_role");
      assert.equal((await q("select poll_notion_page($1,'changed',null,now(),'changed') status",[root])).rows[0].status,"import");
      assert.equal((await q("select poll_notion_page($1,'same-minute',null,date_trunc('minute',now()),'same') status",[root])).rows[0].status,"import");
      // 편집 시각과 마지막 수집이 같은 분이면, 폴링이 그 분을 지나서 돌아도 한 번 더 읽는다.
      await q("insert into sources(dept_id,kind,external_id,active,import_version,ingest_mode,root_id,remote_edited_at,last_synced_at) values($1,'notion_page','same-minute-late',true,2,'reference',$2,date_trunc('minute',now())-interval '7 minutes',date_trunc('minute',now())-interval '7 minutes'+interval '40 seconds')",[dept,root]);
      assert.equal((await q("select poll_notion_page($1,'same-minute-late',null,date_trunc('minute',now())-interval '7 minutes','same') status",[root])).rows[0].status,"import");
      // 이미 다음 분에 다시 수집했으면 더 읽지 않는다.
      await q("update sources set last_synced_at=date_trunc('minute',now())-interval '6 minutes' where external_id='same-minute-late' and dept_id=$1",[dept]);
      await q("delete from jobs where kind='notion_import' and payload->>'sourceId' in (select id::text from sources where external_id='same-minute-late' and dept_id=$1)",[dept]);
      assert.equal((await q("select poll_notion_page($1,'same-minute-late',null,date_trunc('minute',now())-interval '7 minutes','same') status",[root])).rows[0].status,"skip");
      assert.equal((await q("select poll_notion_page($1,'new-child','parent',now(),'new') status",[root])).rows[0].status,"import");
      assert.equal((await q("select poll_notion_page($1,'new-row','database-parent',now(),'row') status",[root])).rows[0].status,"import");
      assert.equal((await q("select poll_notion_page($1,'closed-child','closed-parent',now(),'closed') status",[closedRoot])).rows[0].status,"skip");
      const newChild=(await q("select id from sources where dept_id=$1 and external_id='new-child' and active",[dept])).rows[0].id;
      const newRow=(await q("select id from sources where dept_id=$1 and external_id='new-row' and active",[dept])).rows[0].id;
      const jobs=(await q("select payload->>'sourceId' source_id,lane from jobs where kind='notion_import' and payload->>'sourceId' in ($1,$2,$3,$4)",[changed,sameMinute,newChild,newRow])).rows;
      assert.equal(jobs.length,4);
      assert.ok(jobs.every(row=>row.lane==="bulk"));
      assert.equal((await q("select count(*)::int count from sources where dept_id=$1 and external_id='closed-child' and active",[dept])).rows[0].count,0);
    } finally { await db.exec("reset role").catch(()=>undefined); await db.exec("rollback"); }
  });

  await check("notion poll: cursor offset resumes without advancing the watermark", async () => {
    await db.exec("begin");
    try {
      const org=randomUUID(), dept=randomUUID(), root=randomUUID(), firstLease=randomUUID(), secondLease=randomUUID();
      await q("insert into orgs(id,name) values($1,'poll resume org')",[org]);
      await q("insert into departments(id,org_id,name) values($1,$2,'poll resume dept')",[dept,org]);
      await q("insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at,poll_watermark) values($1,$2,'bot','oauth','v1.synthetic',now(),'2026-09-18T00:00:00Z')",[org,`resume-${org}`]);
      await q("insert into notion_roots(id,org_id,dept_id,scope,state,created_role) values($1,$2,$3,'workspace','idle','org_admin')",[root,org,dept]);
      await db.exec("set role service_role");
      assert.ok((await q("select claim_notion_poll($1,$2) claim",[root,firstLease])).rows[0].claim);
      assert.equal((await q("select save_notion_poll_cursor($1,$2,null,37,'2026-09-18T00:02:00Z') saved",[root,firstLease])).rows[0].saved,true);
      assert.equal((await q("select (poll_cursor->>'offset')::int saved_offset from notion_installations where org_id=$1",[org])).rows[0].saved_offset,37);
      assert.equal((await q("select discover_cursor is null untouched from notion_roots where id=$1",[root])).rows[0].untouched,true);
      assert.equal((await q("select poll_watermark from notion_installations where org_id=$1",[org])).rows[0].poll_watermark.toISOString(),"2026-09-18T00:00:00.000Z");
      const resumed=(await q("select claim_notion_poll($1,$2) claim",[root,secondLease])).rows[0].claim;
      assert.equal(resumed.poll_cursor,null);
      assert.equal(resumed.poll_offset,37);
      assert.equal(new Date(resumed.poll_started_at).toISOString(),"2026-09-18T00:02:00.000Z");
      assert.equal((await q("select finish_notion_poll($1,$2,'2026-09-18T00:05:00Z') finished",[root,secondLease])).rows[0].finished,true);
      assert.equal((await q("select poll_watermark from notion_installations where org_id=$1",[org])).rows[0].poll_watermark.toISOString(),"2026-09-18T00:05:00.000Z");
    } finally { await db.exec("reset role").catch(()=>undefined); await db.exec("rollback"); }
  });

  await check("notion reconcile: changed-only import, missing tombstone, citations retained, and closer department subtree retires workspace source", async () => {
    await db.exec("begin");
    try {
      const org=randomUUID(), workspaceDept=randomUUID(), subtreeDept=randomUUID(), actor=randomUUID();
      const workspaceRoot=randomUUID(), subtreeRoot=randomUUID(), changed=randomUUID(), unchanged=randomUUID(), missing=randomUUID(), reassigned=randomUUID();
      const missingItem=randomUUID(), reassignedItem=randomUUID(), decision=randomUUID(), lease=randomUUID();
      const startedAt=new Date().toISOString();
      await q("insert into orgs(id,name) values($1,'reconcile org')",[org]);
      await q("insert into departments(id,org_id,name) values($1,$3,'workspace dept'),($2,$3,'subtree dept')",[workspaceDept,subtreeDept,org]);
      await q("insert into auth.users(id) values($1)",[actor]);
      await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','lead',now()),($1,$3,'lead','lead',now())",[actor,workspaceDept,subtreeDept]);
      await q("insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at) values($1,$2,'bot','oauth','v1.synthetic',now())",[org,`reconcile-${org}`]);
      await q("insert into notion_roots(id,org_id,dept_id,scope,notion_id,notion_kind,state,created_role) values($1,$3,$4,'workspace',null,null,'idle','org_admin'),($2,$3,$5,'subtree','hr-root','page','idle','lead')",[workspaceRoot,subtreeRoot,org,workspaceDept,subtreeDept]);
      await q("insert into sources(id,dept_id,kind,external_id,title,active,import_version,ingest_mode,root_id,remote_edited_at,parent_external_id) values($1,$5,'notion_page','changed','changed',true,2,'reference',$6,'2026-09-18T00:00:00Z',null),($2,$5,'notion_page','unchanged','unchanged',true,2,'reference',$6,'2026-09-18T00:00:00Z',null),($3,$5,'notion_page','missing','missing',true,2,'reference',$6,'2026-09-18T00:00:00Z',null),($4,$5,'notion_page','hr-root','hr',true,2,'reference',$6,'2026-09-18T00:00:00Z',null)",[changed,unchanged,missing,reassigned,workspaceDept,workspaceRoot]);
      await q("insert into items(id,source_id,dept_id,external_ref,author,content) values($1,$3,$5,'missing-item','Notion','결정 인용 원문'),($2,$4,$5,'reassigned-item','Notion','이동한 문서 원문')",[missingItem,reassignedItem,missing,reassigned,workspaceDept]);
      await q("insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,$3,'lead','결정','근거 유지')",[decision,workspaceDept,actor]);
      await q("insert into citations(owner_kind,owner_id,item_id,quote) values('decision',$1,$2,'결정 인용 원문')",[decision,missingItem]);
      await db.exec("set role service_role");
      assert.ok((await q("select claim_notion_reconcile($1,$2) root",[workspaceRoot,lease])).rows[0].root);
      assert.equal((await q("select reconcile_notion_page($1,$2,'changed',null,'2026-09-18T00:05:00Z','changed',$3) status",[workspaceRoot,lease,startedAt])).rows[0].status,"import");
      assert.equal((await q("select reconcile_notion_page($1,$2,'unchanged',null,'2026-09-18T00:00:00Z','unchanged',$3) status",[workspaceRoot,lease,startedAt])).rows[0].status,"unchanged");
      assert.equal((await q("select reconcile_notion_page($1,$2,'hr-root',null,'2026-09-18T00:00:00Z','hr',$3) status",[workspaceRoot,lease,startedAt])).rows[0].status,"excluded");
      assert.equal((await q("select finish_notion_reconcile($1,$2,$3) retired",[workspaceRoot,lease,startedAt])).rows[0].retired,1);
      assert.deepEqual((await q("select external_id,active,last_error from sources where id in ($1,$2,$3,$4) order by external_id",[changed,unchanged,missing,reassigned])).rows,[
        { external_id:"changed",active:true,last_error:null },
        { external_id:"hr-root",active:false,last_error:"notion_reconciled_outside_root" },
        { external_id:"missing",active:false,last_error:"notion_reconciled_missing" },
        { external_id:"unchanged",active:true,last_error:null },
      ]);
      assert.equal((await q("select count(*)::int count from jobs where kind='notion_import' and payload->>'sourceId'=$1 and lane='bulk'",[changed])).rows[0].count,1);
      assert.equal((await q("select count(*)::int count from jobs where kind='notion_import' and payload->>'sourceId'=$1",[unchanged])).rows[0].count,0);
      assert.equal((await q("select remote_edited_at from sources where id=$1",[changed])).rows[0].remote_edited_at.toISOString(),"2026-09-18T00:00:00.000Z");
      assert.ok((await q("select deleted_at is not null deleted from items where id=$1",[missingItem])).rows[0].deleted);
      assert.ok((await q("select deleted_at is not null deleted from items where id=$1",[reassignedItem])).rows[0].deleted);
      assert.equal((await q("select quote from citations where owner_kind='decision' and owner_id=$1",[decision])).rows[0].quote,"결정 인용 원문");
    } finally { await db.exec("reset role").catch(()=>undefined); await db.exec("rollback"); }
  });
}
