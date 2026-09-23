import { hkdfSync } from "node:crypto";

export type RecordingKeyContext = {
  recordingId: string;
  userId: string;
  deptId: string;
};

const encoder = new TextEncoder();
const HKDF_SALT = "sasu-recording-key-v1";

function validContextValue(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

export async function deriveRecordingKey(
  secret: string,
  context: RecordingKeyContext,
): Promise<Uint8Array<ArrayBuffer>> {
  if (encoder.encode(secret).byteLength < 32) throw new Error("recording_key_secret_invalid");
  if (![context.recordingId, context.userId, context.deptId].every(validContextValue)) {
    throw new Error("recording_key_context_invalid");
  }

  const info = JSON.stringify([
    "sasu-recording-key-v1",
    context.recordingId,
    context.userId,
    context.deptId,
  ]);
  const derived = hkdfSync("sha256", secret, HKDF_SALT, info, 32);
  const key = new Uint8Array(32);
  key.set(new Uint8Array(derived));
  return key;
}
