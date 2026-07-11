// @ts-ignore -- bun:test is provided by Bun at runtime; the app tsconfig only loads Vite ambient types.
import { describe, expect, test } from "bun:test";
import {
  createWorldLayout,
  groundHeightAt,
  type VegetationSpec,
  type VillaSpec,
  type WorldLayout,
} from "./layout";

const EPSILON = 1e-9;
const SPAWN_CROWN_CLEARANCE = 3;
const VILLA_CROWN_CLEARANCE = 0.45;
const MINIMUM_GARDEN_CORRIDOR_DISTANCE = 4.8;
const OPENING_HERO_BY_ID: Readonly<Record<string, true>> = {
  "villa-r1-c2-b": true,
  "villa-r1-c3-a": true,
};

type PointLike = Readonly<{ x: number; z: number }>;
type Axis = PointLike;

function distanceBetween(first: PointLike, second: PointLike): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function roadTopology(layout: WorldLayout) {
  return layout.roads.map((road) => ({
    id: road.id,
    orientation: road.orientation,
    points: road.points.map((point) => ({ x: point.x, z: point.z })),
    width: road.width,
    sidewalkWidth: road.sidewalkWidth,
  }));
}

function landmarkTopology(layout: WorldLayout) {
  return layout.landmarks.map((landmark) => ({
    id: landmark.id,
    kind: landmark.kind,
    x: landmark.x,
    z: landmark.z,
    yaw: landmark.yaw,
    width: landmark.width,
    depth: landmark.depth,
    storeys: landmark.storeys,
  }));
}

function secondaryVillaTransforms(layout: WorldLayout) {
  return layout.villas
    .filter((villa) => OPENING_HERO_BY_ID[villa.id] !== true)
    .map((villa) => ({
      id: villa.id,
      x: villa.x,
      z: villa.z,
      yaw: villa.yaw,
      width: villa.width,
      depth: villa.depth,
    }));
}

function hasChangedCommonVegetationTransform(first: WorldLayout, second: WorldLayout): boolean {
  const secondById = new Map(second.vegetation.map((tree) => [tree.id, tree] as const));
  return first.vegetation.some((tree) => {
    const counterpart = secondById.get(tree.id);
    return (
      counterpart !== undefined &&
      (tree.x !== counterpart.x ||
        tree.z !== counterpart.z ||
        tree.yaw !== counterpart.yaw ||
        tree.scale !== counterpart.scale)
    );
  });
}

function villaAxes(villa: VillaSpec): readonly [Axis, Axis] {
  const cosine = Math.cos(villa.yaw);
  const sine = Math.sin(villa.yaw);
  return [
    { x: cosine, z: -sine },
    { x: sine, z: cosine },
  ];
}

function dot(first: PointLike, second: PointLike): number {
  return first.x * second.x + first.z * second.z;
}

function villaProjectionRadius(villa: VillaSpec, axis: Axis): number {
  const [widthAxis, depthAxis] = villaAxes(villa);
  return (
    villa.width * 0.5 * Math.abs(dot(widthAxis, axis)) +
    villa.depth * 0.5 * Math.abs(dot(depthAxis, axis))
  );
}

function villasAreDetached(first: VillaSpec, second: VillaSpec): boolean {
  const centerDelta = { x: second.x - first.x, z: second.z - first.z };
  const axes = [...villaAxes(first), ...villaAxes(second)];
  return axes.some((axis) => {
    const centerDistance = Math.abs(dot(centerDelta, axis));
    const combinedRadius = villaProjectionRadius(first, axis) + villaProjectionRadius(second, axis);
    return centerDistance > combinedRadius + EPSILON;
  });
}

function distanceToVillaFootprint(point: PointLike, villa: VillaSpec): number {
  const xDistance = point.x - villa.x;
  const zDistance = point.z - villa.z;
  const cosine = Math.cos(villa.yaw);
  const sine = Math.sin(villa.yaw);
  const localX = cosine * xDistance - sine * zDistance;
  const localZ = sine * xDistance + cosine * zDistance;
  const outsideX = Math.max(Math.abs(localX) - villa.width * 0.5, 0);
  const outsideZ = Math.max(Math.abs(localZ) - villa.depth * 0.5, 0);
  return Math.hypot(outsideX, outsideZ);
}

function villaGardenEntries(layout: WorldLayout): ReadonlyArray<{
  tree: VegetationSpec;
  owner: VillaSpec | undefined;
}> {
  const entries: Array<{ tree: VegetationSpec; owner: VillaSpec | undefined }> = [];
  for (const tree of layout.vegetation) {
    if (!tree.id.startsWith("villa-") || !tree.id.includes("-garden-tree-")) {
      continue;
    }
    entries.push({
      tree,
      owner: layout.villas.find((villa) => tree.id.startsWith(`${villa.id}-garden-tree-`)),
    });
  }
  return entries;
}


describe("createWorldLayout", () => {
  test("produces structurally equal output for the same seed", () => {
    const first = createWorldLayout("repeatable-layout");
    const second = createWorldLayout("repeatable-layout");

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  test("keeps fixed road and landmark topology while secondary transforms vary by seed", () => {
    const first = createWorldLayout("layout-seed-alpha");
    const second = createWorldLayout("layout-seed-beta");

    expect(roadTopology(first)).toEqual(roadTopology(second));
    expect(landmarkTopology(first)).toEqual(landmarkTopology(second));
    expect(first.villas.map(({ id, parcel }) => ({ id, parcel }))).toEqual(
      second.villas.map(({ id, parcel }) => ({ id, parcel })),
    );
    expect(secondaryVillaTransforms(first)).not.toEqual(secondaryVillaTransforms(second));
    expect(hasChangedCommonVegetationTransform(first, second)).toBe(true);
  });

  test("defines three north-south and seven east-west pass roads with verified tree species", () => {
    const layout = createWorldLayout();
    const expectedRoads = [
      ["shaoguan", "north-south", "ornamental-peach"],
      ["ningwuguan", "north-south", "flowering-crabapple"],
      ["zijingguan", "north-south", "deodar-cedar"],
      ["zhengyangguan", "east-west", "crape-myrtle"],
      ["jiayuguan", "east-west", "five-point-maple"],
      ["juyongguan", "east-west", "ginkgo"],
      ["linhuaiguan", "east-west", "dragon-juniper"],
      ["wushengguan", "east-west", "london-plane"],
      ["hanguguan", "east-west", "london-plane"],
      ["shanhaiguan", "east-west", "london-plane"],
    ] as const;

    expect(layout.roads).toHaveLength(expectedRoads.length);
    expect(layout.roads.filter((road) => road.orientation === "north-south")).toHaveLength(3);
    expect(layout.roads.filter((road) => road.orientation === "east-west")).toHaveLength(7);

    for (const [id, orientation, treeSpecies] of expectedRoads) {
      const road = layout.roads.find((candidate) => candidate.id === id);
      expect(road).toBeDefined();
      if (road === undefined) {
        continue;
      }
      expect(road.orientation).toBe(orientation);
      expect(road.treeSpecies).toBe(treeSpecies);
      expect(road.nameEn.endsWith("Pass Road")).toBe(true);
    }
  });

  test("spawns at eye height on Ningwuguan center corridor and outside every collider", () => {
    const layout = createWorldLayout();
    const ningwuguan = layout.roads.find((road) => road.id === "ningwuguan");
    expect(ningwuguan).toBeDefined();
    if (ningwuguan === undefined) {
      return;
    }

    const [start, end] = ningwuguan.points;
    expect(ningwuguan.orientation).toBe("north-south");
    expect(start.x).toBe(end.x);
    expect(layout.spawn.x).toBe(start.x);
    expect(layout.spawn.z).toBeGreaterThanOrEqual(Math.min(start.z, end.z));
    expect(layout.spawn.z).toBeLessThanOrEqual(Math.max(start.z, end.z));
    expect(Math.abs(layout.spawn.y - groundHeightAt(layout.spawn.z) - 1.65)).toBeLessThanOrEqual(0.005);

    const intersectedColliders = layout.colliders
      .filter(
        (collider) =>
          layout.spawn.x >= collider.minX &&
          layout.spawn.x <= collider.maxX &&
          layout.spawn.z >= collider.minZ &&
          layout.spawn.z <= collider.maxZ,
      )
      .map((collider) => collider.id);
    expect(intersectedColliders).toEqual([]);
  });

  test("keeps every ordinary villa detached, parcel-contained, and two or three storeys", () => {
    const layout = createWorldLayout();
    expect(layout.villas.length).toBeGreaterThan(0);

    for (const villa of layout.villas) {
      const parcelWidth = villa.parcel.maxX - villa.parcel.minX;
      const parcelDepth = villa.parcel.maxZ - villa.parcel.minZ;
      const cosine = Math.abs(Math.cos(villa.yaw));
      const sine = Math.abs(Math.sin(villa.yaw));
      const halfX = (cosine * villa.width + sine * villa.depth) * 0.5;
      const halfZ = (sine * villa.width + cosine * villa.depth) * 0.5;

      expect([2, 3]).toContain(villa.storeys);
      expect(villa.width / parcelWidth).toBeGreaterThanOrEqual(0.45);
      expect(villa.width / parcelWidth).toBeLessThanOrEqual(0.7);
      expect(villa.depth / parcelDepth).toBeGreaterThanOrEqual(0.5);
      expect(villa.depth / parcelDepth).toBeLessThanOrEqual(0.85);
      expect(villa.x - halfX).toBeGreaterThanOrEqual(villa.parcel.minX - EPSILON);
      expect(villa.x + halfX).toBeLessThanOrEqual(villa.parcel.maxX + EPSILON);
      expect(villa.z - halfZ).toBeGreaterThanOrEqual(villa.parcel.minZ - EPSILON);
      expect(villa.z + halfZ).toBeLessThanOrEqual(villa.parcel.maxZ + EPSILON);
    }

    const attachedPairs: string[] = [];
    for (let firstIndex = 0; firstIndex < layout.villas.length; firstIndex += 1) {
      const first = layout.villas[firstIndex];
      if (first === undefined) {
        continue;
      }
      for (let secondIndex = firstIndex + 1; secondIndex < layout.villas.length; secondIndex += 1) {
        const second = layout.villas[secondIndex];
        if (second !== undefined && !villasAreDetached(first, second)) {
          attachedPairs.push(`${first.id}/${second.id}`);
        }
      }
    }
    expect(attachedPairs).toEqual([]);
  });

  test("preserves both opening hero styles and the Ningwuguan destination sign", () => {
    const layout = createWorldLayout();
    const westHero = layout.villas.find((villa) => villa.id === "villa-r1-c2-b");
    const eastHero = layout.villas.find((villa) => villa.id === "villa-r1-c3-a");

    expect(
      westHero && {
        archetype: westHero.archetype,
        facade: westHero.facade,
        roof: westHero.roof,
      },
    ).toEqual({
      archetype: "hipped-veranda",
      facade: "muted-brick",
      roof: "terracotta-red",
    });
    expect(
      eastHero && {
        archetype: eastHero.archetype,
        facade: eastHero.facade,
        roof: eastHero.roof,
      },
    ).toEqual({
      archetype: "half-timbered",
      facade: "sage-grey",
      roof: "muted-green",
    });

    expect(layout.landmarks.find((landmark) => landmark.id === "huashi-inspired-coastal-villa")?.kind).toBe(
      "huashi-inspired",
    );
    expect(layout.landmarks.find((landmark) => landmark.id === "blue-green-garden-villa")?.kind).toBe(
      "blue-green-villa",
    );

    const sign = layout.furniture.find((item) => item.id === "sign-ningwuguan");
    expect(sign).toBeDefined();
    if (sign === undefined) {
      return;
    }
    expect(sign.kind).toBe("street-sign");
    expect(sign.labelZh).toBe("宁武关路");
    expect(sign.labelEn).toBe("Ningwuguan Pass Road");
    expect({ x: sign.x, z: sign.z }).toEqual({ x: -4.65, z: -47.2 });
  });

  test("keeps vegetation outside the spawn keepout and prevents dangerous crown penetration", () => {
    const layout = createWorldLayout();
    const spawnViolations = layout.vegetation
      .filter(
        (tree) =>
          distanceBetween(tree, layout.spawn) + EPSILON < tree.canopyRadius + SPAWN_CROWN_CLEARANCE,
      )
      .map((tree) => tree.id);
    expect(spawnViolations).toEqual([]);

    const gardenEntries = villaGardenEntries(layout);
    expect(gardenEntries.length).toBeGreaterThan(0);
    const ownerClearanceViolations: string[] = [];
    for (const { tree, owner } of gardenEntries) {
      if (
        owner === undefined ||
        distanceToVillaFootprint(tree, owner) + EPSILON < tree.canopyRadius + VILLA_CROWN_CLEARANCE
      ) {
        ownerClearanceViolations.push(tree.id);
      }
    }
    expect(ownerClearanceViolations).toEqual([]);

    const corridorTrees = layout.vegetation.filter((tree) => tree.corridorId !== undefined);
    expect(corridorTrees.length).toBeGreaterThan(0);
    const gardenTrees = gardenEntries.map(({ tree }) => tree);
    const directPenetrations: string[] = [];

    for (let firstIndex = 0; firstIndex < corridorTrees.length; firstIndex += 1) {
      const first = corridorTrees[firstIndex];
      if (first === undefined) {
        continue;
      }
      for (let secondIndex = firstIndex + 1; secondIndex < corridorTrees.length; secondIndex += 1) {
        const second = corridorTrees[secondIndex];
        if (
          second !== undefined &&
          distanceBetween(first, second) + EPSILON < first.canopyRadius + second.canopyRadius
        ) {
          directPenetrations.push(`${first.id}/${second.id}`);
        }
      }
    }

    for (let gardenIndex = 0; gardenIndex < gardenTrees.length; gardenIndex += 1) {
      const garden = gardenTrees[gardenIndex];
      if (garden === undefined) {
        continue;
      }
      for (const corridor of corridorTrees) {
        const minimumDistance = Math.max(
          MINIMUM_GARDEN_CORRIDOR_DISTANCE,
          garden.canopyRadius + corridor.canopyRadius * 0.65,
        );
        if (distanceBetween(garden, corridor) + EPSILON < minimumDistance) {
          directPenetrations.push(`${garden.id}/${corridor.id}`);
        }
      }
      for (let otherIndex = gardenIndex + 1; otherIndex < gardenTrees.length; otherIndex += 1) {
        const other = gardenTrees[otherIndex];
        if (
          other !== undefined &&
          distanceBetween(garden, other) + EPSILON < garden.canopyRadius + other.canopyRadius
        ) {
          directPenetrations.push(`${garden.id}/${other.id}`);
        }
      }
    }
    expect(directPenetrations).toEqual([]);
  });

  test("places the sea south of the district with terrain descending toward it", () => {
    const layout = createWorldLayout();
    expect(layout.sea.minZ).toBeGreaterThan(layout.spawn.z);
    expect(layout.sea.maxZ).toBe(layout.bounds.maxZ);
    expect(layout.hill.minZ).toBe(layout.bounds.minZ);
    expect(layout.hill.maxZ).toBeLessThan(layout.spawn.z);

    const northToSouthSamples = [
      layout.bounds.minZ,
      layout.hill.maxZ,
      layout.spawn.z,
      0,
      layout.sea.minZ,
      layout.sea.maxZ,
    ];
    for (let index = 1; index < northToSouthSamples.length; index += 1) {
      const northZ = northToSouthSamples[index - 1];
      const southZ = northToSouthSamples[index];
      if (northZ === undefined || southZ === undefined) {
        continue;
      }
      expect(southZ).toBeGreaterThan(northZ);
      expect(groundHeightAt(southZ)).toBeLessThan(groundHeightAt(northZ));
    }
  });
});
