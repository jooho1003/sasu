// Operator tool: encrypted DB + private material files. No key or plaintext logs.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function keyBytes(key) {
  if (!/^[a-f0-9]{64}$/i.test(key ?? ""))
    throw new Error("BACKUP_ENCRYPTION_KEY must contain 32 bytes as hex");
  return Buffer.from(key, "hex");
}
export function sealBackup(snapshot, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const header = Buffer.from("SASUBK01");
  cipher.setAAD(header);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(snapshot), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), encrypted]);
}
export function openBackup(bytes, key) {
  const header = bytes.subarray(0, 8);
  if (header.toString() !== "SASUBK01")
    throw new Error("invalid_backup_format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(key),
    bytes.subarray(8, 20),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(bytes.subarray(20, 36));
  const snapshot = JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(36)),
      decipher.final(),
    ]).toString("utf8"),
  );
  if (
    hash(snapshot.sql) !== snapshot.manifest.sql_sha256 ||
    snapshot.files.some(
      (f) => hash(Buffer.from(f.base64, "base64")) !== f.sha256,
    )
  )
    throw new Error("backup_checksum_failed");
  return snapshot;
}

const run = (container, program, args, input) =>
  execFileSync("docker", ["exec", "-i", container, program, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
function assertContainer(container) {
  if (!/^[a-zA-Z0-9_-]+$/.test(container ?? ""))
    throw new Error("explicit_database_container_required");
}
async function allRows(query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await query().range(offset, offset + 999);
    if (result.error) throw new Error("backup_lookup_failed");
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}
export async function createBackup({
  container,
  output,
  key,
  url,
  serviceKey,
}) {
  assertContainer(container);
  if (!url || !serviceKey) throw new Error("supabase_configuration_required");
  keyBytes(key);
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const material = await allRows(() =>
    client
      .from("reviewed_materials")
      .select("id,dept_id,original_path,original_uploaded")
      .is("deleted_at", null)
      .is("original_deleted_at", null)
      .order("id"),
  );
  const files = [];
  let total = 0;
  for (const r of material) {
    if (!r.original_uploaded) continue;
    const parts = await client
      .from("review_parts")
      .select("object_path,status")
      .eq("review_id", r.id);
    if (parts.error) throw new Error("backup_parts_lookup_failed");
    const names = new Set([
      r.original_path,
      ...parts.data
        .filter((p) => p.status !== "waiting")
        .map((p) => p.object_path),
    ]);
    for (const name of names) {
      const result = await client.storage
        .from("review-materials")
        .download(name);
      if (result.error || !result.data) throw new Error("backup_file_missing");
      const bytes = Buffer.from(await result.data.arrayBuffer());
      total += bytes.length;
      if (total > 512 * 1024 * 1024)
        throw new Error("backup_file_budget_exceeded");
      files.push({
        bucket: "review-materials",
        name,
        bytes: bytes.length,
        sha256: hash(bytes),
        base64: bytes.toString("base64"),
      });
    }
  }
  const sql = run(container, "pg_dump", [
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--schema=public",
    "--schema=private",
    "--schema=auth",
    "--schema=storage",
    "--no-owner",
    "--no-acl",
  ]);
  const snapshot = {
    manifest: {
      format: "sasu-backup-v1",
      created_at: new Date().toISOString(),
      schemas: ["public", "private", "auth", "storage"],
      object_buckets: ["review-materials"],
      sql_sha256: hash(sql),
      file_count: files.length,
      file_bytes: total,
      activation: "quarantine_only",
      requires: [
        "current_membership_and_consent",
        "latest_source_deletions",
        "installation_encryption_key_separately",
        "scheduler_disabled",
      ],
    },
    sql,
    files,
  };
  const encrypted = sealBackup(snapshot, key);
  writeFileSync(output, encrypted, { flag: "wx" });
  openBackup(readFileSync(output), key);
  return {
    encrypted: true,
    bytes: encrypted.length,
    fileCount: files.length,
    sqlSha256: snapshot.manifest.sql_sha256,
  };
}
export async function verifyBackupRestore({
  container,
  input,
  key,
  url,
  serviceKey,
}) {
  assertContainer(container);
  const snapshot = openBackup(readFileSync(input), key);
  // Restoration is deliberately restricted to an isolated database, never the running app DB.
  const target = "review_restore_" + randomBytes(6).toString("hex");
  run(
    container,
    "psql",
    ["-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    `create database ${target};`,
  );
  const psql = (sql) =>
    run(
      container,
      "psql",
      ["-U", "postgres", "-d", target, "-v", "ON_ERROR_STOP=1", "-At", "-q"],
      sql,
    );
  psql(
    "create extension if not exists pgcrypto; create extension if not exists vector;",
  );
  psql(
    snapshot.sql.replace(
      /^CREATE SCHEMA public;$/m,
      "CREATE SCHEMA IF NOT EXISTS public;",
    ),
  );
  psql(
    "update public.jobs set status='failed',last_error='restore_quarantine',lease_until=null where status in ('queued','running'); update public.sources set auto_sync=false; create schema backup_verification; create table backup_verification.objects(name text primary key,bytes bytea not null);",
  );
  for (const file of snapshot.files) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.name))
      throw new Error("invalid_object_name");
    psql(
      `insert into backup_verification.objects values('${file.name}',decode('${file.base64}','base64'));`,
    );
    const restored = psql(
      `select encode(digest(bytes,'sha256'),'hex') from backup_verification.objects where name='${file.name}';`,
    ).trim();
    if (restored !== file.sha256)
      throw new Error("restored_file_checksum_failed");
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  // Apply CURRENT deletion and membership state before any read validation. Still no activation.
  const [deleted, items, members] = await Promise.all([
    allRows(() =>
      client
        .from("reviewed_materials")
        .select("id,deleted_at,original_deleted_at")
        .or("deleted_at.not.is.null,original_deleted_at.not.is.null")
        .order("id"),
    ),
    allRows(() =>
      client
        .from("items")
        .select("id,deleted_at")
        .not("deleted_at", "is", null)
        .order("id"),
    ),
    allRows(() =>
      client
        .from("members")
        .select("user_id,dept_id,role,consented_at")
        .order("user_id")
        .order("dept_id"),
    ),
  ]);
  let reapplied = 0;
  for (const r of deleted) {
    if (!/^[a-f0-9-]{36}$/.test(r.id)) throw new Error("invalid_id");
    psql(
      `delete from backup_verification.objects where name like '%/${r.id}/%'; update public.reviewed_materials set original_deleted_at=now() where id='${r.id}';`,
    );
    if (r.deleted_at)
      psql(
        `update public.reviewed_materials set deleted_at=now(),status='deleted',sections='[]',candidate_sections=null where id='${r.id}'; delete from public.review_revisions where review_id='${r.id}'; update public.review_parts set sections='[]' where review_id='${r.id}';`,
      );
    reapplied++;
  }
  for (const item of items) {
    if (!/^[a-f0-9-]{36}$/.test(item.id)) throw new Error("invalid_id");
    psql(
      `update public.items set content='',deleted_at=now(),embedding=null where id='${item.id}';`,
    );
  }
  const current = JSON.stringify(members).replaceAll("'", "''");
  psql(
    `update public.members m set consented_at=null where not exists(select 1 from jsonb_array_elements('${current}'::jsonb) x where x->>'user_id'=m.user_id::text and x->>'dept_id'=m.dept_id::text); delete from public.members m where not exists(select 1 from jsonb_array_elements('${current}'::jsonb) x where x->>'user_id'=m.user_id::text and x->>'dept_id'=m.dept_id::text); update public.members m set role=x->>'role',consented_at=(x->>'consented_at')::timestamptz from jsonb_array_elements('${current}'::jsonb) x where x->>'user_id'=m.user_id::text and x->>'dept_id'=m.dept_id::text; update public.jobs set status='failed',last_error='restore_quarantine',lease_until=null where status in ('queued','running');`,
  );
  const activeJobs = Number(
    psql(
      "select count(*) from public.jobs where status in ('queued','running');",
    ).trim(),
  );
  if (activeJobs !== 0) throw new Error("restored_jobs_not_quarantined");
  return {
    database: target,
    quarantined: true,
    filesVerified: snapshot.files.length,
    deletionsReapplied: reapplied,
    activeJobs,
    activationPerformed: false,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, container, path] = process.argv.slice(2);
  const args = {
    container,
    key: process.env.BACKUP_ENCRYPTION_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  try {
    const result =
      command === "create"
        ? await createBackup({ ...args, output: path })
        : command === "verify-restore"
          ? await verifyBackupRestore({ ...args, input: path })
          : (() => {
              throw new Error(
                "usage: backup-vault.mjs create|verify-restore <database-container> <encrypted-file>",
              );
            })();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      JSON.stringify({
        error:
          error instanceof Error && /^\w+$/.test(error.message)
            ? error.message
            : "backup_operation_failed",
      }),
    );
    process.exitCode = 1;
  }
}
