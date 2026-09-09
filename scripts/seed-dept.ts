import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

export const SEED_IDS = {
  org: "11111111-1111-4111-8111-111111111111",
  department: "22222222-2222-4222-8222-222222222222",
  publicSource: "33333333-3333-4333-8333-333333333333",
  leadsOnlySource: "44444444-4444-4444-8444-444444444444",
  publicItem: "55555555-5555-4555-8555-555555555555",
  leadsOnlyItem: "66666666-6666-4666-8666-666666666666",
  leadsOnlyRequest: "77777777-7777-4777-8777-777777777777",
  leadsOnlyCitation: "88888888-8888-4888-8888-888888888888",
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function ensureUser(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  emailEnv: string,
  passwordEnv: string,
  displayName: string,
): Promise<string> {
  const email = requiredEnv(emailEnv).toLowerCase();
  const password = requiredEnv(passwordEnv);
  const { data: users, error: listError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (listError) {
    throw new Error(`list ${emailEnv} user failed: ${listError.message}`);
  }

  const existing = users.users.find(
    (user) => user.email?.toLowerCase() === email,
  );

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) {
      throw new Error(`update ${emailEnv} user failed: ${error.message}`);
    }
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) {
    throw new Error(`create ${emailEnv} user failed: ${error?.message ?? "unknown error"}`);
  }

  return data.user.id;
}

async function main() {
  const supabase = createServiceSupabaseClient();
  const leadUserId = await ensureUser(
    supabase,
    "SEED_LEAD_EMAIL",
    "SEED_LEAD_PASSWORD",
    "사수 파일럿 팀장",
  );
  const memberUserId = await ensureUser(
    supabase,
    "SEED_MEMBER_EMAIL",
    "SEED_MEMBER_PASSWORD",
    "사수 파일럿 팀원",
  );

  const { error: orgError } = await supabase.from("orgs").upsert(
    {
      id: SEED_IDS.org,
      name: "사수 파일럿 조직",
      is_demo: false,
    },
    { onConflict: "id" },
  );
  if (orgError) throw new Error(`upsert org failed: ${orgError.message}`);

  const { error: departmentError } = await supabase
    .from("departments")
    .upsert(
      {
        id: SEED_IDS.department,
        org_id: SEED_IDS.org,
        name: "파일럿 부서",
        template: "general",
      },
      { onConflict: "id" },
    );
  if (departmentError) {
    throw new Error(`upsert department failed: ${departmentError.message}`);
  }

  const { error: memberError } = await supabase.from("members").upsert(
    [
      {
        user_id: leadUserId,
        dept_id: SEED_IDS.department,
        role: "lead",
        display_name: "사수 파일럿 팀장",
        slack_user_id: "seed-lead",
        consented_at: new Date().toISOString(),
        consent_version: 1,
      },
      {
        user_id: memberUserId,
        dept_id: SEED_IDS.department,
        role: "member",
        display_name: "사수 파일럿 팀원",
        slack_user_id: "seed-member",
        consented_at: new Date().toISOString(),
        consent_version: 1,
      },
    ],
    { onConflict: "user_id,dept_id" },
  );
  if (memberError) throw new Error(`upsert members failed: ${memberError.message}`);

  const { error: sourceError } = await supabase.from("sources").upsert(
    [
      {
        id: SEED_IDS.publicSource,
        dept_id: SEED_IDS.department,
        kind: "slack_channel",
        external_id: "seed-public-channel",
        title: "#파일럿-공개",
        visibility: "dept",
        active: true,
      },
      {
        id: SEED_IDS.leadsOnlySource,
        dept_id: SEED_IDS.department,
        kind: "slack_channel",
        external_id: "seed-leads-channel",
        title: "#파일럿-리드",
        visibility: "leads_only",
        active: true,
      },
    ],
    { onConflict: "id" },
  );
  if (sourceError) throw new Error(`upsert sources failed: ${sourceError.message}`);

  const { error: itemError } = await supabase.from("items").upsert(
    [
      {
        id: SEED_IDS.publicItem,
        source_id: SEED_IDS.publicSource,
        dept_id: SEED_IDS.department,
        external_ref: "seed-public-item",
        author_ext_id: "seed-member",
        author: "사수 파일럿 팀원",
        content: "공개 채널에서 다음 분기 고객 인터뷰 일정을 정해야 합니다.",
      },
      {
        id: SEED_IDS.leadsOnlyItem,
        source_id: SEED_IDS.leadsOnlySource,
        dept_id: SEED_IDS.department,
        external_ref: "seed-leads-item",
        author_ext_id: "seed-lead",
        author: "사수 파일럿 팀장",
        content: "리드 전용 회의에서 외주사 B 견적 인상 대응 방향을 검토합니다.",
      },
    ],
    { onConflict: "id" },
  );
  if (itemError) throw new Error(`upsert items failed: ${itemError.message}`);

  const { error: classificationError } = await supabase
    .from("classifications")
    .upsert(
      [
        {
          item_id: SEED_IDS.publicItem,
          label: "decision",
          method: "rule",
          confidence: 0.9,
          reasoning: "시드 데이터",
        },
        {
          item_id: SEED_IDS.leadsOnlyItem,
          label: "decision",
          method: "rule",
          confidence: 0.9,
          reasoning: "시드 데이터",
        },
      ],
      { onConflict: "item_id" },
    );
  if (classificationError) {
    throw new Error(`upsert classifications failed: ${classificationError.message}`);
  }

  const { error: requestError } = await supabase
    .from("decision_requests")
    .upsert(
      {
        id: SEED_IDS.leadsOnlyRequest,
        dept_id: SEED_IDS.department,
        title: "리드 전용 검토 카드",
        background: "리드 전용 채널에서 생성된 합성 검토 안건입니다.",
        recommendation: "팀장 검토 후 방향을 정합니다.",
        assignee_id: leadUserId,
        visibility: "leads_only",
        status: "open",
        origin_item_id: SEED_IDS.leadsOnlyItem,
      },
      { onConflict: "id" },
    );
  if (requestError) {
    throw new Error(`upsert decision request failed: ${requestError.message}`);
  }

  const { error: citationError } = await supabase.from("citations").upsert(
    {
      id: SEED_IDS.leadsOnlyCitation,
      owner_kind: "decision_request",
      owner_id: SEED_IDS.leadsOnlyRequest,
      item_id: SEED_IDS.leadsOnlyItem,
      quote: "리드 전용 회의에서 외주사 B 견적 인상 대응 방향을 검토합니다.",
    },
    { onConflict: "id" },
  );
  if (citationError) {
    throw new Error(`upsert citation failed: ${citationError.message}`);
  }

  console.log("seed-dept complete: org=1 department=1 members=2 sources=2 items=2");
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`seed-dept failed: ${message}`);
    process.exitCode = 1;
  });
}
