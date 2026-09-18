import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyNotionBulkLaneSql({ db, q, check, asUser }) {
  await check("notion bulk lane: default claim ignores 500 bulk jobs and claims realtime", async () => {
    await db.exec("begin");
    try {
      const realtimeJob = randomUUID();
      await q("update jobs set status='done',lease_until=null where status in ('queued','running')");
      await q(
        "insert into jobs(id,kind,payload,lane) select md5('bulk-lane-'||value)::uuid,'notion_discover','{}'::jsonb,'bulk' from generate_series(1,500) value",
      );
      await q(
        "insert into jobs(id,kind,payload,lane) values($1,'classify','{}','realtime')",
        [realtimeJob],
      );
      await db.exec("set role service_role");
      const realtime = await q("select id,lane from claim_jobs(1)");
      assert.deepEqual(realtime.rows, [{ id: realtimeJob, lane: "realtime" }]);
      assert.equal(
        (await q("select count(*)::int count from jobs where lane='bulk' and status='queued'")).rows[0].count,
        500,
      );
      const bulk = await q("select id,lane from claim_jobs(25,'bulk')");
      assert.equal(bulk.rows.length, 25);
      assert.ok(bulk.rows.every((row) => row.lane === "bulk"));
    } finally {
      await db.exec("reset role").catch(() => undefined);
      await db.exec("rollback");
    }
  });

  await check("notion bulk lane: installation lease serializes jobs without consuming attempts", async () => {
    await db.exec("begin");
    try {
      const org = randomUUID();
      const dept = randomUUID();
      const source = randomUUID();
      const firstJob = randomUUID();
      const secondJob = randomUUID();
      await q("insert into orgs(id,name) values($1,'bulk lease')", [org]);
      await q("insert into departments(id,org_id,name) values($1,$2,'bulk lease')", [dept, org]);
      await q(
        "insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at) values($1,$2,'bot','oauth','v1.synthetic',now())",
        [org, `workspace-${org}`],
      );
      await q(
        "insert into sources(id,dept_id,kind,external_id,root_id,import_version,ingest_mode) values($1,$2,'notion_page','lease-page',null,2,'reference')",
        [source, dept],
      );
      await q(
        "insert into jobs(id,kind,payload,lane,status,attempts) values($1,'notion_import',jsonb_build_object('sourceId',$3::uuid),'realtime','running',1),($2,'notion_import',jsonb_build_object('sourceId',$3::uuid),'realtime','running',1)",
        [firstJob, secondJob, source],
      );
      await db.exec("set role service_role");
      assert.equal((await q("select acquire_notion_job_lease($1) ok", [firstJob])).rows[0].ok, true);
      assert.equal((await q("select acquire_notion_job_lease($1) ok", [secondJob])).rows[0].ok, false);
      assert.equal((await q("select release_notion_job_lease($1) ok", [firstJob])).rows[0].ok, true);
      assert.equal((await q("select acquire_notion_job_lease($1) ok", [secondJob])).rows[0].ok, true);
      assert.deepEqual(
        (await q("select attempts,status from jobs where id=$1", [secondJob])).rows[0],
        { attempts: 1, status: "running" },
      );
    } finally {
      await db.exec("reset role").catch(() => undefined);
      await db.exec("rollback");
    }
  });

  await check("notion bulk lane: reference snapshots dedupe one batch job and stale completion is rejected", async () => {
    await db.exec("begin");
    try {
      const org = randomUUID();
      const dept = randomUUID();
      const source = randomUUID();
      const lease = randomUUID();
      await q("insert into orgs(id,name) values($1,'embed batch')", [org]);
      await q("insert into departments(id,org_id,name) values($1,$2,'embed batch')", [dept, org]);
      await q(
        "insert into sources(id,dept_id,kind,external_id,import_version,ingest_mode) values($1,$2,'notion_page','batch-page',2,'reference')",
        [source, dept],
      );
      assert.equal((await q("select begin_notion_sync($1,$2) ok", [source, lease])).rows[0].ok, true);
      const snapshot = JSON.stringify([
        { external_ref: "a", content: "마스킹된 첫 문서 본문" },
        { external_ref: "b", content: "마스킹된 둘째 문서 본문" },
      ]);
      await q("select finish_notion_sync($1,$2,$3::jsonb,'배치 문서',now())", [source, lease, snapshot]);
      assert.equal(
        (await q("select count(*)::int count from jobs where kind='embed'")).rows[0].count,
        0,
      );
      const batchJob = (
        await q("select id,lane,payload,status from jobs where kind='embed_batch' and payload->>'deptId'=$1", [dept])
      ).rows[0];
      assert.equal(batchJob.lane, "bulk");
      assert.equal(batchJob.status, "queued");
      assert.equal(batchJob.payload.deptId, dept);

      await q("update jobs set status='running',attempts=1 where id=$1", [batchJob.id]);
      const changedItem = (
        await q("update items set content='마스킹된 수정 본문' where source_id=$1 and external_ref='a' returning id,content_version", [source])
      ).rows[0];
      assert.equal((await q("select rerun_requested from jobs where id=$1", [batchJob.id])).rows[0].rerun_requested, true);
      assert.equal(
        (await q("select complete_embed_batch_job($1,false) status", [batchJob.id])).rows[0].status,
        "queued",
      );
      assert.deepEqual(
        (await q("select status,attempts,rerun_requested from jobs where id=$1", [batchJob.id])).rows[0],
        { status: "queued", attempts: 0, rerun_requested: false },
      );
      const vector = JSON.stringify([1, ...Array(1023).fill(0)]);
      assert.equal(
        (await q("select complete_item_embedding($1,$2,$3::vector,'voyage-4-lite') ok", [changedItem.id, changedItem.content_version - 1, vector])).rows[0].ok,
        false,
      );
      assert.equal(
        (await q("select complete_item_embedding($1,$2,$3::vector,'voyage-4-lite') ok", [changedItem.id, changedItem.content_version, vector])).rows[0].ok,
        true,
      );
    } finally {
      await db.exec("reset role").catch(() => undefined);
      await db.exec("rollback");
    }
  });

  await check("notion bulk lane: worker-only RPCs remain unavailable to authenticated users", async () => {
    const user = randomUUID();
    await q("insert into auth.users(id) values($1)", [user]);
    await asUser(user, async () => {
      for (const signature of [
        "claim_jobs(integer,text)",
        "acquire_notion_job_lease(uuid)",
        "release_notion_job_lease(uuid)",
        "queue_embed_batch(uuid)",
        "complete_embed_batch_job(uuid,boolean)",
      ]) {
        assert.equal(
          (await q("select has_function_privilege('authenticated',$1,'execute') allowed", [`public.${signature}`])).rows[0].allowed,
          false,
          signature,
        );
      }
    });
  });
}
