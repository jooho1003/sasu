import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifySalesReviewSql({ q, check, asUser, denied, ids }) {
  const actor = { dept: randomUUID(), lead: randomUUID(), member: randomUUID(), outsider: randomUUID(), outsiderDept: randomUUID(), demoOrg: randomUUID(), demoDept: randomUUID(), demoLead: randomUUID(), unconsented: randomUUID() };
  await q("insert into departments(id,org_id,name) values($1,$2,'Synthetic sales QA'),($3,$2,'Other sales QA')", [actor.dept, ids.org, actor.outsiderDept]);
  await q("insert into auth.users(id) values($1),($2),($3),($4),($5)", [actor.lead, actor.member, actor.outsider, actor.demoLead, actor.unconsented]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$4,'lead','Lead',now()),($2,$4,'member','Member',now()),($3,$5,'member','Outsider',now()),($6,$4,'member','No consent',null)", [actor.lead, actor.member, actor.outsider, actor.dept, actor.outsiderDept, actor.unconsented]);
  await q("insert into orgs(id,name,is_demo) values($1,'Synthetic demo QA',true)", [actor.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Demo sales QA')", [actor.demoDept, actor.demoOrg]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','Demo lead',now())", [actor.demoLead, actor.demoDept]);

  let taskId;
  const requestId = randomUUID();
  await check("sales review: session member creates one task and one job idempotently", async () => {
    await asUser(actor.member, async () => {
      taskId = (await q("select request_sales_review($1,'price',$2) id", [actor.dept, requestId])).rows[0].id;
      const second = (await q("select request_sales_review($1,'price',$2) id", [actor.dept, requestId])).rows[0].id;
      assert.equal(second, taskId);
      await assert.rejects(() => q("select request_sales_review($1,'schedule',$2)", [actor.dept, requestId]), error => error.code === "22023");
      assert.equal((await q("select count(*)::int count from sales_review_tasks where id=$1", [taskId])).rows[0].count, 1);
      await denied("insert into sales_review_tasks(dept_id,requested_by,client_request_id,focus) values($1,$2,$3,'all')", [actor.dept, actor.member, randomUUID()]);
    });
    const job = (await q("select kind,payload->>'taskId' task_id from jobs where payload->>'taskId'=$1", [taskId])).rows;
    assert.deepEqual(job, [{ kind: "run_sales_review", task_id: taskId }]);
  });
  await check("sales review: RLS isolates departments and consent", async () => {
    await asUser(actor.member, async () => assert.equal((await q("select id from sales_review_tasks where id=$1", [taskId])).rows.length, 1));
    await asUser(actor.outsider, async () => {
      assert.equal((await q("select id from sales_review_tasks where id=$1", [taskId])).rows.length, 0);
      await denied("select request_sales_review($1,'all',$2)", [actor.dept, randomUUID()]);
    });
    await asUser(actor.unconsented, async () => {
      assert.equal((await q("select id from sales_review_tasks where id=$1", [taskId])).rows.length, 0);
      await denied("select request_sales_review($1,'all',$2)", [actor.dept, randomUUID()]);
    });
    await asUser(actor.demoLead, async () => denied("select request_sales_review($1,'all',$2)", [actor.demoDept, randomUUID()]));
  });
  await q("update sales_review_tasks set status='ready',result='{}'::jsonb where id=$1", [taskId]);
  await check("sales review: only lead records a single append-only internal action", async () => {
    await asUser(actor.member, async () => denied("select review_sales_task($1,'approve')", [taskId]));
    let actionId;
    await asUser(actor.lead, async () => {
      actionId = (await q("select review_sales_task($1,'approve') id", [taskId])).rows[0].id;
      assert.ok(actionId);
      await assert.rejects(() => q("select review_sales_task($1,'reject')", [taskId]), error => error.code === "23505");
      assert.equal((await q("select action from sales_review_actions where task_id=$1", [taskId])).rows[0].action, "approve");
    });
    await asUser(actor.outsider, async () => assert.equal((await q("select id from sales_review_actions where task_id=$1", [taskId])).rows.length, 0));
    await denied("update sales_review_actions set action='reject' where id=$1", [actionId]);
    await denied("delete from sales_review_actions where id=$1", [actionId]);
  });
  await check("sales review: ten-per-day limit and invalid focus", async () => {
    await asUser(actor.member, async () => {
      for (let i = 0; i < 9; i++) await q("select request_sales_review($1,'all',$2)", [actor.dept, randomUUID()]);
      await assert.rejects(() => q("select request_sales_review($1,'all',$2)", [actor.dept, randomUUID()]), error => error.code === "22023");
      await assert.rejects(() => q("select request_sales_review($1,'other',$2)", [actor.dept, randomUUID()]), error => error.code === "22023");
    });
  });
}
