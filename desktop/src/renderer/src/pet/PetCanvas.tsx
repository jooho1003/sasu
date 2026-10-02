import { useEffect, useRef } from "react";
import type { DesktopSettings } from "../../../shared/contracts";
const colors: Record<DesktopSettings["pet"], string> = {
  green: "#6da183",
  blue: "#7b9dc3",
  purple: "#d8af65",
};
function drawPerson(
  context: CanvasRenderingContext2D,
  shirt: string,
  state: string,
  frame: number,
  reduced: boolean,
): void {
  const step = state === "working" && !reduced ? Math.sin(frame) * 2 : 0;
  context.clearRect(0, 0, 128, 128);
  context.save();
  context.translate(64, 78);
  context.scale(3, 3);
  context.fillStyle = "#102e2440";
  context.beginPath();
  context.ellipse(0, 5, 17, 6, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#34464c";
  context.fillRect(-5, -5, 4, 7 + step);
  context.fillRect(1, -5, 4, 7 - step);
  context.fillStyle = shirt;
  context.fillRect(-5, -15, 10, 9);
  context.fillRect(-7, -14 + step, 3, 6);
  context.fillRect(5, -14 - step, 3, 6);
  context.fillStyle = "#f5c79b";
  context.fillRect(-5, -22, 10, 7);
  context.fillStyle = "#172c37";
  context.fillRect(-6, -27, 12, 6);
  context.fillRect(-7, -25, 14, 3);
  context.fillStyle = "#25323a";
  context.fillRect(-3, -20, 1, 2);
  context.fillRect(3, -20, 1, 2);
  context.restore();
  const mark =
    state === "needs_attention"
      ? "!"
      : state === "failed"
        ? "×"
        : state === "complete"
          ? "✓"
          : state === "working"
            ? "…"
            : "";
  if (mark) {
    context.fillStyle = state === "failed" ? "#68716c" : "#17614a";
    context.font = "bold 24px sans-serif";
    context.fillText(mark, 94, 31);
  }
}
export function PetCanvas({
  tone,
  state,
  reduceMotion,
  onToggle,
  onMove,
}: {
  tone: DesktopSettings["pet"];
  state: string;
  reduceMotion: boolean;
  onToggle: () => void;
  onMove: (position: { x: number; y: number }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const handledClick = useRef(false);
  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext("2d");
    if (!context) return;
    const reduced = reduceMotion || window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let id = 0;
    const draw = () => {
      drawPerson(
        context,
        state === "failed" ? "#89918d" : colors[tone],
        state,
        frame,
        reduced,
      );
      frame += 0.2;
      if (!reduced) id = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(id);
  }, [tone, state, reduceMotion]);
  return (
    <button
      className="petButton"
      aria-label="사수 펫"
      onPointerDown={(event) => {
        point.current = { x: event.screenX, y: event.screenY };
      }}
      onPointerUp={(event) => {
        const start = point.current;
        if (!start) return;
        const moved =
          Math.abs(event.screenX - start.x) + Math.abs(event.screenY - start.y);
        if (moved < 4) {
          handledClick.current = true;
          onToggle();
        }
        else onMove({ x: event.screenX - 64, y: event.screenY - 64 });
        point.current = null;
      }}
      onClick={() => {
        if (!handledClick.current) onToggle();
        handledClick.current = false;
      }}
    >
      <canvas className="petCanvas" ref={canvas} width="128" height="128" />
    </button>
  );
}
