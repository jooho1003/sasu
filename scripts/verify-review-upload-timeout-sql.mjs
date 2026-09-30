import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyReviewUploadTimeoutSql({ q, check, asUser, ids }) {
  const make = async (layout, status, ageHours, deleted = false, originalDeleted = false) => {
    const id = randomUUID();
    await q(`insert into reviewed_materials
      (id,dept_id,created_by,kind,title,filename,file_size,fingerprint,visibility,status,original_layout,updated_at,deleted_at,original_deleted_at)
      values ($1,$2,$3,'document','Upload timeout QA','file.txt',12,repeat('a',64),'dept',$4,$5,
        clock_timestamp()-($6::text||' hours')::interval,
        case when $7 then clock_timestamp() else null end,
        case when $8 then clock_timestamp() else null end)`,
      [id, ids.dept, ids.lead, status, layout, ageHours, deleted, originalDeleted]);
    return id;
  };
  await check("abandoned file upload sweep: only old single-file uploading rows fail", async () => {
    const stale = await make("single_file", "uploading", 25);
    const fresh = await make("single_file", "uploading", 23);
    const edge = await make("single_file", "uploading", 24);
    const recording = (await q("select id from reviewed_materials where original_layout='audio_segments' limit 1")).rows[0]?.id;
    assert.ok(recording, "recording fixture from prior SQL checks");
    await q("update reviewed_materials set status='uploading',updated_at=clock_timestamp()-interval '25 hours' where id=$1", [recording]);
    const processing = await make("single_file", "processing", 25);
    const ready = await make("single_file", "ready", 25);
    const deleted = await make("single_file", "uploading", 25, true);
    const originalDeleted = await make("single_file", "uploading", 25, false, true);
    await q("update reviewed_materials set original_path=$2,original_uploaded=true where id=$1", [stale, `${ids.dept}/${stale}/original`]);
    await q("insert into review_parts(review_id,part_index,object_path) values($1,0,$2)", [stale, `${ids.dept}/${stale}/original`]);
    assert.equal((await q("select sweep_abandoned_review_uploads() as count")).rows[0].count, 2);
    const rows = (await q("select id,status,status_reason from reviewed_materials where id=any($1::uuid[])",
      [`{${[stale,fresh,edge,recording,processing,ready,deleted,originalDeleted].join(",")}}`])).rows;
    const byId = new Map(rows.map(row => [row.id, row]));
    assert.equal(byId.get(stale).status, "failed");
    assert.equal(byId.get(stale).status_reason, "upload_timeout");
    assert.equal(byId.get(edge).status, "failed");
    assert.deepEqual((await q("select original_path,original_uploaded from reviewed_materials where id=$1", [stale])).rows[0],
      { original_path: `${ids.dept}/${stale}/original`, original_uploaded: true });
    assert.equal((await q("select status from review_parts where review_id=$1", [stale])).rows[0].status, "waiting");
    for (const [id, status] of [[fresh,"uploading"],[recording,"uploading"],[processing,"processing"],[ready,"ready"],[deleted,"uploading"],[originalDeleted,"uploading"]])
      assert.equal(byId.get(id).status, status);
    assert.equal((await q("select sweep_abandoned_review_uploads() as count")).rows[0].count, 0);
  });
  await check("abandoned file upload sweep: 100-row cap and authenticated denial", async () => {
    await q(`insert into reviewed_materials
      (id,dept_id,created_by,kind,title,filename,file_size,fingerprint,visibility,status,original_layout,updated_at)
      select gen_random_uuid(),$1,$2,'document','Batch QA','file.txt',12,repeat('b',64),'dept','uploading','single_file',
        clock_timestamp()-interval '25 hours' from generate_series(1,101)`, [ids.dept,ids.lead]);
    await asUser(ids.lead, async () => {
      await assert.rejects(() => q("select sweep_abandoned_review_uploads()"), error => error.code === "42501");
    });
    assert.equal((await q("select sweep_abandoned_review_uploads() as count")).rows[0].count, 100);
    assert.equal((await q("select sweep_abandoned_review_uploads() as count")).rows[0].count, 1);
    assert.equal((await q("select sweep_abandoned_review_uploads() as count")).rows[0].count, 0);
  });
}
