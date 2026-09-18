import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyNotionInstallationsSql({ q, check, asUser }) {
  const id = Object.fromEntries(
    [
      "orgA",
      "orgB",
      "demoOrg",
      "deptA",
      "deptB",
      "demoDept",
      "adminA",
      "adminB",
      "demoAdmin",
      "memberA",
      "sourceA",
    ].map((key) => [key, randomUUID()]),
  );
  await q(
    "insert into orgs(id,name,is_demo) values($1,'Notion A',false),($2,'Notion B',false),($3,'Notion demo',true)",
    [id.orgA, id.orgB, id.demoOrg],
  );
  await q(
    "insert into departments(id,org_id,name) values($1,$4,'A'),($2,$5,'B'),($3,$6,'Demo')",
    [id.deptA, id.deptB, id.demoDept, id.orgA, id.orgB, id.demoOrg],
  );
  await q("insert into auth.users(id) values($1),($2),($3),($4)", [
    id.adminA,
    id.adminB,
    id.demoAdmin,
    id.memberA,
  ]);
  await q(
    "insert into org_admins(org_id,user_id,granted_by) values($1,$4,'qa'),($2,$5,'qa'),($3,$6,'qa')",
    [id.orgA, id.orgB, id.demoOrg, id.adminA, id.adminB, id.demoAdmin],
  );
  await q(
    "insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'member','member',now())",
    [id.memberA, id.deptA],
  );
  await q(
    "insert into sources(id,dept_id,kind,external_id,active) values($1,$2,'notion_page','page-a',true)",
    [id.sourceA, id.deptA],
  );

  const save = (actor, org, workspace) =>
    q(
      "select complete_notion_installation($1,$2,$3,'QA','bot-qa','internal_token','v1.synthetic') ok",
      [actor, org, workspace],
    );
  await save(id.adminA, id.orgA, "workspace-a");
  await save(id.adminB, id.orgB, "workspace-b");

  await check(
    "Notion installation: credential table is service-only and browser writes are denied",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(
          (
            await q(
              "select has_table_privilege($1,'notion_installations','SELECT') allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
        assert.equal(
          (
            await q(
              "select has_table_privilege($1,'notion_installations','INSERT') allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
      }
    },
  );

  await check(
    "Notion installation: admin metadata stays organization-scoped and token-free",
    async () => {
      let value;
      await asUser(id.adminB, async () => {
        value = (await q("select admin_notion_installation() value")).rows[0]
          .value;
      });
      assert.equal(value.workspace_id, "workspace-b");
      assert.equal(JSON.stringify(value).includes("workspace-a"), false);
      assert.equal(JSON.stringify(value).includes("encrypted"), false);
    },
  );

  await check(
    "Notion installation: ordinary members cannot resolve department credentials",
    () =>
      asUser(id.memberA, async () => {
        const value = (
          await q(
            "select notion_installation_for_department($1) value",
            [id.deptA],
          )
        ).rows[0].value;
        assert.equal(value, null);
      }),
  );

  await check("Notion installation: demo organizations are rejected", async () => {
    await assert.rejects(
      () => save(id.demoAdmin, id.demoOrg, "workspace-demo"),
      (error) => error.code === "42501" && error.message === "forbidden",
    );
    await asUser(id.demoAdmin, async () => {
      await assert.rejects(
        () => q("select admin_notion_installation()"),
        (error) => error.code === "42501" && error.message === "forbidden",
      );
    });
  });

  await check(
    "Notion installation: a workspace cannot bind to two organizations",
    async () => {
      await assert.rejects(
        () => save(id.adminB, id.orgB, "workspace-a"),
        (error) =>
          error.code === "23505" &&
          error.message === "workspace_already_bound",
      );
    },
  );

  await check(
    "Notion installation: revocation destroys the token and deactivates only organization sources",
    async () => {
      await asUser(id.adminA, async () => {
        assert.equal(
          (await q("select revoke_notion_installation() ok")).rows[0].ok,
          true,
        );
      });
      const installation = (
        await q(
          "select active,encrypted_token from notion_installations where org_id=$1",
          [id.orgA],
        )
      ).rows[0];
      assert.deepEqual(installation, {
        active: false,
        encrypted_token: null,
      });
      const source = (
        await q("select active,last_error from sources where id=$1", [id.sourceA])
      ).rows[0];
      assert.deepEqual(source, {
        active: false,
        last_error: "notion_disconnected",
      });
      assert.equal(
        (
          await q(
            "select active from notion_installations where org_id=$1",
            [id.orgB],
          )
        ).rows[0].active,
        true,
      );
    },
  );
}
