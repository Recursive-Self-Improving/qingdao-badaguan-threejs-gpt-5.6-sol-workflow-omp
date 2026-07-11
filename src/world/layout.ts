import { ATMOSPHERE, DEFAULT_SEED } from "../config";

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

export interface Bounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

type ColliderKind = "building" | "wall" | "landmark" | "furniture" | "terrain";

export interface Aabb2 extends Bounds2 {
  readonly id: string;
  readonly kind?: ColliderKind;
}

export interface SpawnPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

type TreeSpecies =
  | "ornamental-peach"
  | "flowering-crabapple"
  | "deodar-cedar"
  | "crape-myrtle"
  | "five-point-maple"
  | "ginkgo"
  | "dragon-juniper"
  | "london-plane"
  | "black-pine"
  | "chinese-cedar"
  | "chinese-sweetgum"
  | "maidenhair-tree"
  | "waxberry";

type FoliageTone = "green" | "deep-green" | "blue-green" | "gold";

export interface RoadSpec {
  readonly id: string;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly orientation: "north-south" | "east-west";
  readonly points: readonly [Point2, Point2];
  readonly width: number;
  readonly sidewalkWidth: number;
  readonly treeSpecies: TreeSpecies;
  readonly treeSpacing: number;
}

type VillaArchetype =
  | "red-tile-gabled"
  | "hipped-veranda"
  | "half-timbered"
  | "restrained-art-deco";

type FacadeFamily = "warm-ivory" | "sand-ochre" | "muted-brick" | "sage-grey";
type RoofFamily = "terracotta-red" | "weathered-umber" | "charcoal-slate" | "muted-green";

export interface VillaSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly storeys: 2 | 3;
  readonly archetype: VillaArchetype;
  readonly facade: FacadeFamily;
  readonly roof: RoofFamily;
  readonly parcel: Bounds2;
  readonly entrance: "north" | "south";
}

export interface LandmarkSpec {
  readonly id: string;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly kind: "huashi-inspired" | "blue-green-villa";
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly storeys: 2 | 3;
  readonly facade: "rough-granite" | "muted-blue-green";
  readonly roof: "terracotta-red" | "muted-green";
  readonly features: readonly string[];
}

export interface VegetationSpec {
  readonly id: string;
  readonly species: TreeSpecies;
  readonly corridorId?: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly height: number;
  readonly canopyRadius: number;
  readonly foliage: FoliageTone;
}

interface WallSpec {
  readonly id: string;
  readonly from: Point2;
  readonly to: Point2;
  readonly height: number;
  readonly width: number;
  readonly material: "granite" | "brick";
}

interface FurnitureSpec {
  readonly id: string;
  readonly kind: "street-sign" | "lamp" | "bench";
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly labelZh?: string;
  readonly labelEn?: string;
}

interface SeaBand {
  readonly minZ: number;
  readonly maxZ: number;
  readonly level: number;
}

interface HillBand {
  readonly minZ: number;
  readonly maxZ: number;
  readonly baseHeight: number;
  readonly crestHeight: number;
}

export interface WorldLayout {
  readonly seed: string;
  readonly bounds: Bounds2;
  readonly spawn: SpawnPose;
  readonly roads: readonly RoadSpec[];
  readonly villas: readonly VillaSpec[];
  readonly landmarks: readonly LandmarkSpec[];
  readonly vegetation: readonly VegetationSpec[];
  readonly walls: readonly WallSpec[];
  readonly furniture: readonly FurnitureSpec[];
  readonly sea: SeaBand;
  readonly hill: HillBand;
  readonly colliders: readonly Aabb2[];
}

interface RandomStream {
  (): number;
}

interface TreeTraits {
  readonly height: number;
  readonly canopyRadius: number;
  readonly foliage: FoliageTone;
}

const WORLD_BOUNDS: Bounds2 = deepFreeze({
  minX: -92,
  maxX: 92,
  minZ: -78,
  maxZ: 104,
});

const SEA_BAND: SeaBand = deepFreeze({
  minZ: 72,
  maxZ: 104,
  level: ATMOSPHERE.seaLevel,
});

const HILL_BAND: HillBand = deepFreeze({
  minZ: -78,
  maxZ: -70,
  baseHeight: 4.15,
  crestHeight: 18.5,
});

const SPAWN_X = 0;
const SPAWN_Z = -56;
const TREE_SPAWN_CLEARANCE = 3;
const VILLA_TREE_CLEARANCE = 0.45;
const MIN_GARDEN_TREE_SCALE = 0.62;

const VILLA_COLUMNS: readonly Bounds2[] = deepFreeze([
  { minX: -88, maxX: -53, minZ: 0, maxZ: 0 },
  { minX: -43, maxX: -5.4, minZ: 0, maxZ: 0 },
  { minX: 5.4, maxX: 43, minZ: 0, maxZ: 0 },
  { minX: 53, maxX: 88, minZ: 0, maxZ: 0 },
]);

const VILLA_ROWS: readonly Bounds2[] = deepFreeze([
  { minX: 0, maxX: 0, minZ: -61.6, maxZ: -49.4 },
  { minX: 0, maxX: 0, minZ: -40.6, maxZ: -28.4 },
  { minX: 0, maxX: 0, minZ: -19.6, maxZ: -7.4 },
  { minX: 0, maxX: 0, minZ: 1.4, maxZ: 13.6 },
  { minX: 0, maxX: 0, minZ: 22.4, maxZ: 34.6 },
  { minX: 0, maxX: 0, minZ: 43.4, maxZ: 53.4 },
]);

const ARCHETYPES: readonly VillaArchetype[] = deepFreeze([
  "red-tile-gabled",
  "hipped-veranda",
  "half-timbered",
  "restrained-art-deco",
]);

const FACADES: readonly FacadeFamily[] = deepFreeze([
  "warm-ivory",
  "sand-ochre",
  "muted-brick",
  "sage-grey",
]);

const ROOFS: readonly RoofFamily[] = deepFreeze([
  "terracotta-red",
  "weathered-umber",
  "charcoal-slate",
  "muted-green",
]);

const GARDEN_SPECIES: readonly TreeSpecies[] = deepFreeze([
  "black-pine",
  "chinese-cedar",
  "chinese-sweetgum",
  "waxberry",
  "deodar-cedar",
  "five-point-maple",
]);

const HILL_SPECIES: readonly TreeSpecies[] = deepFreeze([
  "black-pine",
  "deodar-cedar",
  "chinese-cedar",
  "london-plane",
]);

const COAST_SPECIES: readonly TreeSpecies[] = deepFreeze([
  "black-pine",
  "dragon-juniper",
  "london-plane",
  "waxberry",
]);

const TREE_TRAITS: Readonly<Record<TreeSpecies, TreeTraits>> = deepFreeze({
  "ornamental-peach": { height: 5.2, canopyRadius: 3.1, foliage: "green" },
  "flowering-crabapple": { height: 6.2, canopyRadius: 2.8, foliage: "green" },
  "deodar-cedar": { height: 12.5, canopyRadius: 3.7, foliage: "blue-green" },
  "crape-myrtle": { height: 6.1, canopyRadius: 2.8, foliage: "green" },
  "five-point-maple": { height: 10.8, canopyRadius: 4.2, foliage: "green" },
  ginkgo: { height: 12.2, canopyRadius: 3.8, foliage: "gold" },
  "dragon-juniper": { height: 8.4, canopyRadius: 2.6, foliage: "blue-green" },
  "london-plane": { height: 14.2, canopyRadius: 5.2, foliage: "deep-green" },
  "black-pine": { height: 11.4, canopyRadius: 4.1, foliage: "deep-green" },
  "chinese-cedar": { height: 12.8, canopyRadius: 3.9, foliage: "blue-green" },
  "chinese-sweetgum": { height: 10.6, canopyRadius: 4.3, foliage: "green" },
  "maidenhair-tree": { height: 10.9, canopyRadius: 3.6, foliage: "gold" },
  waxberry: { height: 6.8, canopyRadius: 3.5, foliage: "deep-green" },
});

const ROAD_BLUEPRINTS: readonly RoadSpec[] = deepFreeze([
  {
    id: "shaoguan",
    nameZh: "韶关路",
    nameEn: "Shaoguan Pass Road",
    orientation: "north-south",
    points: [{ x: -48, z: -72 }, { x: -48, z: 70 }],
    width: 6.4,
    sidewalkWidth: 1.1,
    treeSpecies: "ornamental-peach",
    treeSpacing: 10.5,
  },
  {
    id: "ningwuguan",
    nameZh: "宁武关路",
    nameEn: "Ningwuguan Pass Road",
    orientation: "north-south",
    points: [{ x: 0, z: -72 }, { x: 0, z: 70 }],
    width: 7.2,
    sidewalkWidth: 1.2,
    treeSpecies: "flowering-crabapple",
    treeSpacing: 10.5,
  },
  {
    id: "zijingguan",
    nameZh: "紫荆关路",
    nameEn: "Zijingguan Pass Road",
    orientation: "north-south",
    points: [{ x: 48, z: -72 }, { x: 48, z: 70 }],
    width: 6.6,
    sidewalkWidth: 1.1,
    treeSpecies: "deodar-cedar",
    treeSpacing: 11,
  },
  {
    id: "zhengyangguan",
    nameZh: "正阳关路",
    nameEn: "Zhengyangguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: -66 }, { x: 88, z: -66 }],
    width: 6.2,
    sidewalkWidth: 1.1,
    treeSpecies: "crape-myrtle",
    treeSpacing: 12,
  },
  {
    id: "jiayuguan",
    nameZh: "嘉峪关路",
    nameEn: "Jiayuguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: -45 }, { x: 88, z: -45 }],
    width: 5.8,
    sidewalkWidth: 1,
    treeSpecies: "five-point-maple",
    treeSpacing: 12,
  },
  {
    id: "juyongguan",
    nameZh: "居庸关路",
    nameEn: "Juyongguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: -24 }, { x: 88, z: -24 }],
    width: 6,
    sidewalkWidth: 1.1,
    treeSpecies: "ginkgo",
    treeSpacing: 12.5,
  },
  {
    id: "linhuaiguan",
    nameZh: "临淮关路",
    nameEn: "Linhuaiguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: -3 }, { x: 88, z: -3 }],
    width: 5.8,
    sidewalkWidth: 1,
    treeSpecies: "dragon-juniper",
    treeSpacing: 11.5,
  },
  {
    id: "wushengguan",
    nameZh: "武胜关路",
    nameEn: "Wushengguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: 18 }, { x: 88, z: 18 }],
    width: 6.4,
    sidewalkWidth: 1.1,
    treeSpecies: "london-plane",
    treeSpacing: 13,
  },
  {
    id: "hanguguan",
    nameZh: "函谷关路",
    nameEn: "Hanguguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: 39 }, { x: 88, z: 39 }],
    width: 6,
    sidewalkWidth: 1.1,
    treeSpecies: "london-plane",
    treeSpacing: 13,
  },
  {
    id: "shanhaiguan",
    nameZh: "山海关路",
    nameEn: "Shanhaiguan Pass Road",
    orientation: "east-west",
    points: [{ x: -88, z: 58 }, { x: 88, z: 58 }],
    width: 6.2,
    sidewalkWidth: 1.2,
    treeSpecies: "london-plane",
    treeSpacing: 13,
  },
]);

const HUASHI_PARCEL: Bounds2 = deepFreeze({
  minX: -78.5,
  maxX: -55.5,
  minZ: 62.7,
  maxZ: 71.2,
});

const BLUE_GREEN_PARCEL: Bounds2 = deepFreeze({
  minX: 70.25,
  maxX: 88,
  minZ: 22.4,
  maxZ: 34.6,
});

const LANDMARKS: readonly LandmarkSpec[] = deepFreeze([
  {
    id: "huashi-inspired-coastal-villa",
    nameZh: "花石意象海滨别墅",
    nameEn: "Huashi-inspired Coastal Villa",
    kind: "huashi-inspired",
    x: -67,
    z: 67.1,
    yaw: 0.02,
    width: 15.8,
    depth: 8.8,
    storeys: 3,
    facade: "rough-granite",
    roof: "terracotta-red",
    features: [
      "rough-granite-masonry",
      "crenellated-round-tower",
      "red-tile-roof",
      "slender-green-spire",
    ],
  },
  {
    id: "blue-green-garden-villa",
    nameZh: "蓝绿花园别墅",
    nameEn: "Blue-green Garden Villa",
    kind: "blue-green-villa",
    x: 79,
    z: 28.5,
    yaw: 3.12,
    width: 10.8,
    depth: 7.3,
    storeys: 2,
    facade: "muted-blue-green",
    roof: "muted-green",
    features: ["low-hipped-roof", "white-window-trim", "shallow-corner-bay"],
  },
]);

const NORTH_SOUTH_BREAKS: readonly number[] = deepFreeze([-72, -66, -45, -24, -3, 18, 39, 58, 70]);
const EAST_WEST_BREAKS: readonly number[] = deepFreeze([-88, -48, 0, 48, 88]);
const COAST_TREE_X: readonly number[] = deepFreeze([
  -86,
  -82,
  -54,
  -38,
  -28,
  -17,
  -8,
  9,
  19,
  30,
  39,
  57,
  72,
  84,
]);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }

  return Object.freeze(value);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRandomStream(seed: string, streamName: string): RandomStream {
  let state = fnv1a(`${seed}\u241f${streamName}`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function quantize(value: number): number {
  return Math.round(value * 100) / 100;
}

function range(random: RandomStream, minimum: number, maximum: number): number {
  return minimum + (maximum - minimum) * random();
}

function pick<T>(random: RandomStream, choices: readonly T[]): T {
  const choice = choices[Math.floor(random() * choices.length)];
  if (choice === undefined) {
    throw new Error("A deterministic choice stream received an empty collection");
  }
  return choice;
}

function pickDifferent<T>(random: RandomStream, choices: readonly T[], previous: T | undefined): T {
  if (previous === undefined || choices.length < 2) {
    return pick(random, choices);
  }

  const previousIndex = choices.indexOf(previous);
  if (previousIndex < 0) {
    return pick(random, choices);
  }

  const candidateIndex = Math.floor(random() * (choices.length - 1));
  const choice = choices[candidateIndex >= previousIndex ? candidateIndex + 1 : candidateIndex];
  if (choice === undefined) {
    throw new Error("A deterministic choice stream received an empty collection");
  }
  return choice;
}

export function groundHeightAt(z: number): number {
  return 4.15 - (z + 78) * 0.0185;
}

function normalizeSeed(seed: string | number): string {
  if (typeof seed === "number") {
    return Number.isFinite(seed) ? String(seed) : DEFAULT_SEED;
  }

  const trimmed = seed.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SEED;
}

function createVillas(seed: string): VillaSpec[] {
  const villas: VillaSpec[] = [];
  const archetypeRandom = createRandomStream(seed, "villa-style-offset");
  let sequence = 0;

  for (let rowIndex = 0; rowIndex < VILLA_ROWS.length; rowIndex += 1) {
    const row = VILLA_ROWS[rowIndex];
    if (!row) {
      continue;
    }

    let previousArchetype: VillaArchetype | undefined;
    for (let columnIndex = 0; columnIndex < VILLA_COLUMNS.length; columnIndex += 1) {
      const column = VILLA_COLUMNS[columnIndex];
      if (!column) {
        continue;
      }

      const splitX = (column.minX + column.maxX) * 0.5;
      for (let lotIndex = 0; lotIndex < 2; lotIndex += 1) {
        if (rowIndex === 4 && columnIndex === 3 && lotIndex === 1) {
          continue;
        }

        const parcel: Bounds2 = {
          minX: lotIndex === 0 ? column.minX : splitX,
          maxX: lotIndex === 0 ? splitX : column.maxX,
          minZ: row.minZ,
          maxZ: row.maxZ,
        };
        const lotSuffix = lotIndex === 0 ? "a" : "b";
        const id = `villa-r${rowIndex + 1}-c${columnIndex + 1}-${lotSuffix}`;
        const random = createRandomStream(seed, id);
        const archetype = pickDifferent(archetypeRandom, ARCHETYPES, previousArchetype);
        previousArchetype = archetype;
        const facade = FACADES[(sequence + Math.floor(random() * FACADES.length)) % FACADES.length] ?? "warm-ivory";
        const roof = ROOFS[(sequence * 3 + Math.floor(random() * ROOFS.length)) % ROOFS.length] ?? "terracotta-red";
        const entrance: VillaSpec["entrance"] = (rowIndex + lotIndex) % 2 === 0 ? "north" : "south";
        const widthBias = archetype === "hipped-veranda" ? 0.45 : archetype === "restrained-art-deco" ? 0.2 : 0;
        const width = quantize(range(random, 9.1, 11.15) + widthBias);
        const depth = quantize(range(random, 6.7, 8.05));
        const requestedXOffset = range(random, -0.9, 0.9);
        const requestedZOffset = range(random, -0.85, 0.85);
        const baseYaw = entrance === "south" ? 0 : Math.PI;
        const yaw = quantize(baseYaw + range(random, -0.075, 0.075));
        const cosine = Math.abs(Math.cos(yaw));
        const sine = Math.abs(Math.sin(yaw));
        const footprintHalfX = (cosine * width + sine * depth) * 0.5;
        const footprintHalfZ = (sine * width + cosine * depth) * 0.5;
        const maximumXOffset = Math.min(
          0.9,
          Math.max(0, (parcel.maxX - parcel.minX) * 0.5 - footprintHalfX - 0.01),
        );
        const maximumZOffset = Math.min(
          0.85,
          Math.max(0, (parcel.maxZ - parcel.minZ) * 0.5 - footprintHalfZ - 0.01),
        );
        const xOffset = Math.min(maximumXOffset, Math.max(-maximumXOffset, requestedXOffset));
        const zOffset = Math.min(maximumZOffset, Math.max(-maximumZOffset, requestedZOffset));
        const x = quantize((parcel.minX + parcel.maxX) * 0.5 + xOffset);
        const z = quantize((parcel.minZ + parcel.maxZ) * 0.5 + zOffset);
        const storeys: 2 | 3 = (sequence + Math.floor(random() * 2)) % 3 === 0 ? 3 : 2;
        const isWestOpeningHero = id === "villa-r1-c2-b";
        const isEastOpeningHero = id === "villa-r1-c3-a";

        villas.push({
          id,
          x,
          z,
          yaw,
          width,
          depth,
          storeys,
          archetype: isWestOpeningHero ? "hipped-veranda" : isEastOpeningHero ? "half-timbered" : archetype,
          facade: isWestOpeningHero ? "muted-brick" : isEastOpeningHero ? "sage-grey" : facade,
          roof: isWestOpeningHero ? "terracotta-red" : isEastOpeningHero ? "muted-green" : roof,
          parcel,
          entrance,
        });
        sequence += 1;
      }
    }
  }

  return villas;
}

function addEnclosureWalls(
  walls: WallSpec[],
  ownerId: string,
  parcel: Bounds2,
  entrance: "north" | "south",
  height: number,
  width: number,
  material: WallSpec["material"],
): void {
  const centerX = (parcel.minX + parcel.maxX) * 0.5;
  const gateHalfWidth = 1.7;
  const frontZ = entrance === "north" ? parcel.minZ : parcel.maxZ;
  const backZ = entrance === "north" ? parcel.maxZ : parcel.minZ;

  walls.push(
    {
      id: `${ownerId}-wall-west`,
      from: { x: parcel.minX, z: parcel.minZ },
      to: { x: parcel.minX, z: parcel.maxZ },
      height,
      width,
      material,
    },
    {
      id: `${ownerId}-wall-east`,
      from: { x: parcel.maxX, z: parcel.minZ },
      to: { x: parcel.maxX, z: parcel.maxZ },
      height,
      width,
      material,
    },
    {
      id: `${ownerId}-wall-back`,
      from: { x: parcel.minX, z: backZ },
      to: { x: parcel.maxX, z: backZ },
      height,
      width,
      material,
    },
    {
      id: `${ownerId}-wall-front-west`,
      from: { x: parcel.minX, z: frontZ },
      to: { x: centerX - gateHalfWidth, z: frontZ },
      height,
      width,
      material,
    },
    {
      id: `${ownerId}-wall-front-east`,
      from: { x: centerX + gateHalfWidth, z: frontZ },
      to: { x: parcel.maxX, z: frontZ },
      height,
      width,
      material,
    },
  );
}

function createWalls(seed: string, villas: readonly VillaSpec[]): WallSpec[] {
  const walls: WallSpec[] = [];
  for (const villa of villas) {
    const random = createRandomStream(seed, `${villa.id}:walls`);
    const isOpeningHero = villa.id === "villa-r1-c2-b" || villa.id === "villa-r1-c3-a";
    addEnclosureWalls(
      walls,
      villa.id,
      villa.parcel,
      villa.entrance,
      isOpeningHero ? 0.62 : quantize(range(random, 0.68, 0.94)),
      isOpeningHero ? 0.28 : quantize(range(random, 0.3, 0.4)),
      "granite",
    );
  }

  addEnclosureWalls(walls, LANDMARKS[0]?.id ?? "huashi-inspired-coastal-villa", HUASHI_PARCEL, "north", 0.96, 0.42, "granite");
  addEnclosureWalls(walls, LANDMARKS[1]?.id ?? "blue-green-garden-villa", BLUE_GREEN_PARCEL, "north", 0.76, 0.34, "brick");
  return walls;
}

function createTreeSpec(
  id: string,
  species: TreeSpecies,
  corridorId: string | undefined,
  x: number,
  z: number,
  random: RandomStream,
  minimumScale: number,
  maximumScale: number,
): VegetationSpec {
  const traits = TREE_TRAITS[species];
  const scale = quantize(range(random, minimumScale, maximumScale));
  return {
    id,
    species,
    ...(corridorId === undefined ? {} : { corridorId }),
    x: quantize(x),
    z: quantize(z),
    yaw: quantize(random() * Math.PI * 2),
    scale,
    height: quantize(traits.height * scale),
    canopyRadius: quantize(traits.canopyRadius * scale),
    foliage: traits.foliage,
  };
}

function isOutsideSpawnKeepout(tree: VegetationSpec): boolean {
  const xDistance = tree.x - SPAWN_X;
  const zDistance = tree.z - SPAWN_Z;
  const minimumDistance = tree.canopyRadius + TREE_SPAWN_CLEARANCE;
  return xDistance * xDistance + zDistance * zDistance >= minimumDistance * minimumDistance;
}

function appendTree(
  vegetation: VegetationSpec[],
  id: string,
  species: TreeSpecies,
  corridorId: string | undefined,
  x: number,
  z: number,
  random: RandomStream,
  minimumScale: number,
  maximumScale: number,
): void {
  const tree = createTreeSpec(id, species, corridorId, x, z, random, minimumScale, maximumScale);
  if (isOutsideSpawnKeepout(tree)) {
    vegetation.push(tree);
  }
}

function distanceToVillaFootprint(x: number, z: number, villa: VillaSpec): number {
  const xDistance = x - villa.x;
  const zDistance = z - villa.z;
  const cosine = Math.cos(villa.yaw);
  const sine = Math.sin(villa.yaw);
  const localX = cosine * xDistance - sine * zDistance;
  const localZ = sine * xDistance + cosine * zDistance;
  const outsideX = Math.max(Math.abs(localX) - villa.width * 0.5, 0);
  const outsideZ = Math.max(Math.abs(localZ) - villa.depth * 0.5, 0);
  return Math.hypot(outsideX, outsideZ);
}

function capTreeToVillaClearance(tree: VegetationSpec, villa: VillaSpec): VegetationSpec | undefined {
  const traits = TREE_TRAITS[tree.species];
  const availableCanopyRadius = distanceToVillaFootprint(tree.x, tree.z, villa) - VILLA_TREE_CLEARANCE;
  const safeMaximumScale = availableCanopyRadius / traits.canopyRadius;
  if (safeMaximumScale < MIN_GARDEN_TREE_SCALE) {
    return undefined;
  }

  let safeScale = Math.min(tree.scale, Math.floor(safeMaximumScale * 100 + 1e-9) / 100);
  while (quantize(traits.canopyRadius * safeScale) > availableCanopyRadius) {
    safeScale = quantize(safeScale - 0.01);
  }
  if (safeScale < MIN_GARDEN_TREE_SCALE) {
    return undefined;
  }
  if (safeScale === tree.scale) {
    return tree;
  }

  return {
    ...tree,
    scale: safeScale,
    height: quantize(traits.height * safeScale),
    canopyRadius: quantize(traits.canopyRadius * safeScale),
  };
}

function overlapsCorridorCrown(candidate: VegetationSpec, vegetation: readonly VegetationSpec[]): boolean {
  for (const existing of vegetation) {
    if (existing.corridorId === undefined) {
      continue;
    }
    const minimumDistance = Math.max(4.8, candidate.canopyRadius + existing.canopyRadius * 0.65);
    const xDistance = candidate.x - existing.x;
    const zDistance = candidate.z - existing.z;
    if (xDistance * xDistance + zDistance * zDistance < minimumDistance * minimumDistance) {
      return true;
    }
  }
  return false;
}

function overlapsGardenCrown(candidate: VegetationSpec, vegetation: readonly VegetationSpec[]): boolean {
  for (const existing of vegetation) {
    if (existing.corridorId !== undefined) {
      continue;
    }
    const minimumDistance = candidate.canopyRadius + existing.canopyRadius;
    const xDistance = candidate.x - existing.x;
    const zDistance = candidate.z - existing.z;
    if (xDistance * xDistance + zDistance * zDistance < minimumDistance * minimumDistance) {
      return true;
    }
  }
  return false;
}


function addCorridorVegetation(vegetation: VegetationSpec[], seed: string): void {
  for (const road of ROAD_BLUEPRINTS) {
    const random = createRandomStream(seed, `corridor:${road.id}`);
    const breaks = road.orientation === "north-south" ? NORTH_SOUTH_BREAKS : EAST_WEST_BREAKS;

    for (let segmentIndex = 0; segmentIndex < breaks.length - 1; segmentIndex += 1) {
      const start = breaks[segmentIndex];
      const end = breaks[segmentIndex + 1];
      if (start === undefined || end === undefined) {
        continue;
      }

      const length = end - start;
      const slots = Math.max(1, Math.min(2, Math.round(length / road.treeSpacing)));
      const segmentEndClearance = Math.min(2.5, length * 0.5);
      const firstAlong = (start + end - (slots - 1) * road.treeSpacing) * 0.5;
      const lastAlong = firstAlong + (slots - 1) * road.treeSpacing;
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const side = sideIndex === 0 ? -1 : 1;
        const desiredStagger = side * road.treeSpacing * 0.18;
        const minimumStagger = start + segmentEndClearance - firstAlong;
        const maximumStagger = end - segmentEndClearance - lastAlong;
        const sideStagger = Math.min(maximumStagger, Math.max(minimumStagger, desiredStagger));
        for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
          const nominalAlong = firstAlong + slotIndex * road.treeSpacing + sideStagger;
          const jitterLimit = Math.min(1, road.treeSpacing * 0.075);
          const minimumJitter = -Math.min(jitterLimit, nominalAlong - (start + segmentEndClearance));
          const maximumJitter = Math.min(jitterLimit, end - segmentEndClearance - nominalAlong);
          const along = nominalAlong + range(random, minimumJitter, maximumJitter);
          const offset = road.width * 0.5 + road.sidewalkWidth + range(random, 0.82, 1.18);
          const anchor = road.points[0];
          if (!anchor) {
            continue;
          }

          const x = road.orientation === "north-south" ? anchor.x + side * offset : along;
          const z = road.orientation === "north-south" ? along : anchor.z + side * offset;
          const candidate = createTreeSpec(
            `tree-${road.id}-${sideIndex}-${segmentIndex}-${slotIndex}`,
            road.treeSpecies,
            road.id,
            x,
            z,
            random,
            0.82,
            1.16,
          );
          if (!isOutsideSpawnKeepout(candidate)) {
            continue;
          }

          let overlapsExistingCrown = false;
          for (const existing of vegetation) {
            const minimumDistance = candidate.canopyRadius + existing.canopyRadius;
            const xDistance = candidate.x - existing.x;
            const zDistance = candidate.z - existing.z;
            if (xDistance * xDistance + zDistance * zDistance < minimumDistance * minimumDistance) {
              overlapsExistingCrown = true;
              break;
            }
          }
          if (!overlapsExistingCrown) {
            vegetation.push(candidate);
          }
        }
      }
    }
  }
}

function addGardenVegetation(vegetation: VegetationSpec[], seed: string, villas: readonly VillaSpec[]): void {
  for (const villa of villas) {
    const random = createRandomStream(seed, `${villa.id}:garden`);
    const cornerOffset = Math.floor(random() * 4);
    let acceptedTrees = 0;
    for (let attemptIndex = 0; attemptIndex < 4 && acceptedTrees < 2; attemptIndex += 1) {
      const corner = (cornerOffset + attemptIndex) % 4;
      const west = corner === 0 || corner === 3;
      const north = corner < 2;
      const xInset = range(random, 0.6, 1);
      const zInset = range(random, 0.6, 1);
      const x = (west ? villa.parcel.minX + xInset : villa.parcel.maxX - xInset) + range(random, -0.28, 0.28);
      const z = (north ? villa.parcel.minZ + zInset : villa.parcel.maxZ - zInset) + range(random, -0.22, 0.22);
      const candidate = createTreeSpec(
        `${villa.id}-garden-tree-${acceptedTrees + 1}`,
        pick(random, GARDEN_SPECIES),
        undefined,
        x,
        z,
        random,
        0.68,
        0.92,
      );
      const safeCandidate = capTreeToVillaClearance(candidate, villa);
      if (
        safeCandidate === undefined ||
        !isOutsideSpawnKeepout(safeCandidate) ||
        overlapsCorridorCrown(safeCandidate, vegetation) ||
        overlapsGardenCrown(safeCandidate, vegetation)
      ) {
        continue;
      }

      vegetation.push(safeCandidate);
      acceptedTrees += 1;
    }
  }
}

function addLandmarkVegetation(vegetation: VegetationSpec[], seed: string): void {
  const huashiRandom = createRandomStream(seed, "huashi-garden");
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2 + range(huashiRandom, -0.12, 0.12);
    const radiusX = range(huashiRandom, 9.2, 12.5);
    const radiusZ = range(huashiRandom, 2.7, 3.25);
    appendTree(
      vegetation,
      `huashi-garden-tree-${index + 1}`,
      pick(huashiRandom, HILL_SPECIES),
      undefined,
      -67 + Math.cos(angle) * radiusX,
      67.15 + Math.sin(angle) * radiusZ,
      huashiRandom,
      0.92,
      1.18,
    );
  }

  const blueRandom = createRandomStream(seed, "blue-green-garden");
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2 + range(blueRandom, -0.16, 0.16);
    appendTree(
      vegetation,
      `blue-green-garden-tree-${index + 1}`,
      pick(blueRandom, GARDEN_SPECIES),
      undefined,
      79 + Math.cos(angle) * range(blueRandom, 6.3, 7.6),
      28.5 + Math.sin(angle) * range(blueRandom, 4.5, 5.1),
      blueRandom,
      0.8,
      1.04,
    );
  }
}

function addLandscapeBands(vegetation: VegetationSpec[], seed: string): void {
  const hillRandom = createRandomStream(seed, "hill-band");
  for (let index = 0; index < 24; index += 1) {
    const x = -88 + ((index + 0.5) / 24) * 176 + range(hillRandom, -1.1, 1.1);
    appendTree(
      vegetation,
      `hill-tree-${index + 1}`,
      pick(hillRandom, HILL_SPECIES),
      undefined,
      x,
      range(hillRandom, -76.4, -71.2),
      hillRandom,
      1.02,
      1.36,
    );
  }

  const coastRandom = createRandomStream(seed, "coast-band");
  for (let index = 0; index < COAST_TREE_X.length; index += 1) {
    const x = COAST_TREE_X[index];
    if (x === undefined) {
      continue;
    }
    appendTree(
      vegetation,
      `coast-tree-${index + 1}`,
      pick(coastRandom, COAST_SPECIES),
      undefined,
      x + range(coastRandom, -0.5, 0.5),
      range(coastRandom, 64.1, 69.2),
      coastRandom,
      0.84,
      1.14,
    );
  }
}

function createVegetation(seed: string, villas: readonly VillaSpec[]): VegetationSpec[] {
  const vegetation: VegetationSpec[] = [];
  addCorridorVegetation(vegetation, seed);
  addGardenVegetation(vegetation, seed, villas);
  addLandmarkVegetation(vegetation, seed);
  addLandscapeBands(vegetation, seed);
  return vegetation;
}

function createFurniture(): FurnitureSpec[] {
  const furniture: FurnitureSpec[] = [];
  for (let roadIndex = 0; roadIndex < ROAD_BLUEPRINTS.length; roadIndex += 1) {
    const road = ROAD_BLUEPRINTS[roadIndex];
    if (!road) {
      continue;
    }

    const anchor = road.points[0];
    if (!anchor) {
      continue;
    }
    const side = roadIndex % 2 === 0 ? 1 : -1;
    const vergeOffset = road.width * 0.5 + road.sidewalkWidth + 0.45;
    const isNingwuguanSign = road.id === "ningwuguan";
    const signX = isNingwuguanSign
      ? -4.65
      : road.orientation === "north-south"
        ? anchor.x + side * vergeOffset
        : side * 43;
    const signZ = isNingwuguanSign
      ? -47.2
      : road.orientation === "north-south"
        ? -63 + roadIndex * 1.4
        : anchor.z + side * vergeOffset;
    furniture.push({
      id: `sign-${road.id}`,
      kind: "street-sign",
      x: quantize(signX),
      z: quantize(signZ),
      yaw: road.orientation === "north-south" ? 0 : Math.PI * 0.5,
      scale: 1,
      labelZh: road.nameZh,
      labelEn: road.nameEn,
    });

    for (let lampIndex = 0; lampIndex < 2; lampIndex += 1) {
      const lampSide = lampIndex === 0 ? -1 : 1;
      furniture.push({
        id: `lamp-${road.id}-${lampIndex + 1}`,
        kind: "lamp",
        x: quantize(
          road.orientation === "north-south"
            ? anchor.x + lampSide * vergeOffset
            : lampIndex === 0
              ? -70
              : 70,
        ),
        z: quantize(
          road.orientation === "north-south"
            ? lampIndex === 0
              ? -32
              : 30
            : anchor.z + lampSide * vergeOffset,
        ),
        yaw: 0,
        scale: 1,
      });
    }
  }

  const benchX = [-38, -22, -7, 9, 25, 41];
  for (let index = 0; index < benchX.length; index += 1) {
    const x = benchX[index];
    if (x === undefined) {
      continue;
    }
    furniture.push({
      id: `coast-bench-${index + 1}`,
      kind: "bench",
      x,
      z: 68.1 + (index % 2) * 0.35,
      yaw: Math.PI * 0.5,
      scale: 1,
    });
  }
  return furniture;
}

function rotatedFootprint(
  id: string,
  kind: ColliderKind,
  x: number,
  z: number,
  width: number,
  depth: number,
  yaw: number,
): Aabb2 {
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  const halfX = (cosine * width + sine * depth) * 0.5;
  const halfZ = (sine * width + cosine * depth) * 0.5;
  return {
    id,
    kind,
    minX: quantize(x - halfX),
    maxX: quantize(x + halfX),
    minZ: quantize(z - halfZ),
    maxZ: quantize(z + halfZ),
  };
}

function createColliders(
  villas: readonly VillaSpec[],
  walls: readonly WallSpec[],
  furniture: readonly FurnitureSpec[],
): Aabb2[] {
  const colliders: Aabb2[] = [];
  for (const villa of villas) {
    colliders.push(rotatedFootprint(villa.id, "building", villa.x, villa.z, villa.width, villa.depth, villa.yaw));
  }
  for (const landmark of LANDMARKS) {
    colliders.push(
      rotatedFootprint(
        landmark.id,
        "landmark",
        landmark.x,
        landmark.z,
        landmark.width,
        landmark.depth,
        landmark.yaw,
      ),
    );
  }
  for (const wall of walls) {
    const halfWidth = wall.width * 0.5;
    colliders.push({
      id: wall.id,
      kind: "wall",
      minX: quantize(Math.min(wall.from.x, wall.to.x) - halfWidth),
      maxX: quantize(Math.max(wall.from.x, wall.to.x) + halfWidth),
      minZ: quantize(Math.min(wall.from.z, wall.to.z) - halfWidth),
      maxZ: quantize(Math.max(wall.from.z, wall.to.z) + halfWidth),
    });
  }
  for (const item of furniture) {
    if (item.kind === "bench") {
      colliders.push(rotatedFootprint(item.id, "furniture", item.x, item.z, 1.85, 0.62, item.yaw));
    }
  }

  colliders.push(
    {
      id: "north-hill-exclusion",
      kind: "terrain",
      minX: WORLD_BOUNDS.minX,
      maxX: WORLD_BOUNDS.maxX,
      minZ: WORLD_BOUNDS.minZ,
      maxZ: -71.4,
    },
    {
      id: "taiping-bay-water-exclusion",
      kind: "terrain",
      minX: WORLD_BOUNDS.minX,
      maxX: WORLD_BOUNDS.maxX,
      minZ: 71.55,
      maxZ: WORLD_BOUNDS.maxZ,
    },
  );
  return colliders;
}

export function createWorldLayout(seed: string | number = DEFAULT_SEED): WorldLayout {
  const normalizedSeed = normalizeSeed(seed);
  const villas = createVillas(normalizedSeed);
  const walls = createWalls(normalizedSeed, villas);
  const furniture = createFurniture();
  const vegetation = createVegetation(normalizedSeed, villas);
  const colliders = createColliders(villas, walls, furniture);
  const spawnZ = SPAWN_Z;

  return deepFreeze({
    seed: normalizedSeed,
    bounds: WORLD_BOUNDS,
    spawn: {
      x: SPAWN_X,
      y: quantize(groundHeightAt(spawnZ) + 1.65),
      z: spawnZ,
      yaw: Math.PI + 0.045,
      pitch: -0.045,
    },
    roads: ROAD_BLUEPRINTS,
    villas,
    landmarks: LANDMARKS,
    vegetation,
    walls,
    furniture,
    sea: SEA_BAND,
    hill: HILL_BAND,
    colliders,
  });
}
