import { RECORDING_RATE } from "./pcm";

export type RecordingCryptoScope = {
  ownerUserId: string;
  deptId: string;
  recordingId: string;
};

export type EncryptedRecordingCheckpoint = {
  sequence: number;
  sampleCount: number;
  ciphertext: ArrayBuffer;
};

const KEY_BYTES = 32;
const NONCE_PREFIX_BYTES = 8;
const NONCE_BYTES = 12;

function checkpointAad(
  scope: RecordingCryptoScope,
  sequence: number,
  sampleCount: number,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([
      "sasu-recording-checkpoint-v1",
      scope.ownerUserId,
      scope.deptId,
      scope.recordingId,
      sequence,
      sampleCount,
    ]),
  );
}

function pcmBytes(pcm: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(pcm.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(index * 2, pcm[index], true);
  }
  return buffer;
}

function pcmFromBytes(buffer: ArrayBuffer, sampleCount: number): Int16Array<ArrayBuffer> {
  if (buffer.byteLength !== sampleCount * 2) {
    throw new Error("recording_checkpoint_decrypt_failed");
  }
  const view = new DataView(buffer);
  const pcm = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = view.getInt16(index * 2, true);
  }
  return pcm;
}

function validateCheckpoint(sequence: number, sampleCount: number): void {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence >= 1800) {
    throw new Error("recording_sequence_invalid");
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > RECORDING_RATE) {
    throw new Error("recording_checkpoint_invalid");
  }
}

export async function importRecordingKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== KEY_BYTES) throw new Error("recording_key_invalid");
  const copy = new Uint8Array(KEY_BYTES);
  copy.set(raw);
  return crypto.subtle.importKey("raw", copy, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function recordingNonce(prefix: Uint8Array, sequence: number): Uint8Array<ArrayBuffer> {
  if (prefix.byteLength !== NONCE_PREFIX_BYTES) throw new Error("recording_nonce_invalid");
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) {
    throw new Error("recording_sequence_invalid");
  }
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setUint32(NONCE_PREFIX_BYTES, sequence, false);
  return nonce;
}

export async function encryptRecordingCheckpoint(
  key: CryptoKey,
  scope: RecordingCryptoScope,
  noncePrefix: Uint8Array,
  checkpoint: { sequence: number; pcm: Int16Array },
): Promise<EncryptedRecordingCheckpoint> {
  validateCheckpoint(checkpoint.sequence, checkpoint.pcm.length);
  const aad = checkpointAad(scope, checkpoint.sequence, checkpoint.pcm.length);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: recordingNonce(noncePrefix, checkpoint.sequence),
      additionalData: aad,
      tagLength: 128,
    },
    key,
    pcmBytes(checkpoint.pcm),
  );
  return { sequence: checkpoint.sequence, sampleCount: checkpoint.pcm.length, ciphertext };
}

export async function decryptRecordingCheckpoint(
  key: CryptoKey,
  scope: RecordingCryptoScope,
  noncePrefix: Uint8Array,
  checkpoint: EncryptedRecordingCheckpoint,
): Promise<{ sequence: number; pcm: Int16Array<ArrayBuffer> }> {
  validateCheckpoint(checkpoint.sequence, checkpoint.sampleCount);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: recordingNonce(noncePrefix, checkpoint.sequence),
        additionalData: checkpointAad(scope, checkpoint.sequence, checkpoint.sampleCount),
        tagLength: 128,
      },
      key,
      checkpoint.ciphertext,
    );
    return { sequence: checkpoint.sequence, pcm: pcmFromBytes(plaintext, checkpoint.sampleCount) };
  } catch (error) {
    if (error instanceof Error && error.message === "recording_checkpoint_decrypt_failed") throw error;
    throw new Error("recording_checkpoint_decrypt_failed");
  }
}
