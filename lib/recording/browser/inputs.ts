export function stopInputs(streams: MediaStream[]): void {
  for (const stream of streams) for (const track of stream.getTracks()) track.stop();
}

export async function captureMicrophone(mode: "microphone" | "system_and_microphone",
  devices: Pick<MediaDevices, "getUserMedia"> = navigator.mediaDevices): Promise<MediaStream> {
  const microphone = await devices.getUserMedia({ audio: {
    echoCancellation: true, noiseSuppression: true,
    autoGainControl: mode === "system_and_microphone",
  }, video: false });
  if (!microphone.getAudioTracks().some((track) => track.readyState === "live")) {
    stopInputs([microphone]);
    throw new Error("microphone_missing");
  }
  return microphone;
}

export async function captureInputs(mode: "microphone" | "system_and_microphone",
  devices: Pick<MediaDevices, "getDisplayMedia" | "getUserMedia"> = navigator.mediaDevices): Promise<MediaStream[]> {
  const streams: MediaStream[] = [];
  try {
    if (mode === "system_and_microphone") {
      const display = await devices.getDisplayMedia({
        video: true, audio: true, systemAudio: "include", selfBrowserSurface: "exclude",
        surfaceSwitching: "include", monitorTypeSurfaces: "include",
      } as DisplayMediaStreamOptions);
      streams.push(display);
      if (!display.getAudioTracks().some((track) => track.readyState === "live")) throw new Error("shared_audio_missing");
      for (const track of display.getVideoTracks()) {
        try { await track.applyConstraints({ frameRate: { ideal: 1, max: 1 } }); }
        catch { /* Some browsers ignore frame-rate constraints on display capture. */ }
      }
    }
    const microphone = await captureMicrophone(mode, devices);
    streams.push(microphone);
    if (!microphone.getAudioTracks().some((track) => track.readyState === "live")) throw new Error("microphone_missing");
    // The display may have ended while the microphone permission dialog was open.
    if (streams.some((stream) => stream.getTracks().some((track) => track.readyState !== "live")))
      throw new Error("input_ended");
    return streams;
  } catch (error) { stopInputs(streams); throw error; }
}
