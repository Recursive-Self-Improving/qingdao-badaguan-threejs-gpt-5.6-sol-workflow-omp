// The app's production typecheck intentionally omits Bun globals; Bun provides this module at test runtime.
// @ts-expect-error -- no @types/bun dependency is present in the production bundle.
import { describe, expect, test } from "bun:test";
import { Vector3 } from "three";

import type { Aabb2, Bounds2 } from "../world/layout";
import { CollisionWorld } from "./CollisionWorld";

const DEFAULT_BOUNDS = {
  minX: -10,
  maxX: 10,
  minZ: -10,
  maxZ: 10,
} satisfies Bounds2;

function createWorld(
  colliders: readonly Aabb2[] = [],
  bounds: Bounds2 = DEFAULT_BOUNDS,
): CollisionWorld {
  return new CollisionWorld(bounds, colliders, 1);
}

describe("CollisionWorld", () => {
  test("isFree accepts open and tangent space and rejects circle overlap", () => {
    const collider = {
      id: "unit-blocker",
      minX: 0,
      maxX: 1,
      minZ: 0,
      maxZ: 1,
    } satisfies Aabb2;
    const world = createWorld([collider]);
    const radius = 0.5;

    expect(world.isFree({ x: -3, z: -3 }, radius)).toBe(true);
    expect(world.isFree({ x: -radius, z: 0.5 }, radius)).toBe(true);
    expect(world.isFree({ x: -0.49, z: 0.5 }, radius)).toBe(false);
    expect(world.isFree({ x: -0.4, z: -0.4 }, radius)).toBe(true);
    expect(world.isFree({ x: -0.3, z: -0.3 }, radius)).toBe(false);
  });

  test("resolveMove applies an unobstructed displacement", () => {
    const world = createWorld();
    const out = new Vector3(99, 99, 99);

    const result = world.resolveMove(
      new Vector3(-1, 4, 2),
      new Vector3(2.25, 0.5, -1.25),
      0.5,
      out,
    );

    expect(result).toBe(out);
    expect(result.x).toBeCloseTo(1.25, 10);
    expect(result.y).toBeCloseTo(4.5, 10);
    expect(result.z).toBeCloseTo(0.75, 10);
  });

  test("resolveMove stops a direct move at radius-safe AABB contact", () => {
    const collider = {
      id: "direct-blocker",
      minX: 1,
      maxX: 2,
      minZ: -1,
      maxZ: 1,
    } satisfies Aabb2;
    const world = createWorld([collider]);
    const radius = 0.5;
    const safeContactX = collider.minX - radius;

    const result = world.resolveMove(
      new Vector3(-2, 3, 0),
      new Vector3(3, 0, 0),
      radius,
      new Vector3(),
    );

    expect(result.x).toBeGreaterThan(safeContactX - 0.001);
    expect(result.x).toBeLessThanOrEqual(safeContactX);
    expect(result.z).toBeCloseTo(0, 10);
    expect(world.isFree(result, radius)).toBe(true);
  });

  test("resolveMove slides a diagonal move along the unblocked axis", () => {
    const wall = {
      id: "long-wall",
      minX: 0,
      maxX: 1,
      minZ: -5,
      maxZ: 5,
    } satisfies Aabb2;
    const world = createWorld([wall]);
    const radius = 0.5;
    const safeContactX = wall.minX - radius;

    const result = world.resolveMove(
      new Vector3(-2, 2, -2),
      new Vector3(4, 0, 4),
      radius,
      new Vector3(),
    );

    expect(result.x).toBeGreaterThan(safeContactX - 0.001);
    expect(result.x).toBeLessThanOrEqual(safeContactX);
    expect(result.z).toBeCloseTo(2, 10);
    expect(world.isFree(result, radius)).toBe(true);
  });

  test("resolveMove substeps a large displacement instead of tunneling", () => {
    const narrowBlocker = {
      id: "narrow-blocker",
      minX: -0.1,
      maxX: 0.1,
      minZ: -1,
      maxZ: 1,
    } satisfies Aabb2;
    const world = createWorld([narrowBlocker], {
      minX: -12,
      maxX: 12,
      minZ: -3,
      maxZ: 3,
    });
    const radius = 0.25;
    const safeContactX = narrowBlocker.minX - radius;

    const result = world.resolveMove(
      new Vector3(-8, 1, 0),
      new Vector3(16, 0, 0),
      radius,
      new Vector3(),
    );

    expect(result.x).toBeGreaterThan(safeContactX - 0.001);
    expect(result.x).toBeLessThanOrEqual(safeContactX);
    expect(result.x).toBeLessThan(0);
    expect(world.isFree(result, radius)).toBe(true);
  });

  test("resolveMove clamps the circle inside world bounds", () => {
    const bounds = {
      minX: -2,
      maxX: 3,
      minZ: -4,
      maxZ: 5,
    } satisfies Bounds2;
    const world = createWorld([], bounds);
    const radius = 0.75;

    const result = world.resolveMove(
      new Vector3(0, 2, 0),
      new Vector3(10, 0, -10),
      radius,
      new Vector3(),
    );

    expect(result.x).toBeCloseTo(bounds.maxX - radius, 10);
    expect(result.z).toBeCloseTo(bounds.minZ + radius, 10);
    expect(world.isFree(result, radius)).toBe(true);
    expect(world.isFree({ x: result.x + 0.001, z: result.z }, radius)).toBe(false);
    expect(world.isFree({ x: result.x, z: result.z - 0.001 }, radius)).toBe(false);
  });

  test("resolveMove passes Y through without mutating caller vectors", () => {
    const collider = {
      id: "y-blocker",
      minX: 1,
      maxX: 2,
      minZ: -1,
      maxZ: 1,
    } satisfies Aabb2;
    const world = createWorld([collider]);
    const position = new Vector3(-2, 6, 0);
    const displacement = new Vector3(3, -1.25, 0);
    const originalPosition = position.clone();
    const originalDisplacement = displacement.clone();

    const result = world.resolveMove(
      position,
      displacement,
      0.5,
      new Vector3(100, 100, 100),
    );

    expect(result.y).toBe(4.75);
    expect(position.toArray()).toEqual(originalPosition.toArray());
    expect(displacement.toArray()).toEqual(originalDisplacement.toArray());
  });

  test("resolveMove is stable when the same output vector is reused", () => {
    const collider = {
      id: "reused-output-blocker",
      minX: 1,
      maxX: 2,
      minZ: -2,
      maxZ: 2,
    } satisfies Aabb2;
    const world = createWorld([collider]);
    const position = new Vector3(-2, 3, 0);
    const displacement = new Vector3(4, 0.25, 1);
    const out = new Vector3();

    const firstResult = world.resolveMove(position, displacement, 0.5, out);
    const firstValues = firstResult.toArray();
    out.set(999, 999, 999);
    const secondResult = world.resolveMove(position, displacement, 0.5, out);

    expect(firstResult).toBe(out);
    expect(secondResult).toBe(out);
    expect(secondResult.toArray()).toEqual(firstValues);
  });
});
