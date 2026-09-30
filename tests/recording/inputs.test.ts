import { describe, expect, it, vi } from "vitest";
import { captureInputs, captureMicrophone, stopInputs } from "@/lib/recording/browser/inputs";

function stream(audio = true) {
  const stop = vi.fn();
  const a = { kind: "audio", readyState: "live", stop };
  const applyConstraints = vi.fn().mockResolvedValue(undefined);
  const v = { kind: "video", readyState: "live", stop, applyConstraints };
  return { stop, applyConstraints, value: { getVideoTracks: () => [v], getAudioTracks: () => audio ? [a] : [], getTracks: () => audio ? [a, v] : [v] } as unknown as MediaStream };
}

describe("meeting input acquisition", () => {
  it("refuses a silent share instead of silently recording only the microphone", async () => {
    const display = stream(false);
    const devices = { getDisplayMedia: vi.fn().mockResolvedValue(display.value), getUserMedia: vi.fn() };
    await expect(captureInputs("system_and_microphone", devices)).rejects.toThrow("shared_audio_missing");
    expect(display.stop).toHaveBeenCalledTimes(1);
    expect(devices.getUserMedia).not.toHaveBeenCalled();
  });
  it("releases shared audio and video when microphone permission is refused", async () => {
    const display = stream();
    const devices = { getDisplayMedia: vi.fn().mockResolvedValue(display.value), getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) };
    await expect(captureInputs("system_and_microphone", devices)).rejects.toThrow("denied");
    expect(display.stop).toHaveBeenCalledTimes(2);
  });
  it("acquires both explicit inputs and releases every track", async () => {
    const display = stream();
    const microphone = stream();
    const devices = { getDisplayMedia: vi.fn().mockResolvedValue(display.value), getUserMedia: vi.fn().mockResolvedValue(microphone.value) };
    const inputs = await captureInputs("system_and_microphone", devices);
    expect(devices.getDisplayMedia).toHaveBeenCalledWith({
      audio: true, video: true, systemAudio: "include", selfBrowserSurface: "exclude",
      surfaceSwitching: "include", monitorTypeSurfaces: "include",
    });
    expect(display.applyConstraints).toHaveBeenCalledWith({ frameRate: { ideal: 1, max: 1 } });
    expect(devices.getUserMedia).toHaveBeenCalledWith({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    }, video: false });
    expect(inputs).toEqual([display.value, microphone.value]);
    stopInputs(inputs);
    expect(display.stop).toHaveBeenCalledTimes(2);
    expect(microphone.stop).toHaveBeenCalledTimes(2);
  });
  it("keeps shared audio usable if the browser rejects the frame rate hint", async () => {
    const display = stream();
    display.applyConstraints.mockRejectedValue(new Error("unsupported"));
    const microphone = stream();
    const inputs = await captureInputs("system_and_microphone", {
      getDisplayMedia: vi.fn().mockResolvedValue(display.value), getUserMedia: vi.fn().mockResolvedValue(microphone.value),
    });
    expect(inputs).toHaveLength(2);
    stopInputs(inputs);
  });
  it("never asks for screen capture in microphone mode and rejects missing microphones", async () => {
    const microphone = stream(false);
    const devices = { getDisplayMedia: vi.fn(), getUserMedia: vi.fn().mockResolvedValue(microphone.value) };
    await expect(captureInputs("microphone", devices)).rejects.toThrow("microphone_missing");
    expect(devices.getDisplayMedia).not.toHaveBeenCalled();
    expect(devices.getUserMedia).toHaveBeenCalledWith({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: false,
    }, video: false });
    expect(microphone.stop).toHaveBeenCalledTimes(1);
  });
  it("reselects only a microphone with the original mode constraints", async () => {
    const microphone = stream();
    const devices = { getUserMedia: vi.fn().mockResolvedValue(microphone.value) };
    expect(await captureMicrophone("system_and_microphone", devices)).toBe(microphone.value);
    expect(devices.getUserMedia).toHaveBeenCalledWith({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    }, video: false });
  });
});
