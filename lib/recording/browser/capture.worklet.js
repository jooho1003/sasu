/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class MeetingCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.target = null;
    this.buffer = new Float32Array(2048);
    this.used = 0;
    this.sent = 0;
    this.acknowledged = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === "connect") {
        this.target = data.port;
        this.target.onmessage = ({ data: reply }) => {
          if (reply.type === "ack") this.acknowledged = reply.samples;
        };
        this.active = true;
      } else if (this.target) {
        this.flush();
        this.active = data.type === "resume";
        this.target.postMessage(data);
      }
    };
  }
  flush() {
    if (!this.used || !this.target) return;
    const pcm = this.buffer.slice(0, this.used);
    this.sent += pcm.length;
    this.target.postMessage({ type: "pcm", pcm }, [pcm.buffer]);
    this.used = 0;
  }
  process(inputs) {
    if (!this.active || !this.target) return true;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (this.sent - this.acknowledged + this.used >= sampleRate * 5) {
        this.active = false;
        this.target.postMessage({ type: "interrupt", reason: "capture_backlog" });
        this.port.postMessage({ type: "interrupt", reason: "capture_backlog" });
        return true;
      }
      let mono = 0;
      for (const channel of channels) mono += channel[i] / channels.length;
      this.buffer[this.used++] = Math.max(-1, Math.min(1, mono));
      if (this.used === this.buffer.length) this.flush();
    }
    // Outputs are left at zero. Captured sound is never played to speakers.
    return true;
  }
}
registerProcessor("sasu-meeting-capture", MeetingCapture);
