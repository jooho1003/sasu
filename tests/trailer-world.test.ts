import { describe, expect, it } from "vitest";
import { WORLD, SPAWN, INTERACTIONS, canWalk, moveActor, findPath, nearbyInteraction } from "@/lib/trailer-world";

describe("오피스 공간 이동", () => {
  it("입구는 걸을 수 있고 외벽과 책상은 통과할 수 없다", () => {
    expect(canWalk(SPAWN)).toBe(true);
    expect(canWalk({ x: 15, y: 15 })).toBe(false);
    expect(canWalk({ x: 350, y: 245 })).toBe(false);
    expect(canWalk({ x: WORLD.width + 1, y: 600 })).toBe(false);
  });
  it("충돌에 가로막히면 가구 안으로 들어가지 않는다", () => {
    const start = { x: 350, y: 340 };
    const moved = moveActor(start, { x: 0, y: -200 });
    expect(canWalk(moved)).toBe(true);
    expect(moved.y).toBeGreaterThan(320);
  });
  it("긴 프레임 이동도 벽을 관통하지 않는다", () => {
    const result = moveActor({ x: 680, y: 250 }, { x: -550, y: 0 });
    expect(result.x).toBeGreaterThan(635);
    expect(canWalk(result)).toBe(true);
  });
  it("대각선으로 벽에 걸려도 열린 축을 따라 움직인다", () => {
    const result = moveActor({ x: 650, y: 250 }, { x: -50, y: 40 });
    expect(result.x).toBeGreaterThan(635);
    expect(result.y).toBeGreaterThan(250);
  });
  it("모든 상호작용 장소에 걸어서 도달한다", () => {
    for (const place of INTERACTIONS) {
      expect(canWalk(place.approach), place.id).toBe(true);
      const path = findPath(SPAWN, place.approach);
      expect(path.length, place.id).toBeGreaterThan(0);
      expect(path.every(canWalk), place.id).toBe(true);
      const end = path[path.length - 1];
      expect(Math.hypot(end.x - place.approach.x, end.y - place.approach.y), place.id).toBeLessThan(24);
      expect(nearbyInteraction(place.approach)?.id, place.id).toBe(place.id);
    }
  });
  it("가구 내부·맵 외부 목적지는 경로를 만들지 않는다", () => {
    expect(findPath(SPAWN, { x: 350, y: 245 })).toEqual([]);
    expect(findPath(SPAWN, { x: -300, y: 245 })).toEqual([]);
  });
  it("멀리 있는 장소는 상호작용하지 않는다", () => {
    expect(nearbyInteraction({ x: 730, y: 430 })).toBeNull();
  });
});
