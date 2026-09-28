"use client";

import { useEffect, useRef, useState } from "react";

type Segment = { index: number; status: string };
const SEGMENT_SECONDS = 60;

export function RecordingSegmentPlayer({ deptId, reviewId, duration, segments, seekRequest }: {
  deptId: string; reviewId: string; duration: number; segments: Segment[];
  seekRequest?: { seconds: number; serial: number } | null;
}) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState("");
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const playAtRef = useRef<(seconds: number) => Promise<void>>(async () => {});
  const sorted = [...segments].sort((a, b) => a.index - b.index);
  const available = sorted.length > 0 && sorted.every((segment, index) => segment.index === index && segment.status === "verified");

  function stop() {
    generation.current++;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.close().catch(() => {});
    setPlaying(false);
    setBuffering(false);
  }

  useEffect(() => () => {
    generation.current++;
    if (timerRef.current) clearInterval(timerRef.current);
    if (contextRef.current) void contextRef.current.close().catch(() => {});
  }, []);

  async function playAt(startSeconds: number) {
    stop();
    if (!available) return;
    startSeconds = Math.max(0, Math.min(startSeconds, Math.max(0, duration - 0.01)));
    const run = generation.current;
    setError(""); setBuffering(true);
    const context = new AudioContext();
    contextRef.current = context;
    const firstIndex = Math.min(sorted.length - 1, Math.floor(startSeconds / SEGMENT_SECONDS));
    const offset = startSeconds - firstIndex * SEGMENT_SECONDS;
    const fetchBuffer = async (index: number) => {
      const response = await fetch(`/api/d/${deptId}/reviews/${reviewId}/original?action=play_original&segment=${index}`, { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "원본 구간을 읽지 못했습니다.");
      return context.decodeAudioData(await response.arrayBuffer());
    };
    const schedule = (buffer: AudioBuffer, when: number, from = 0, last = false) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(when, from);
      if (last) source.onended = () => {
        if (generation.current === run) { stop(); setPosition(duration); }
      };
      return when + buffer.duration - from;
    };
    try {
      await context.resume();
      // Only two original segments are decoded ahead of the playhead.
      const initial = await Promise.all([fetchBuffer(firstIndex),
        firstIndex + 1 < sorted.length ? fetchBuffer(firstIndex + 1) : Promise.resolve(null)]);
      if (generation.current !== run) return;
      const begins = context.currentTime + 0.1;
      let nextWhen = schedule(initial[0], begins, offset, firstIndex === sorted.length - 1);
      if (initial[1]) nextWhen = schedule(initial[1], nextWhen, 0, firstIndex + 1 === sorted.length - 1);
      const clock = begins - startSeconds;
      setPlaying(true); setBuffering(false);
      timerRef.current = setInterval(() => {
        if (generation.current === run) setPosition(Math.min(duration, Math.max(startSeconds, context.currentTime - clock)));
      }, 250);
      for (let index = firstIndex + 2; index < sorted.length; index++) {
        // Fetch near the boundary so a long recording never occupies memory at once.
        while (generation.current === run && nextWhen - context.currentTime > 10)
          await new Promise((resolve) => setTimeout(resolve, 500));
        if (generation.current !== run) return;
        const buffer = await fetchBuffer(index);
        if (generation.current !== run) return;
        nextWhen = schedule(buffer, Math.max(nextWhen, context.currentTime + 0.03), 0, index === sorted.length - 1);
      }
    } catch (cause) {
      if (generation.current === run) {
        stop();
        setError(cause instanceof Error ? cause.message : "원본 재생을 계속하지 못했습니다.");
      }
    }
  }

  useEffect(() => { playAtRef.current = playAt; });
  useEffect(() => { if (seekRequest) void playAtRef.current(Math.min(seekRequest.seconds, Math.max(0, duration - 0.01))); }, [seekRequest, duration]);

  return <div>
    <div><button className="button button-secondary" type="button" disabled={!available || buffering} onClick={() => playing ? stop() : void playAt(position >= duration ? 0 : position)}>{playing ? "듣기 잠시 멈추기" : buffering ? "원본 불러오는 중" : "원본 듣기"}</button></div>
    <label>녹음 시각 {Math.floor(position / 60)}:{String(Math.floor(position % 60)).padStart(2, "0")}
      <input type="range" min={0} max={duration || 1} step={1} value={position} disabled={!available} onChange={(event) => {
        const next = Number(event.target.value);
        setPosition(next);
        if (playing) void playAt(next);
      }} />
    </label>
    {!available && <p>원본 구간 검증이 끝나면 들을 수 있습니다.</p>}
    {error && <p role="alert">{error}</p>}
    <p className="field-help">표시 시각은 녹음된 길이 기준입니다. 일시정지한 실제 시각은 포함하지 않습니다.</p>
  </div>;
}
