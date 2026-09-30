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
    this.clipped = 0;
    this.measured = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === "connect") {
        this.target = data.port;
        this.target.onmessage = ({ data: reply }) => {
          if (reply.type === "ack") this.acknowledged = reply.samples;
        };
        this.active = true;
      } else if (this.target) {
        this.flush();
        this.flushMetrics();
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
  flushMetrics() {
    if (!this.measured) return;
    this.port.postMessage({ type: "metrics", clipped: this.clipped, total: this.measured,
      pending: this.sent - this.acknowledged + this.used });
    this.clipped = 0;
    this.measured = 0;
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
      this.measured++;
      if (Math.abs(mono) >= 0.98) this.clipped++;
      this.buffer[this.used++] = Math.max(-1, Math.min(1, mono));
      if (this.used === this.buffer.length) this.flush();
      if (this.measured >= sampleRate) this.flushMetrics();
    }
    // Outputs are left at zero. Captured sound is never played to speakers.
    return true;
  }
}
registerProcessor("sasu-meeting-capture", MeetingCapture);

// Measures every input sample rather than sampling a short analyser window.
// The output stays silent; this node never plays the captured input.
class InputLevel extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.second = 0;
    this.energy = 0;
    this.samples = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === "start" || data.type === "reset") {
        this.second = data.second || 0;
        this.energy = 0;
        this.samples = 0;
        this.active = data.type === "start";
      } else if (data.type === "pause") this.active = false;
      else if (data.type === "resume") this.active = true;
    };
  }
  process(inputs) {
    if (!this.active) return true;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      let mono = 0;
      for (const channel of channels) mono += channel[index] / channels.length;
      this.energy += mono * mono;
      this.samples++;
      if (this.samples >= sampleRate) {
        this.port.postMessage({ type: "level", second: ++this.second,
          rms: Math.sqrt(this.energy / this.samples) });
        this.energy = 0;
        this.samples = 0;
      }
    }
    return true;
  }
}
registerProcessor("sasu-input-level", InputLevel);
