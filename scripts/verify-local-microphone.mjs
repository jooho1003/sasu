import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const origin = "http://127.0.0.1:55321";
  await context.grantPermissions(["microphone"], { origin });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const track = stream.getAudioTracks()[0];
      const context = new AudioContext();
      try {
        await context.resume();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const values = [];
        const buffer = new Float32Array(analyser.fftSize);
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          analyser.getFloatTimeDomainData(buffer);
          values.push(Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length));
        }
        return { live: track.readyState === "live", sampleRate: context.sampleRate,
          rmsMin: Math.min(...values), rmsMax: Math.max(...values) };
      } finally { await context.close(); }
    } finally { stream.getTracks().forEach((track) => track.stop()); }
  });
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
