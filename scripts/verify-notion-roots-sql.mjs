import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyNotionRootsSql({ db, q, check, asUser }) {
  const id = Object.fromEntries(
    [
      "orgA", "orgB", "deptA", "deptB", "leadA", "leadB", "memberA",
      "memberB", "adminA", "adminB", "lateMember", "rootA", "rootB",
    ].map((key) => [key, randomUUID()]),
  );
  await q(
    "insert into orgs(id,name) values($1,'Notion roots A'),($2,'Notion roots B')",
    [id.orgA, id.orgB],
  );
  await q(
    "insert into departments(id,org_id,name) values($1,$3,'Roots A'),($2,$4,'Roots B')",
    [id.deptA, id.deptB, id.orgA, id.orgB],
  );
  await q(
    "insert into auth.users(id) values($1),($2),($3),($4),($5),($6),($7)",
    [id.leadA, id.leadB, id.memberA, id.memberB, id.adminA, id.adminB, id.lateMember],
  );
  await q(
    "insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$5,'lead','lead A',now()),($2,$6,'lead','lead B',now()),($3,$5,'member','member A',now()),($4,$6,'member','member B',now())",
    [id.leadA, id.leadB, id.memberA, id.memberB, id.deptA, id.deptB],
  );
  await q(
    "insert into org_admins(org_id,user_id,granted_by) values($1,$3,'qa'),($2,$4,'qa')",
    [id.orgA, id.orgB, id.adminA, id.adminB],
  );
  await q(
    "insert into notion_installations(org_id,workspace_id,bot_id,auth_kind,encrypted_token,attested_at) values($1,'roots-workspace-a','bot-a','internal_token','v1.synthetic',now()),($2,'roots-workspace-b','bot-b','internal_token','v1.synthetic',now())",
    [id.orgA, id.orgB],
  );

  await check("notion roots: only leads can read tables and API roles have no direct writes", async () => {
    for (const table of ["notion_roots", "notion_exclusions"]) {
      assert.equal((await q("select has_table_privilege('authenticated',$1,'SELECT') allowed", [table])).rows[0].allowed, true);
      assert.equal((await q("select has_table_privilege('authenticated',$1,'INSERT') allowed", [table])).rows[0].allowed, false);
      assert.equal((await q("select has_table_privilege('anon',$1,'SELECT') allowed", [table])).rows[0].allowed, false);
    }
    await asUser(id.memberA, async () => {
      assert.equal((await q("select count(*)::int count from notion_roots")).rows[0].count, 0);
      await assert.rejects(
        () => q("insert into notion_exclusions(dept_id,notion_id,created_by) values($1,'forged',$2)", [id.deptA, id.memberA]),
        (error) => error.code === "42501",
      );
    });
  });

  await asUser(id.leadA, async () => {
    id.rootA = (await q(
      "select lead_upsert_notion_root($1,'page-01','page','dept') id",
      [id.deptA],
    )).rows[0].id;
  });

  await check("notion roots: lead reads stay department-scoped and admin titles are masked", async () => {
    await asUser(id.leadA, async () => {
      assert.equal((await q("select count(*)::int count from notion_roots where id=$1", [id.rootA])).rows[0].count, 1);
    });
    await asUser(id.leadB, async () => {
      assert.equal((await q("select count(*)::int count from notion_roots where id=$1", [id.rootA])).rows[0].count, 0);
    });
    await asUser(id.adminA, async () => {
      const adminRoot = (await q(
        "select admin_upsert_notion_root($1,'subtree','admin-page','page','qa@example.com 원칙','leads_only',false) id",
        [id.deptA],
      )).rows[0].id;
      const rows = (await q("select admin_notion_roots() value")).rows[0].value;
      const stored = rows.find((entry) => entry.root_id === adminRoot);
      assert.equal(stored.top_title, "[이메일] 원칙");
      assert.equal(JSON.stringify(rows).includes("qa@example.com"), false);
    });
  });

  await check("notion roots: interrupted three-level discovery resumes to 43 unique sources", async () => {
    const firstLease = randomUUID();
    assert.ok((await q("select claim_notion_discovery($1,$2) root", [id.rootA, firstLease])).rows[0].root);
    for (let index = 1; index <= 6; index += 1) {
      const page = `page-${String(index).padStart(2, "0")}`;
      const parent = index === 1 ? null : `page-${String(Math.max(1, Math.floor(index / 3))).padStart(2, "0")}`;
      const status = (await q(
        "select register_notion_page($1,$2,$3,null,$4) status",
        [id.rootA, page, parent, index === 6 ? "CHILD_SECRET_TITLE" : `Page ${index}`],
      )).rows[0].status;
      assert.ok(["created", "linked"].includes(status));
    }
    assert.equal((await q(
      "select save_discover_cursor($1,$2,$3::jsonb,false) saved",
      [id.rootA, firstLease, JSON.stringify({ mode: "workspace", searchCursor: "resume-6" })],
    )).rows[0].saved, true);

    const secondLease = randomUUID();
    assert.equal(
      (await q("select claim_notion_discovery($1,$2)->'discover_cursor' cursor", [id.rootA, secondLease])).rows[0].cursor.searchCursor,
      "resume-6",
    );
    for (let index = 1; index <= 12; index += 1) {
      const page = `page-${String(index).padStart(2, "0")}`;
      const parent = index === 1 ? null : `page-${String(Math.max(1, Math.floor(index / 3))).padStart(2, "0")}`;
      await q("select register_notion_page($1,$2,$3,null,$4)", [id.rootA, page, parent, `Page ${index}`]);
    }
    await q("select register_notion_page($1,'database-01','page-04',null,'Database')", [id.rootA]);
    for (let index = 1; index <= 30; index += 1) {
      await q(
        "select register_notion_page($1,$2,'database-01',null,$3)",
        [id.rootA, `row-${String(index).padStart(2, "0")}`, `Row ${index}`],
      );
    }
    assert.equal((await q("select save_discover_cursor($1,$2,null,true) saved", [id.rootA, secondLease])).rows[0].saved, true);
    assert.equal((await q("select count(*)::int count from sources where root_id=$1 and active", [id.rootA])).rows[0].count, 43);
    assert.equal((await q("select count(distinct external_id)::int count from sources where root_id=$1 and active", [id.rootA])).rows[0].count, 43);
    assert.equal((await q("select count(*)::int count from jobs j join sources s on s.id=(j.payload->>'sourceId')::uuid where j.kind='notion_import' and j.lane='bulk' and s.root_id=$1", [id.rootA])).rows[0].count, 43);
  });

  await check("notion roots: card candidates are lead-only and update the root source mode", async () => {
    assert.equal((await q("select has_function_privilege('authenticated','set_notion_root_card_candidates(uuid,boolean)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await q("select has_function_privilege('anon','set_notion_root_card_candidates(uuid,boolean)','EXECUTE') allowed")).rows[0].allowed, false);
    await asUser(id.memberA, async () => {
      await assert.rejects(
        () => q("select set_notion_root_card_candidates($1,true)", [id.rootA]),
        (error) => error.code === "42501",
      );
    });
    await asUser(id.leadA, async () => {
      assert.equal((await q("select set_notion_root_card_candidates($1,true) enabled", [id.rootA])).rows[0].enabled, true);
    });
    assert.equal((await q("select card_candidates from notion_roots where id=$1", [id.rootA])).rows[0].card_candidates, true);
    assert.equal((await q("select count(*)::int count from sources where root_id=$1 and active and ingest_mode<>'classify'", [id.rootA])).rows[0].count, 0);
    await asUser(id.leadA, async () => {
      assert.equal((await q("select set_notion_root_card_candidates($1,false) disabled", [id.rootA])).rows[0].disabled, true);
    });
    assert.equal((await q("select count(*)::int count from sources where root_id=$1 and active and ingest_mode<>'reference'", [id.rootA])).rows[0].count, 0);
  });

  await check("notion roots: unassigned pages store only a count and no source or item", async () => {
    assert.equal((await q("select notion_page_is_assigned($1,'outside-page',null) assigned", [id.rootA])).rows[0].assigned, false);
    assert.equal((await q("select set_notion_unassigned_count($1,1) saved", [id.rootA])).rows[0].saved, true);
    assert.equal((await q("select unassigned_count from notion_installations where org_id=$1", [id.orgA])).rows[0].unassigned_count, 1);
    assert.equal((await q("select count(*)::int count from sources where dept_id=$1 and external_id='outside-page'", [id.deptA])).rows[0].count, 0);
    assert.equal((await q("select count(*)::int count from items where dept_id=$1 and content like '%outside-page%'", [id.deptA])).rows[0].count, 0);
  });

  await check("notion roots: excluded subtree is tombstoned and stays excluded after rediscovery", async () => {
    const source = (await q("select id from sources where dept_id=$1 and external_id='page-04' and active", [id.deptA])).rows[0].id;
    await q("insert into items(source_id,dept_id,external_ref,content) values($1,$2,'qa','excluded secret')", [source, id.deptA]);
    await asUser(id.leadA, async () => {
      assert.equal((await q("select set_notion_exclusion($1,'page-04',true,true) ok", [id.deptA])).rows[0].ok, true);
    });
    assert.equal((await q("select count(*)::int count from sources where dept_id=$1 and external_id='page-04' and active", [id.deptA])).rows[0].count, 0);
    assert.equal((await q("select content from items where source_id=$1", [source])).rows[0].content, "");
    const lease = randomUUID();
    await q("select claim_notion_discovery($1,$2)", [id.rootA, lease]);
    assert.equal((await q("select register_notion_page($1,'page-04','page-01',null,'Page 4') status", [id.rootA])).rows[0].status, "excluded");
    assert.equal((await q("select count(*)::int count from sources where dept_id=$1 and external_id='page-04' and active", [id.deptA])).rows[0].count, 0);
    await q("select save_discover_cursor($1,$2,null,true)", [id.rootA, lease]);
  });

  await check("notion roots: organization page limit pauses exactly at five", async () => {
    await q("insert into org_settings(org_id,notion_page_limit) values($1,5) on conflict(org_id) do update set notion_page_limit=5", [id.orgB]);
    await asUser(id.leadB, async () => {
      id.rootB = (await q("select lead_upsert_notion_root($1,'limit-01','page','dept') id", [id.deptB])).rows[0].id;
    });
    const lease = randomUUID();
    await q("select claim_notion_discovery($1,$2)", [id.rootB, lease]);
    for (let index = 1; index <= 5; index += 1) {
      assert.equal((await q("select register_notion_page($1,$2,null,null,$3) status", [id.rootB, `limit-0${index}`, `Limit ${index}`])).rows[0].status, "created");
    }
    assert.equal((await q("select register_notion_page($1,'limit-06',null,null,'Limit 6') status", [id.rootB])).rows[0].status, "limit");
    assert.equal((await q("select register_notion_page($1,'limit-07',null,null,'Limit 7') status", [id.rootB])).rows[0].status, "paused");
    assert.deepEqual((await q("select state,(select count(*)::int from sources where dept_id=$2 and active) count from notion_roots where id=$1", [id.rootB, id.deptB])).rows[0], { state: "paused_limit", count: 5 });
  });

  await check("notion roots: consent is enforced at creation and every registration, then resumes", async () => {
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'member','late',null)", [id.lateMember, id.deptA]);
    await asUser(id.leadA, async () => {
      await assert.rejects(
        () => q("select lead_upsert_notion_root($1,'blocked-root','page','dept')", [id.deptA]),
        (error) => error.code === "P0001" && error.message === "consent_required:1",
      );
    });
    const lease = randomUUID();
    assert.equal((await q("select claim_notion_discovery($1,$2) root", [id.rootA, lease])).rows[0].root, null);
    assert.equal((await q("select state from notion_roots where id=$1", [id.rootA])).rows[0].state, "paused_consent");
    await q("update members set consented_at=now() where user_id=$1 and dept_id=$2", [id.lateMember, id.deptA]);
    assert.ok((await q("select claim_notion_discovery($1,$2) root", [id.rootA, randomUUID()])).rows[0].root);
  });

  await check("notion roots: cross-organization admins and ordinary members cannot create roots", async () => {
    await asUser(id.adminB, async () => {
      await assert.rejects(
        () => q("select admin_upsert_notion_root($1,'subtree','cross-page','page','Cross','dept',true)", [id.deptA]),
        (error) => error.code === "42501",
      );
    });
    await asUser(id.memberA, async () => {
      await assert.rejects(
        () => q("select lead_upsert_notion_root($1,'member-page','page','dept')", [id.deptA]),
        (error) => error.code === "42501",
      );
    });
  });

  await check("notion roots: admin listing contains aggregate keys but no child title", async () => {
    await asUser(id.adminA, async () => {
      const roots = (await q("select admin_notion_roots() value")).rows[0].value;
      assert.ok(roots.some((entry) => entry.root_id === id.rootA));
      assert.equal(JSON.stringify(roots).includes("CHILD_SECRET_TITLE"), false);
      const row = roots.find((entry) => entry.root_id === id.rootA);
      assert.deepEqual(Object.keys(row).sort(), [
        "completed_count", "dept_name", "discovered_count", "empty_count",
        "excluded_count", "failed_count", "pending_count", "root_id", "scope",
        "state", "top_title", "unassigned_count", "unsupported_count",
      ]);
    });
  });

  await check("notion roots: workspace fallback yields to another department's subtree root", async () => {
    const deptC = randomUUID(), leadC = randomUUID();
    await q("insert into departments(id,org_id,name) values($1,$2,'Roots C')", [deptC, id.orgA]);
    await q("insert into auth.users(id) values($1)", [leadC]);
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','lead C',now())", [leadC, deptC]);
    await q("update notion_roots set state='idle',discover_lease=null,discover_lease_until=null where org_id=$1", [id.orgA]);
    let workspaceRoot, hrRoot;
    await asUser(id.adminA, async () => {
      workspaceRoot = (await q("select admin_upsert_notion_root($1,'workspace',null,null,null,'dept',true) id", [id.deptA])).rows[0].id;
      hrRoot = (await q("select admin_upsert_notion_root($1,'subtree','hr-page','page','인사 규정','leads_only',true) id", [deptC])).rows[0].id;
    });
    // The fallback waits while a subtree root of the organization is still pending.
    assert.equal((await q("select claim_notion_discovery($1,$2) root", [workspaceRoot, randomUUID()])).rows[0].root, null);
    assert.ok((await q("select claim_notion_discovery($1,$2) root", [hrRoot, randomUUID()])).rows[0].root);
    assert.equal((await q("select register_notion_page($1,'hr-page',null,null,'인사 규정') status", [hrRoot])).rows[0].status, "created");
    assert.equal((await q("select register_notion_page($1,'hr-child','hr-page',null,'휴가') status", [hrRoot])).rows[0].status, "created");
    await q("update notion_roots set state='idle',discover_lease=null,discover_lease_until=null,last_discovered_at=now() where id=$1", [hrRoot]);
    assert.ok((await q("select claim_notion_discovery($1,$2) root", [workspaceRoot, randomUUID()])).rows[0].root);
    for (const [page, parent] of [["hr-page", null], ["hr-child", "hr-page"], ["hr-grandchild", "hr-child"]]) {
      assert.equal((await q("select register_notion_page($1,$2,$3,null,'x') status", [workspaceRoot, page, parent])).rows[0].status, "excluded", page);
    }
    assert.equal((await q("select register_notion_page($1,'general-page',null,null,'공지') status", [workspaceRoot])).rows[0].status, "created");
    assert.equal((await q("select count(*)::int count from sources where dept_id=$1 and external_id like 'hr-%'", [id.deptA])).rows[0].count, 0);
    assert.equal((await q("select count(*)::int count from sources where dept_id=$1 and external_id='general-page' and root_id=$2", [id.deptA, workspaceRoot])).rows[0].count, 1);
    await q("update notion_roots set state='disabled' where id in ($1,$2)", [workspaceRoot, hrRoot]);
  });

  await check("notion roots: worker RPCs remain service-role-only", async () => {
    const workerFunctions = [
      "claim_notion_discovery(uuid,uuid)",
      "register_notion_page(uuid,text,text,timestamp with time zone,text)",
      "save_discover_cursor(uuid,uuid,jsonb,boolean)",
    ];
    for (const name of workerFunctions) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        assert.equal(
          (await q("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, name])).rows[0].allowed,
          role === "service_role",
          `${role} ${name}`,
        );
      }
    }
    await db.exec("set role service_role");
    try {
      assert.equal((await q("select count(*)::int count from notion_roots")).rows[0].count >= 2, true);
    } finally {
      await db.exec("reset role");
    }
  });
}
