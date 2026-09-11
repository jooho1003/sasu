import { validateVoiceUpload } from "@/lib/adapters/voice";
import { llm } from "@/lib/llm";
import { requireMembership } from "@/lib/supabase/membership";

function voiceErrorMessage(error: string): string {
  if (error === "unsupported_audio_format") return "webm, m4a, mp3, wav, ogg 음성만 사용할 수 있습니다.";
  if (error === "audio_too_large") return "음성은 10MB 이하로 녹음해주세요.";
  if (error === "audio_empty") return "음성이 비어 있습니다.";
  if (error === "voice_transcription_empty") return "음성에서 질문을 확인하지 못했습니다.";
  if (error === "auth") return "음성 기능 설정을 확인해주세요.";
  if (error === "llm_timeout") return "음성 변환 시간이 초과되었습니다. 다시 녹음해주세요.";
  return "음성을 변환하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  await requireMembership(dept);

  const form = await request.formData();
  const fileValue = form.get("file");
  if (!(fileValue instanceof File)) {
    return Response.json({ error: "음성 파일을 선택해주세요." }, { status: 400 });
  }

  const validation = validateVoiceUpload({
    filename: fileValue.name || "voice.webm",
    mimeType: fileValue.type,
    size: fileValue.size,
  });
  if (!validation.ok) return Response.json({ error: voiceErrorMessage(validation.error) }, { status: 400 });

  try {
    const result = await llm.transcribeAudio({
      bytes: new Uint8Array(await fileValue.arrayBuffer()),
      filename: fileValue.name || "voice.webm",
      mimeType: fileValue.type,
    });
    return Response.json(
      { text: result.data.text, model: result.meta.model },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = error && typeof error === "object" ? Reflect.get(error, "error_code") : null;
    return Response.json({ error: voiceErrorMessage(typeof code === "string" ? code : "unknown") }, { status: code === "auth" ? 503 : 422 });
  }
}
