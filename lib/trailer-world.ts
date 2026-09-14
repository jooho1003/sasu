export type Point = { x: number; y: number };
export type PlaceId = "library" | "meeting" | "inbox" | "finance" | "partner" | "messenger" | "help" | "lobby" | "archive";
export const WORLD = { width: 1536, height: 1024 };
export const SPAWN: Point = { x: 735, y: 780 };
export const ACTOR_RADIUS = 11;
export const INTERACT_RADIUS = 62;
export const INTERACTIONS: { id: PlaceId; name: string; detail: string; person: string | null; color: string; position: Point; approach: Point }[] = [
  { id: "library", name: "서고", detail: "우리 팀의 원칙", person: null, color: "#86b4e8", position: { x: 510, y: 154 }, approach: { x: 510, y: 183 } },
  { id: "meeting", name: "회의실", detail: "지난 회의의 맥락", person: null, color: "#c6aceb", position: { x: 1117, y: 132 }, approach: { x: 1139, y: 155 } },
  { id: "inbox", name: "팀장실", detail: "결정 작성하기", person: null, color: "#f0c570", position: { x: 1332, y: 285 }, approach: { x: 1332, y: 318 } },
  { id: "finance", name: "운영 사무실", detail: "예산·일정 물어보기", person: "지훈", color: "#88aecf", position: { x: 355, y: 580 }, approach: { x: 355, y: 621 } },
  { id: "partner", name: "협업 사무실", detail: "고객·협력사 물어보기", person: "서연", color: "#dfb47f", position: { x: 355, y: 738 }, approach: { x: 355, y: 777 } },
  { id: "messenger", name: "메신저 단말", detail: "팀원의 메시지", person: null, color: "#86c5b0", position: { x: 98, y: 680 }, approach: { x: 113, y: 684 } },
  { id: "help", name: "휴게실", detail: "사수에게 도움받기", person: "민서", color: "#a9bf87", position: { x: 1025, y: 788 }, approach: { x: 1060, y: 798 } },
  { id: "lobby", name: "로비", detail: "오늘의 퀘스트", person: null, color: "#9ecfaf", position: { x: 735, y: 740 }, approach: { x: 735, y: 777 } },
  { id: "archive", name: "기록실", detail: "결정 후 열리는 이야기", person: null, color: "#e9ae91", position: { x: 1240, y: 669 }, approach: { x: 1238, y: 707 } },
];

// Foot-space collision geometry hand-aligned to office-world.png (1536×1024).
export const OBSTACLES: readonly [number, number, number, number][] = [
  [614, 76, 24, 335], [85, 366, 274, 34], [453, 366, 180, 34],
  [813, 79, 18, 321], [1168, 80, 24, 321], [830, 332, 105, 68], [1048, 332, 128, 68],
  [1195, 366, 30, 34], [1334, 366, 113, 34],
  [85, 498, 79, 29], [319, 498, 316, 29], [616, 499, 23, 330],
  [815, 495, 16, 248], [1160, 495, 29, 333], [1190, 498, 9, 30], [1286, 498, 160, 30],
  [151, 82, 420, 80], [272, 192, 202, 129], [97, 151, 96, 111], [540, 205, 48, 79],
  [900, 199, 185, 87], [845, 110, 43, 54], [1085, 100, 42, 57],
  [1249, 174, 158, 125], [1240, 325, 65, 49], [1228, 93, 160, 68],
  [130, 575, 176, 79], [414, 575, 169, 79], [130, 709, 176, 78], [414, 709, 169, 78],
  [852, 490, 276, 86], [875, 595, 201, 77], [912, 680, 113, 78], [1040, 690, 57, 69],
  [1195, 598, 160, 84], [1280, 735, 108, 65], [1386, 573, 52, 240],
];

export function canWalk(point: Point): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (point.x < 85 + ACTOR_RADIUS || point.x > 1447 - ACTOR_RADIUS || point.y < 105 + ACTOR_RADIUS || point.y > 828 - ACTOR_RADIUS) return false;
  return !OBSTACLES.some(([x, y, width, height]) => {
    const nearestX = Math.max(x, Math.min(point.x, x + width));
    const nearestY = Math.max(y, Math.min(point.y, y + height));
    return Math.hypot(point.x - nearestX, point.y - nearestY) < ACTOR_RADIUS;
  });
}

export function moveActor(start: Point, delta: Point): Point {
  let position = { ...start };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 5));
  for (let index = 0; index < steps; index++) {
    const horizontal = { x: position.x + delta.x / steps, y: position.y };
    if (canWalk(horizontal)) position = horizontal;
    const vertical = { x: position.x, y: position.y + delta.y / steps };
    if (canWalk(vertical)) position = vertical;
  }
  return position;
}

const GRID = 16;
const COLS = WORLD.width / GRID;
const ROWS = WORLD.height / GRID;
const center = (id: number): Point => ({ x: (id % COLS) * GRID + GRID / 2, y: Math.floor(id / COLS) * GRID + GRID / 2 });
const cell = (point: Point) => Math.floor(point.y / GRID) * COLS + Math.floor(point.x / GRID);
let walkable: Uint8Array | undefined;

/** A small cardinal grid prevents paths from cutting diagonally through furniture corners. */
export function findPath(start: Point, destination: Point): Point[] {
  if (!canWalk(start) || !canWalk(destination)) return [];
  walkable ??= Uint8Array.from({ length: COLS * ROWS }, (_, id) => Number(canWalk(center(id))));
  const startCell = cell(start);
  let goal = cell(destination);
  if (!walkable[goal]) {
    const alternate = [goal - 1, goal + 1, goal - COLS, goal + COLS].find((id) => walkable![id] && Math.hypot(center(id).x - destination.x, center(id).y - destination.y) < 24);
    if (alternate === undefined) return [];
    goal = alternate;
  }
  const visited = new Int32Array(COLS * ROWS).fill(-1);
  visited[startCell] = startCell;
  const queue = [startCell];
  for (let index = 0; index < queue.length && visited[goal] === -1; index++) {
    const current = queue[index];
    for (const next of [current - COLS, current + COLS, current - 1, current + 1]) {
      if (next < 0 || next >= visited.length || !walkable[next] || visited[next] !== -1) continue;
      if (Math.abs(next - current) === 1 && Math.floor(next / COLS) !== Math.floor(current / COLS)) continue;
      visited[next] = current;
      queue.push(next);
    }
  }
  if (visited[goal] === -1) return [];
  const path: Point[] = [];
  for (let current = goal; current !== startCell; current = visited[current]) path.push(center(current));
  path.reverse();
  path.push(destination);
  return path;
}

export function nearbyInteraction(point: Point) {
  return INTERACTIONS.map((entry) => ({ entry, distance: Math.hypot(entry.position.x - point.x, entry.position.y - point.y) }))
    .filter(({ distance }) => distance <= INTERACT_RADIUS)
    .sort((a, b) => a.distance - b.distance)[0]?.entry ?? null;
}
