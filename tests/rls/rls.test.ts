import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { beforeAll, describe, expect, it } from "vitest";

loadEnvFile(".env.local");

const SEED_IDS = {
  org: "11111111-1111-4111-8111-111111111111",
  department: "22222222-2222-4222-8222-222222222222",
  publicSource: "33333333-3333-4333-8333-333333333333",
  leadsOnlySource: "44444444-4444-4444-8444-444444444444",
  publicItem: "55555555-5555-4555-8555-555555555555",
  leadsOnlyItem: "66666666-6666-4666-8666-666666666666",
  leadsOnlyRequest: "77777777-7777-4777-8777-777777777777",
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function createRlsClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

describe("live Supabase RLS", () => {
  let anon: SupabaseClient;
  let member: SupabaseClient;
  let lead: SupabaseClient;

  beforeAll(async () => {
    anon = createRlsClient();
    member = createRlsClient();
    lead = createRlsClient();

    const memberSignIn = await member.auth.signInWithPassword({
      email: requiredEnv("SEED_MEMBER_EMAIL"),
      password: requiredEnv("SEED_MEMBER_PASSWORD"),
    });
    if (memberSignIn.error) throw memberSignIn.error;

    const leadSignIn = await lead.auth.signInWithPassword({
      email: requiredEnv("SEED_LEAD_EMAIL"),
      password: requiredEnv("SEED_LEAD_PASSWORD"),
    });
    if (leadSignIn.error) throw leadSignIn.error;
  });

  it("anon cannot read real organization data", async () => {
    const [orgs, items] = await Promise.all([
      anon.from("orgs").select("id").eq("id", SEED_IDS.org),
      anon.from("items").select("id").eq("dept_id", SEED_IDS.department),
    ]);

    expect(orgs.error ? [] : orgs.data).toHaveLength(0);
    expect(items.error ? [] : items.data).toHaveLength(0);
  });

  it("member sees dept items but not leads_only items or cards", async () => {
    const publicItems = await member
      .from("items")
      .select("id")
      .eq("source_id", SEED_IDS.publicSource);
    const privateItems = await member
      .from("items")
      .select("id")
      .eq("source_id", SEED_IDS.leadsOnlySource);
    const privateCards = await member
      .from("decision_requests")
      .select("id")
      .eq("id", SEED_IDS.leadsOnlyRequest);

    expect(publicItems.error).toBeNull();
    expect(publicItems.data).toHaveLength(1);
    expect(privateItems.error).toBeNull();
    expect(privateItems.data).toHaveLength(0);
    expect(privateCards.error).toBeNull();
    expect(privateCards.data).toHaveLength(0);
  });

  it("lead sees leads_only items, cards, and citations", async () => {
    const privateItems = await lead
      .from("items")
      .select("id")
      .eq("id", SEED_IDS.leadsOnlyItem);
    const privateCards = await lead
      .from("decision_requests")
      .select("id")
      .eq("id", SEED_IDS.leadsOnlyRequest);
    const citations = await lead
      .from("citations")
      .select("id")
      .eq("owner_id", SEED_IDS.leadsOnlyRequest);

    expect(privateItems.error).toBeNull();
    expect(privateItems.data).toHaveLength(1);
    expect(privateCards.error).toBeNull();
    expect(privateCards.data).toHaveLength(1);
    expect(citations.error).toBeNull();
    expect(citations.data).toHaveLength(1);
  });

  it("member cannot insert a leads_only card", async () => {
    const response = await member.from("decision_requests").insert({
      id: crypto.randomUUID(),
      dept_id: SEED_IDS.department,
      title: "권한 밖 삽입 시도",
      background: "RLS가 차단해야 하는 합성 요청입니다.",
      recommendation: "차단되어야 합니다.",
      visibility: "leads_only",
      status: "open",
    });

    expect(response.error).not.toBeNull();
  });

  it("member cannot insert a row for another department", async () => {
    const response = await member.from("departments").insert({
      id: crypto.randomUUID(),
      org_id: SEED_IDS.org,
      name: "권한 밖 부서",
      template: "general",
    });

    expect(response.error).not.toBeNull();
  });

  it("member cannot read internal jobs, ingest events, llm calls, or orgs", async () => {
    for (const table of ["jobs", "ingest_events", "llm_calls", "orgs"]) {
      const response = await member.from(table).select("*");
      expect(response.error ? [] : response.data).toHaveLength(0);
    }
  });
});
