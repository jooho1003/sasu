import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyNotionImportV2Sql({ q, check, asUser }) {
  const id = Object.fromEntries(
    [
      "org",
      "dept",
      "lead",
      "member",
      "legacySource",
      "referenceSource",
      "convertSource",
      "decision",
    ].map((key) => [key, randomUUID()]),
  );
  await q("insert into orgs(id,name) values($1,'Notion import v2 QA')", [id.org]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Import QA')", [id.dept, id.org]);
  await q("insert into auth.users(id) values($1),($2)", [id.lead, id.member]);
  await q(
    "insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$3,'lead','lead',now()),($2,$3,'member','member',now())",
    [id.lead, id.member, id.dept],
  );
  await q(
    "insert into sources(id,dept_id,kind,external_id,active) values($1,$3,'notion_page','legacy-page',true),($2,$3,'notion_page','convert-page',true)",
    [id.legacySource, id.convertSource, id.dept],
  );
  await q(
    "insert into sources(id,dept_id,kind,external_id,active,import_version,ingest_mode) values($1,$2,'notion_page','reference-page',true,2,'reference')",
    [id.referenceSource, id.dept],
  );

  await check("notion import v2: existing sources retain v1 classify defaults and identical v1 snapshots are stable", async () => {
    const defaults = (
      await q("select import_version,ingest_mode from sources where id=$1", [id.legacySource])
    ).rows[0];
    assert.deepEqual(defaults, { import_version: 1, ingest_mode: "classify" });

    const firstLease = randomUUID();
    assert.equal((await q("select begin_notion_sync($1,$2) ok", [id.legacySource, firstLease])).rows[0].ok, true);
    const snapshot = JSON.stringify([{ external_ref: "block-a", content: "기존 블록 본문" }]);
    assert.deepEqual(
      (await q("select finish_notion_sync($1,$2,$3::jsonb,'기존 문서') result", [id.legacySource, firstLease, snapshot])).rows[0].result,
      { inserted: 1, updated: 0, deleted: 0 },
    );
    const initial = (
      await q("select id,content_version from items where source_id=$1", [id.legacySource])
    ).rows[0];

    const secondLease = randomUUID();
    await q("select begin_notion_sync($1,$2)", [id.legacySource, secondLease]);
    assert.deepEqual(
      (await q("select finish_notion_sync($1,$2,$3::jsonb,'기존 문서') result", [id.legacySource, secondLease, snapshot])).rows[0].result,
      { inserted: 0, updated: 0, deleted: 0 },
    );
    assert.deepEqual(
      (await q("select id,content_version from items where source_id=$1", [id.legacySource])).rows[0],
      initial,
    );
    assert.equal(
      (await q("select count(*)::int count from jobs where kind='classify' and payload->>'itemId'=$1", [initial.id])).rows[0].count,
      1,
    );
  });

  let referenceItem;
  let referenceBatchJob;
  await check("notion import v2: reference snapshots enqueue one department batch and become searchable", async () => {
    const lease = randomUUID();
    await q("select begin_notion_sync($1,$2)", [id.referenceSource, lease]);
    const snapshot = JSON.stringify([{ external_ref: "heading-a", content: "충분히 긴 검색 근거 청크 본문입니다." }]);
    assert.deepEqual(
      (await q("select finish_notion_sync($1,$2,$3::jsonb,'참조 문서','2026-09-18T03:00:00Z') result", [id.referenceSource, lease, snapshot])).rows[0].result,
      { inserted: 1, updated: 0, deleted: 0 },
    );
    referenceItem = (
      await q("select id,content_version from items where source_id=$1", [id.referenceSource])
    ).rows[0];
    assert.equal(
      (await q("select count(*)::int count from jobs where kind='classify' and payload->>'itemId'=$1", [referenceItem.id])).rows[0].count,
      0,
    );
    assert.equal(
      (await q("select count(*)::int count from jobs where kind='embed' and payload->>'itemId'=$1", [referenceItem.id])).rows[0].count,
      0,
    );
    referenceBatchJob = (
      await q("select id,lane,status from jobs where kind='embed_batch' and payload->>'deptId'=$1", [id.dept])
    ).rows[0];
    assert.deepEqual(
      { lane: referenceBatchJob.lane, status: referenceBatchJob.status },
      { lane: "bulk", status: "queued" },
    );
    assert.equal(
      (await q("select remote_edited_at from sources where id=$1", [id.referenceSource])).rows[0].remote_edited_at.toISOString(),
      "2026-09-18T03:00:00.000Z",
    );

    const vector = JSON.stringify([1, ...Array(1023).fill(0)]);
    assert.equal(
      (await q("select complete_item_embedding($1,1,$2::vector,'voyage-4-lite') ok", [referenceItem.id, vector])).rows[0].ok,
      true,
    );
    await q("update jobs set status='running',attempts=1 where id=$1", [referenceBatchJob.id]);
    assert.equal(
      (await q("select complete_embed_batch_job($1,false) status", [referenceBatchJob.id])).rows[0].status,
      "done",
    );
    await asUser(id.lead, async () => {
      const rows = await q("select id from search_as($1,$2,$3::vector,8)", [id.lead, id.dept, vector]);
      assert.ok(rows.rows.some((row) => row.id === referenceItem.id));
    });
  });

  await check("notion import v2: identical reference snapshots are idempotent and changed chunks requeue the department batch", async () => {
    const same = JSON.stringify([{ external_ref: "heading-a", content: "충분히 긴 검색 근거 청크 본문입니다." }]);
    const sameLease = randomUUID();
    await q("select begin_notion_sync($1,$2)", [id.referenceSource, sameLease]);
    await q("select finish_notion_sync($1,$2,$3::jsonb,'참조 문서','2026-09-18T03:00:00Z')", [id.referenceSource, sameLease, same]);
    assert.equal((await q("select count(*)::int count from items where source_id=$1", [id.referenceSource])).rows[0].count, 1);
    assert.equal((await q("select count(*)::int count from jobs where kind='embed' and payload->>'itemId'=$1", [referenceItem.id])).rows[0].count, 0);
    assert.equal((await q("select status from jobs where id=$1", [referenceBatchJob.id])).rows[0].status, "done");

    const changedLease = randomUUID();
    await q("select begin_notion_sync($1,$2)", [id.referenceSource, changedLease]);
    const changed = JSON.stringify([{ external_ref: "heading-a", content: "수정된 검색 근거 청크 본문입니다." }]);
    await q("select finish_notion_sync($1,$2,$3::jsonb,'참조 문서','2026-09-18T03:05:00Z')", [id.referenceSource, changedLease, changed]);
    assert.equal((await q("select content_version from items where id=$1", [referenceItem.id])).rows[0].content_version, 2);
    assert.equal((await q("select count(*)::int count from jobs where kind='embed' and payload->>'itemId'=$1", [referenceItem.id])).rows[0].count, 0);
    assert.deepEqual(
      (await q("select status,attempts,lane from jobs where id=$1", [referenceBatchJob.id])).rows[0],
      { status: "queued", attempts: 0, lane: "bulk" },
    );
    assert.equal((await q("select count(*)::int count from jobs where kind='classify' and payload->>'itemId'=$1", [referenceItem.id])).rows[0].count, 0);

    const vector = JSON.stringify([1, ...Array(1023).fill(0)]);
    assert.equal((await q("select complete_item_embedding($1,1,$2::vector,'voyage-4-lite') ok", [referenceItem.id, vector])).rows[0].ok, false);
    assert.equal((await q("select complete_item_embedding($1,2,$2::vector,'voyage-4-lite') ok", [referenceItem.id, vector])).rows[0].ok, true);
  });

  await check("notion import v2: retirement tombstones items while preserving decision quote snapshots", async () => {
    await q(
      "insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,$3,'lead','결정','근거 유지')",
      [id.decision, id.dept, id.lead],
    );
    await q(
      "insert into citations(owner_kind,owner_id,item_id,quote) values('decision',$1,$2,'수정된 검색 근거 청크 본문입니다.')",
      [id.decision, referenceItem.id],
    );
    const lease = randomUUID();
    await q("select begin_notion_sync($1,$2)", [id.referenceSource, lease]);
    assert.equal(
      (await q("select retire_notion_source($1,$2,'notion_not_found') ok", [id.referenceSource, lease])).rows[0].ok,
      true,
    );
    assert.deepEqual(
      (await q("select active,last_error from sources where id=$1", [id.referenceSource])).rows[0],
      { active: false, last_error: "notion_not_found" },
    );
    const item = (await q("select content,deleted_at from items where id=$1", [referenceItem.id])).rows[0];
    assert.equal(item.content, "");
    assert.ok(item.deleted_at);
    assert.equal(
      (await q("select quote from citations where owner_kind='decision' and owner_id=$1", [id.decision])).rows[0].quote,
      "수정된 검색 근거 청크 본문입니다.",
    );
  });

  await check("notion import v2: active pages are unique per department", async () => {
    await assert.rejects(
      () => q("insert into sources(dept_id,kind,external_id,active) values($1,'notion_page','legacy-page',true)", [id.dept]),
      (error) => error.code === "23505",
    );
    assert.equal(
      (await q("select count(*)::int count from sources where dept_id=$1 and kind='notion_page' and external_id='legacy-page' and active", [id.dept])).rows[0].count,
      1,
    );
  });

  await check("notion import v2: retirement remains service-role-only", async () => {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (
          await q(
            "select has_function_privilege($1,'retire_notion_source(uuid,uuid,text)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    }
    assert.equal(
      (
        await q(
          "select has_function_privilege('service_role','retire_notion_source(uuid,uuid,text)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
      true,
    );
  });

  await check("notion import v2: only leads can convert legacy sources and conversion queues one import", async () => {
    await asUser(id.member, async () => {
      await assert.rejects(
        () => q("select convert_notion_source_v2($1)", [id.convertSource]),
        (error) => error.code === "42501",
      );
    });
    await asUser(id.lead, async () => {
      assert.equal((await q("select convert_notion_source_v2($1) ok", [id.convertSource])).rows[0].ok, true);
    });
    assert.equal((await q("select import_version from sources where id=$1", [id.convertSource])).rows[0].import_version, 2);
    assert.equal(
      (await q("select count(*)::int count from jobs where kind='notion_import' and payload->>'sourceId'=$1", [id.convertSource])).rows[0].count,
      1,
    );
    assert.equal(
      (await q("select lane from jobs where kind='notion_import' and payload->>'sourceId'=$1", [id.convertSource])).rows[0].lane,
      "realtime",
    );
  });
}
