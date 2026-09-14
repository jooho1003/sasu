"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { WORLD, SPAWN, INTERACTIONS, canWalk, findPath, moveActor, nearbyInteraction, type Point, type PlaceId } from "@/lib/trailer-world";
import styles from "./recruitment-trailer.module.css";

export type OfficeHandle = { walkTo: (id: PlaceId) => void; focus: () => void };
type Props = { paused: boolean; resetKey: number; color: string; discoveredPlaces: string[]; onInteract: (id: PlaceId) => void };

function drawPerson(ctx: CanvasRenderingContext2D, point: Point, shirt: string, hair: string, frame: number, direction: Point, isPlayer = false) {
  ctx.save(); ctx.translate(Math.round(point.x), Math.round(point.y));
  ctx.fillStyle = "#102e2440"; ctx.beginPath(); ctx.ellipse(0, 1, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(2, 2);
  const step = Math.sin(frame) * 1.6;
  // Original small pixel sprite: front/back head, layered clothes, moving limbs.
  ctx.fillStyle = "#34464c"; ctx.fillRect(-5, -6, 4, 6 + step); ctx.fillRect(1, -6, 4, 6 - step);
  ctx.fillStyle = "#f3e6c9"; ctx.fillRect(-6, -1 + step, 5, 2); ctx.fillRect(1, -1 - step, 5, 2);
  ctx.fillStyle = "#172c37"; ctx.fillRect(-5, -15, 11, 10);
  ctx.fillStyle = shirt; ctx.fillRect(-5, -15, 10, 8); ctx.fillRect(-7, -14 + step, 3, 6); ctx.fillRect(5, -14 - step, 3, 6);
  ctx.fillStyle = "#e9b78b"; ctx.fillRect(-7, -9 + step, 3, 3); ctx.fillRect(5, -9 - step, 3, 3);
  ctx.fillStyle = "#fff1dc"; ctx.fillRect(-2, -15, 4, 3); ctx.fillRect(0, -12, 1, 5);
  ctx.fillStyle = hair; ctx.fillRect(-6, -26, 12, 12); ctx.fillRect(-7, -24, 14, 7);
  if (direction.y <= -0.5) {
    ctx.fillStyle = "#ffffff18"; ctx.fillRect(-4, -24, 7, 2);
  } else {
    ctx.fillStyle = "#f5c79b"; ctx.fillRect(-5, -22, 10, 7); ctx.fillRect(-3, -16, 6, 2);
    ctx.fillStyle = hair; ctx.fillRect(-5, -25, 10, 4); ctx.fillRect(-6, -23, 3, 4); ctx.fillRect(4, -23, 2, 4);
    ctx.fillStyle = "#25323a"; ctx.fillRect(direction.x > 0.5 ? 0 : -3, -20, 1, 2); ctx.fillRect(direction.x < -0.5 ? 0 : 3, -20, 1, 2);
    ctx.fillStyle = "#d69b7e"; ctx.fillRect(0, -17, 2, 1);
  }
  if (isPlayer) { ctx.fillStyle = "#f6e9ab"; ctx.fillRect(3, -12, 2, 3); }
  ctx.restore();
}

export const TrailerOffice = forwardRef<OfficeHandle, Props>(function TrailerOffice(props, forwardedRef) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const minimapDot = useRef<HTMLSpanElement>(null);
  const propsRef = useRef(props);
  const actor = useRef<Point>({ ...SPAWN });
  const path = useRef<Point[]>([]);
  const destination = useRef<PlaceId | null>(null);
  const keys = useRef(new Set<string>());
  const zoom = useRef(1);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nearby, setNearby] = useState<PlaceId | null>(null);
  const [walking, setWalking] = useState("");
  const [hint, setHint] = useState("");
  const navigate = (id: PlaceId) => {
    const place = INTERACTIONS.find((entry) => entry.id === id)!;
    const route = findPath(actor.current, place.approach);
    if (!route.length) { setHint("그곳으로 가는 길을 찾지 못했어요. 다른 바닥을 눌러보세요."); return; }
    keys.current.clear(); path.current = route; destination.current = id; setWalking(place.name); setHint(""); canvas.current?.focus();
  };
  useImperativeHandle(forwardedRef, () => ({ walkTo: navigate, focus: () => canvas.current?.focus() }));
  useEffect(() => { propsRef.current = props; }, [props]);
  useEffect(() => {
    actor.current = { ...SPAWN }; path.current = []; destination.current = null; keys.current.clear();
  }, [props.resetKey]);

  useEffect(() => {
    const element = canvas.current!;
    const container = wrapper.current!;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    const background = new Image();
    let disposed = false;
    background.onload = () => { if (!disposed) setReady(true); };
    background.onerror = () => { if (!disposed) setFailed(true); };
    background.src = "/trailer/office-world.png";
    let width = 0, height = 0, ratio = 1, scale = 1;
    const camera = { x: SPAWN.x, y: SPAWN.y };
    const heldKeys = keys.current;
    let offset = { x: 0, y: 0 };
    let lastTime = 0, frameId = 0, walkCycle = 0, lastNearby: PlaceId | null = null;
    let direction: Point = { x: 0, y: 1 };
    let target: Point | null = null;
    const resize = () => {
      width = container.clientWidth; height = container.clientHeight; ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const clearMovement = () => { keys.current.clear(); path.current = []; destination.current = null; setWalking(""); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (propsRef.current.paused || document.activeElement !== element || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        event.preventDefault(); keys.current.add(key); path.current = []; destination.current = null; setWalking("");
      } else if ((key === "f" || key === "enter") && !event.repeat) {
        event.preventDefault(); const close = nearbyInteraction(actor.current);
        if (close) { clearMovement(); propsRef.current.onInteract(close.id); }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    const onPointer = (event: PointerEvent) => {
      if (propsRef.current.paused) return;
      element.focus();
      const bounds = element.getBoundingClientRect();
      const point = { x: (event.clientX - bounds.left - offset.x) / scale, y: (event.clientY - bounds.top - offset.y) / scale };
      const object = INTERACTIONS.find((entry) => Math.hypot(entry.position.x - point.x, entry.position.y - point.y) < 45);
      if (object) { navigate(object.id); return; }
      if (!canWalk(point)) { setHint("책상과 벽은 지나갈 수 없어요. 빈 바닥을 눌러주세요."); return; }
      const route = findPath(actor.current, point);
      if (!route.length) { setHint("연결된 바닥을 눌러주세요."); return; }
      keys.current.clear(); path.current = route; destination.current = null; target = point; setWalking(""); setHint("");
    };
    element.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearMovement); document.addEventListener("visibilitychange", clearMovement);

    const render = (time: number) => {
      if (disposed) return;
      const dt = Math.min((time - (lastTime || time)) / 1000, .04); lastTime = time;
      if (!width || !height) { frameId = requestAnimationFrame(render); return; }
      const currentProps = propsRef.current;
      let movement = { x: 0, y: 0 };
      if (currentProps.paused) {
        if (path.current.length || destination.current) setWalking("");
        keys.current.clear(); path.current = []; destination.current = null;
      }
      else {
        const pressed = keys.current;
        movement = { x: Number(pressed.has("arrowright") || pressed.has("d")) - Number(pressed.has("arrowleft") || pressed.has("a")), y: Number(pressed.has("arrowdown") || pressed.has("s")) - Number(pressed.has("arrowup") || pressed.has("w")) };
        if (movement.x || movement.y) {
          const norm = Math.hypot(movement.x, movement.y); movement.x /= norm; movement.y /= norm;
          actor.current = moveActor(actor.current, { x: movement.x * 245 * dt, y: movement.y * 245 * dt });
        } else if (path.current.length) {
          const next = path.current[0];
          const dx = next.x - actor.current.x, dy = next.y - actor.current.y, distance = Math.hypot(dx, dy);
          if (distance < 3) path.current.shift();
          else {
            movement = { x: dx / distance, y: dy / distance };
            const step = Math.min(distance, 245 * dt);
            const moved = moveActor(actor.current, { x: movement.x * step, y: movement.y * step });
            if (Math.hypot(moved.x - actor.current.x, moved.y - actor.current.y) < .01 && dt > 0) { clearMovement(); setHint("통로가 좁아요. 가까운 빈 바닥을 눌러 다시 이동해 주세요."); }
            actor.current = moved;
          }
        }
        if (!path.current.length && destination.current) {
          const arrived = destination.current;
          destination.current = null; setWalking("");
          if (nearbyInteraction(actor.current)?.id === arrived) currentProps.onInteract(arrived);
        }
      }
      if (movement.x || movement.y) { direction = movement; walkCycle += dt * 16; } else walkCycle = 0;
      const close = nearbyInteraction(actor.current);
      if ((close?.id ?? null) !== lastNearby) { lastNearby = close?.id ?? null; setNearby(lastNearby); }
      // Camera follows in world coordinates; zoom never changes interaction or collision geometry.
      scale = Math.max(width / WORLD.width, height / WORLD.height) * zoom.current;
      camera.x += (actor.current.x - camera.x) * Math.min(1, dt * 7);
      camera.y += (actor.current.y - camera.y) * Math.min(1, dt * 7);
      offset = {
        x: width >= WORLD.width * scale ? (width - WORLD.width * scale) / 2 : Math.max(width - WORLD.width * scale, Math.min(0, width / 2 - camera.x * scale)),
        y: height >= WORLD.height * scale ? (height - WORLD.height * scale) / 2 : Math.max(height - WORLD.height * scale, Math.min(0, height / 2 - camera.y * scale)),
      };
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = "#263a32"; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.translate(offset.x, offset.y); ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false;
      if (background.complete && background.naturalWidth) ctx.drawImage(background, 0, 0, WORLD.width, WORLD.height);
      if (!currentProps.paused && path.current.length) {
        ctx.strokeStyle = "#fff5c68c"; ctx.lineWidth = 2 / scale; ctx.setLineDash([3, 9]); ctx.beginPath(); ctx.moveTo(actor.current.x, actor.current.y);
        path.current.forEach((point) => ctx.lineTo(point.x, point.y)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (target && path.current.length && !destination.current) {
        ctx.strokeStyle = "#fcf1b4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(target.x, target.y, 13 + Math.sin(time / 180) * 2, 6, 0, 0, Math.PI * 2); ctx.stroke();
      }
      const people = INTERACTIONS.filter((entry) => entry.person).map((entry, index) => ({ point: entry.position, color: entry.color, hair: index === 1 ? "#49323d" : "#393b35", player: false }));
      people.push({ point: actor.current, color: currentProps.color, hair: "#3b3338", player: true });
      people.sort((a, b) => a.point.y - b.point.y).forEach((entry) => drawPerson(ctx, entry.point, entry.color, entry.hair, entry.player ? walkCycle : Math.sin(time / 1700) * .15, entry.player ? direction : { x: 0, y: 1 }, entry.player));
      // Names and interaction markers are anchored to the world, not a list of room buttons.
      for (const entry of INTERACTIONS) {
        const checked = currentProps.discoveredPlaces.includes(entry.id);
        const active = close?.id === entry.id;
        const label = entry.person ? `${entry.person} · ${entry.id === "help" ? "사수" : entry.id === "finance" ? "운영" : "협업"}` : entry.name;
        const x = entry.position.x, y = entry.position.y - (entry.person ? 73 : 32);
        ctx.font = `600 ${13 / scale}px system-ui, sans-serif`;
        const labelWidth = ctx.measureText(label).width + 20 / scale;
        ctx.fillStyle = active ? "#fff7dd" : "#20352ce8";
        ctx.beginPath(); ctx.roundRect(x - labelWidth / 2, y - 11 / scale, labelWidth, 25 / scale, 6 / scale); ctx.fill();
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = active ? "#253c2e" : "#f3f1e5"; ctx.fillText(label, x, y + 2 / scale);
        if (entry.id !== "lobby") {
          ctx.fillStyle = checked ? "#9fcca8" : "#f3cf74"; ctx.beginPath(); ctx.arc(x, y - 24 / scale - Math.sin(time / 500) * 2, 9 / scale, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#263d2b"; ctx.font = `bold ${12 / scale}px system-ui`; ctx.fillText(checked ? "✓" : "!", x, y - 24 / scale - Math.sin(time / 500) * 2);
        }
      }
      ctx.fillStyle = "#d9ffde"; ctx.font = `bold ${12 / scale}px system-ui`; ctx.textAlign = "center"; ctx.fillText("나", actor.current.x, actor.current.y + 18 / scale);
      ctx.restore();
      // Machine-readable current state supports real interaction tests without a teleport API.
      element.dataset.x = actor.current.x.toFixed(1); element.dataset.y = actor.current.y.toFixed(1);
      element.dataset.walking = String(Boolean(path.current.length)); element.dataset.nearby = close?.id ?? "";
      if (minimapDot.current) { minimapDot.current.style.left = `${actor.current.x / WORLD.width * 100}%`; minimapDot.current.style.top = `${actor.current.y / WORLD.height * 100}%`; }
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => {
      disposed = true; cancelAnimationFrame(frameId); observer.disconnect();
      element.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearMovement); document.removeEventListener("visibilitychange", clearMovement);
      background.onload = null; background.onerror = null; heldKeys.clear();
    };
    // The loop reads changing React props through propsRef, avoiding frame-loop recreation.
  }, []);

  const current = INTERACTIONS.find((entry) => entry.id === nearby);
  return <div className={styles.world} ref={wrapper}>
    <canvas ref={canvas} className={styles.canvas} tabIndex={0} aria-label="오피스 월드" aria-describedby="world-controls" data-ready={ready} />
    {!ready ? <div className={styles.worldLoading} role="status">{failed ? "오피스를 불러오지 못했어요. 새로고침하거나 목록 모드로 체험해 주세요." : "오피스의 문을 여는 중…"}</div> : null}
    <div className={styles.minimap} aria-label="오피스 미니맵"><div><span ref={minimapDot} /></div><span>오피스 · 1층</span></div>
    <div className={styles.zoomControls} aria-label="오피스 확대 축소"><button aria-label="오피스 축소" onClick={() => { zoom.current = Math.max(.75, zoom.current - .15); }}>−</button><span>시야</span><button aria-label="오피스 확대" onClick={() => { zoom.current = Math.min(1.8, zoom.current + .15); }}>+</button></div>
    {!props.paused ? <>
      <div className={styles.walkStatus} role="status">{walking ? `${walking}까지 걸어가는 중…` : hint || ""}</div>
      <div className={styles.interactionPrompt}>{current ? <button onClick={() => { path.current = []; destination.current = null; keys.current.clear(); props.onInteract(current.id); }}><kbd>F</kbd><span>{current.person ? `${current.person}에게 말 걸기` : `${current.name} 살펴보기`}</span><span aria-hidden="true">↵</span></button> : <span>동료나 오브젝트에 가까이 다가가 보세요</span>}</div>
      <div className={styles.dpad} aria-label="이동 조작">{[{ key: "w", label: "위로 이동", arrow: "↑" }, { key: "a", label: "왼쪽으로 이동", arrow: "←" }, { key: "s", label: "아래로 이동", arrow: "↓" }, { key: "d", label: "오른쪽으로 이동", arrow: "→" }].map((entry) => <button key={entry.key} aria-label={entry.label} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); path.current = []; destination.current = null; keys.current.add(entry.key); }} onPointerUp={() => keys.current.delete(entry.key)} onPointerCancel={() => keys.current.delete(entry.key)} onLostPointerCapture={() => keys.current.delete(entry.key)}>{entry.arrow}</button>)}</div>
    </> : null}
    <div id="world-controls" className={styles.worldControls}><kbd>W A S D</kbd> / 방향키 이동 <span>·</span> 바닥 클릭으로 걷기 <span>·</span> <kbd>F</kbd> 대화</div>
  </div>;
});
