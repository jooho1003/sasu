import { hkdfSync } from "node:crypto";

export type RecordingKeyContext = {
  recordingId: string;
  userId: string;
  deptId: string;
  keyVersion?: number;
};

const encoder = new TextEncoder();
type KeyEnvironment = Record<string, string | undefined>;

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function configuredVersion(value: string): number {
  const version = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !validVersion(version)) throw new Error("recording_key_unavailable");
  return version;
}

function configuredKeys(env: KeyEnvironment) {
  const version = configuredVersion(env.RECORDING_KEY_VERSION ?? "1");
  const secret = env.RECORDING_KEY_SECRET ?? "";
  if (encoder.encode(secret).byteLength < 32) throw new Error("recording_key_unavailable");
  let previous: { version: number; secret: string } | null = null;
  if (env.RECORDING_KEY_PREVIOUS_VERSION || env.RECORDING_KEY_PREVIOUS_SECRET) {
    const priorVersion = configuredVersion(env.RECORDING_KEY_PREVIOUS_VERSION ?? "");
    const priorSecret = env.RECORDING_KEY_PREVIOUS_SECRET ?? "";
    if (priorVersion >= version || encoder.encode(priorSecret).byteLength < 32) throw new Error("recording_key_unavailable");
    previous = { version: priorVersion, secret: priorSecret };
  }
  return { current: { version, secret }, previous };
}

export function activeRecordingKey(env: KeyEnvironment) {
  return configuredKeys(env).current;
}

export function recordingSecretForVersion(env: KeyEnvironment, version: unknown): string {
  if (!validVersion(version)) throw new Error("recording_key_unavailable");
  const { current, previous } = configuredKeys(env);
  if (current.version === version) return current.secret;
  if (previous?.version === version) return previous.secret;
  throw new Error("recording_key_unavailable");
}

function validContextValue(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

export async function deriveRecordingKey(
  secret: string,
  context: RecordingKeyContext,
): Promise<Uint8Array<ArrayBuffer>> {
  if (encoder.encode(secret).byteLength < 32) throw new Error("recording_key_secret_invalid");
  const keyVersion = context.keyVersion ?? 1;
  if (!validVersion(keyVersion)) throw new Error("recording_key_context_invalid");
  if (![context.recordingId, context.userId, context.deptId].every(validContextValue)) {
    throw new Error("recording_key_context_invalid");
  }

  const info = JSON.stringify([
    `sasu-recording-key-v${keyVersion}`,
    context.recordingId,
    context.userId,
    context.deptId,
  ]);
  const derived = hkdfSync("sha256", secret, `sasu-recording-key-v${keyVersion}`, info, 32);
  const key = new Uint8Array(32);
  key.set(new Uint8Array(derived));
  return key;
}
