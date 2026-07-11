import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { VillaSpec } from './layout';

export interface HorizontalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PathPoint {
  x: number;
  z: number;
}

export type GroundSampler = (z: number) => number;

export class ResourceTracker {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly renderTargets = new Set<THREE.WebGLRenderTarget>();

  geometry<T extends THREE.BufferGeometry>(resource: T): T {
    this.geometries.add(resource);
    return resource;
  }

  material<T extends THREE.Material>(resource: T): T {
    this.materials.add(resource);
    return resource;
  }

  texture<T extends THREE.Texture>(resource: T): T {
    this.textures.add(resource);
    return resource;
  }

  renderTarget<T extends THREE.WebGLRenderTarget>(resource: T): T {
    this.renderTargets.add(resource);
    return resource;
  }

  object(root: THREE.Object3D): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) this.geometries.add(mesh.geometry);
      if (!mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) this.materials.add(material);
    });
  }

  dispose(): void {
    for (const target of this.renderTargets) target.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.renderTargets.clear();
    this.textures.clear();
    this.materials.clear();
    this.geometries.clear();
  }
}

export function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type ProceduralTextureKind =
  | 'grass'
  | 'asphalt'
  | 'granite'
  | 'stucco'
  | 'terracotta'
  | 'slate'
  | 'sand'
  | 'water';

interface TextureOptions {
  size?: number;
  repeat?: [number, number];
  anisotropy?: number;
}

export function createProceduralTexture(
  tracker: ResourceTracker,
  kind: ProceduralTextureKind,
  seed: number,
  options: TextureOptions = {},
): THREE.CanvasTexture {
  const size = options.size ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create procedural world textures.');

  const random = createSeededRandom(seed ^ hashText(kind));
  const palettes: Record<ProceduralTextureKind, [string, string, string]> = {
    grass: ['#586b48', '#72805a', '#3f553c'],
    asphalt: ['#424848', '#59605e', '#303637'],
    granite: ['#89847a', '#a09a8d', '#696a65'],
    stucco: ['#cfc4ab', '#ddd2bb', '#b8aa90'],
    terracotta: ['#8f4936', '#b45f43', '#71382f'],
    slate: ['#39464a', '#526064', '#293438'],
    sand: ['#b9a786', '#d0bd98', '#9e8e73'],
    water: ['#376b70', '#56858a', '#28575f'],
  };
  const [base, light, dark] = palettes[kind];
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  if (kind === 'water') {
    const gradient = context.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#3b7177');
    gradient.addColorStop(0.55, '#356a70');
    gradient.addColorStop(1, '#2c626a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.lineCap = 'round';
    for (let index = 0; index < 52; index += 1) {
      const x = random() * size;
      const y = random() * size;
      const length = 3 + random() * 17;
      context.strokeStyle = `rgba(205, 225, 218, ${0.035 + random() * 0.1})`;
      context.lineWidth = 0.35 + random() * 1.15;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(Math.min(size, x + length), y + (random() - 0.5) * 1.4);
      context.stroke();
    }
  } else {
    const fleckCount = kind === 'granite' || kind === 'sand' ? 720 : 420;
    for (let index = 0; index < fleckCount; index += 1) {
      const radius = kind === 'granite' ? 0.35 + random() * 2.2 : 0.25 + random() * 1.15;
      context.globalAlpha = 0.035 + random() * 0.22;
      context.fillStyle = random() > 0.48 ? light : dark;
      context.beginPath();
      context.ellipse(
        random() * size,
        random() * size,
        radius,
        radius * (0.45 + random()),
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.globalAlpha = 1;
  }

  if (kind === 'grass') {
    context.lineWidth = 0.55;
    for (let index = 0; index < 240; index += 1) {
      const x = random() * size;
      const y = random() * size;
      context.strokeStyle = random() > 0.5 ? 'rgba(196, 183, 117, .12)' : 'rgba(26, 54, 32, .16)';
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - 0.5) * 2.5, y - 2 - random() * 4);
      context.stroke();
    }
  } else if (kind === 'asphalt') {
    context.lineWidth = 0.45;
    for (let index = 0; index < 70; index += 1) {
      context.strokeStyle = `rgba(206, 211, 205, ${0.02 + random() * 0.035})`;
      const y = random() * size;
      context.beginPath();
      context.moveTo(random() * size * 0.3, y);
      context.lineTo(size * (0.5 + random() * 0.5), y + (random() - 0.5) * 2);
      context.stroke();
    }
  } else if (kind === 'terracotta') {
    context.globalAlpha = 0.3;
    context.lineWidth = 1;
    context.strokeStyle = dark;
    for (let y = 8; y < size; y += 12) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      const offset = (Math.floor(y / 12) % 2) * 8;
      for (let x = offset; x < size; x += 16) {
        context.beginPath();
        context.moveTo(x, y - 12);
        context.lineTo(x, y);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  } else if (kind === 'slate') {
    context.globalAlpha = 0.22;
    context.strokeStyle = light;
    context.lineWidth = 0.7;
    for (let y = 7; y < size; y += 9) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      const offset = (Math.floor(y / 9) % 2) * 6;
      for (let x = offset; x < size; x += 12) {
        context.beginPath();
        context.moveTo(x, y - 9);
        context.lineTo(x, y);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }

  const texture = tracker.texture(new THREE.CanvasTexture(canvas));
  texture.name = `Procedural ${kind}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeat = options.repeat ?? ([4, 4] as const);
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = options.anisotropy ?? 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createTransform(
  x: number,
  y: number,
  z: number,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
  yaw = 0,
  pitch = 0,
  roll = 0,
): THREE.Matrix4 {
  const position = new THREE.Vector3(x, y, z);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
  const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

function combineTransforms(parent: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  return new THREE.Matrix4().multiplyMatrices(parent, local);
}

interface BatchBucket {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
}

export class StaticBatcher {
  private readonly buckets = new Map<string, BatchBucket>();
  readonly unitBox: THREE.BoxGeometry;
  readonly unitCylinder8: THREE.CylinderGeometry;
  readonly unitCylinder12: THREE.CylinderGeometry;

  constructor(private readonly tracker: ResourceTracker) {
    this.unitBox = tracker.geometry(new THREE.BoxGeometry(1, 1, 1));
    this.unitCylinder8 = tracker.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
    this.unitCylinder12 = tracker.geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  }

  add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    transform: THREE.Matrix4,
    castShadow = true,
    receiveShadow = true,
  ): void {
    const key = `${material.uuid}:${castShadow ? 1 : 0}:${receiveShadow ? 1 : 0}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, castShadow, receiveShadow, geometries: [] };
      this.buckets.set(key, bucket);
    }
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.applyMatrix4(transform);
    bucket.geometries.push(copy);
  }

  addBox(
    material: THREE.Material,
    transform: THREE.Matrix4,
    castShadow = true,
    receiveShadow = true,
  ): void {
    this.add(this.unitBox, material, transform, castShadow, receiveShadow);
  }

  build(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    let meshIndex = 0;
    for (const bucket of this.buckets.values()) {
      let geometry: THREE.BufferGeometry;
      if (bucket.geometries.length === 1) {
        geometry = bucket.geometries[0]!;
      } else {
        const merged = mergeGeometries(bucket.geometries, false);
        if (!merged) throw new Error(`Unable to merge static geometry for ${name}.`);
        geometry = merged;
        for (const source of bucket.geometries) source.dispose();
      }
      this.tracker.geometry(geometry);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.name = `${name} ${meshIndex}`;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshIndex += 1;
    }
    this.buckets.clear();
    group.matrixAutoUpdate = false;
    return group;
  }
}

export function createTerrainGeometry(
  tracker: ResourceTracker,
  bounds: HorizontalBounds,
  ground: GroundSampler,
  segmentsX: number,
  segmentsZ: number,
): THREE.BufferGeometry {
  const columns = Math.max(2, Math.floor(segmentsX)) + 1;
  const rows = Math.max(2, Math.floor(segmentsZ)) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  const indices: number[] = [];
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  let vertexOffset = 0;
  let uvOffset = 0;
  for (let row = 0; row < rows; row += 1) {
    const v = row / (rows - 1);
    const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, v);
    for (let column = 0; column < columns; column += 1) {
      const u = column / (columns - 1);
      const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, u);
      positions[vertexOffset] = x;
      positions[vertexOffset + 1] = ground(z);
      positions[vertexOffset + 2] = z;
      uvs[uvOffset] = (x - bounds.minX) / Math.max(1, width);
      uvs[uvOffset + 1] = (z - bounds.minZ) / Math.max(1, depth);
      vertexOffset += 3;
      uvOffset += 2;
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = tracker.geometry(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function samplePath(path: readonly PathPoint[], metersPerSegment: number): PathPoint[] {
  if (path.length < 2) return path.map((point) => ({ ...point }));
  const sampled: PathPoint[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index]!;
    const end = path[index + 1]!;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, metersPerSegment)));
    for (let step = 0; step < steps; step += 1) {
      if (index > 0 && step === 0) continue;
      const alpha = step / steps;
      sampled.push({
        x: THREE.MathUtils.lerp(start.x, end.x, alpha),
        z: THREE.MathUtils.lerp(start.z, end.z, alpha),
      });
    }
  }
  sampled.push({ ...path[path.length - 1]! });
  return sampled;
}

export function offsetPath(path: readonly PathPoint[], offset: number): PathPoint[] {
  if (path.length < 2) return path.map((point) => ({ ...point }));
  return path.map((point, index) => {
    const previous = path[Math.max(0, index - 1)]!;
    const next = path[Math.min(path.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: point.x - (dz / length) * offset,
      z: point.z + (dx / length) * offset,
    };
  });
}

export function createRibbonGeometry(
  tracker: ResourceTracker,
  path: readonly PathPoint[],
  width: number,
  elevation: number,
  ground: GroundSampler,
  metersPerSegment = 2.5,
): THREE.BufferGeometry {
  const points = samplePath(path, metersPerSegment);
  if (points.length < 2) throw new Error('A road or path ribbon needs at least two points.');
  const positions = new Float32Array(points.length * 2 * 3);
  const uvs = new Float32Array(points.length * 2 * 2);
  const indices: number[] = [];
  let distance = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const tangentLength = Math.hypot(dx, dz) || 1;
    const normalX = -dz / tangentLength;
    const normalZ = dx / tangentLength;
    if (index > 0) distance += Math.hypot(point.x - points[index - 1]!.x, point.z - points[index - 1]!.z);
    const y = ground(point.z) + elevation;
    const leftOffset = index * 6;
    positions[leftOffset] = point.x + normalX * width * 0.5;
    positions[leftOffset + 1] = y;
    positions[leftOffset + 2] = point.z + normalZ * width * 0.5;
    positions[leftOffset + 3] = point.x - normalX * width * 0.5;
    positions[leftOffset + 4] = y;
    positions[leftOffset + 5] = point.z - normalZ * width * 0.5;
    const uvIndex = index * 4;
    uvs[uvIndex] = 0;
    uvs[uvIndex + 1] = distance / 8;
    uvs[uvIndex + 2] = 1;
    uvs[uvIndex + 3] = distance / 8;
    if (index < points.length - 1) {
      const a = index * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = tracker.geometry(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createIrregularPatchGeometry(
  tracker: ResourceTracker,
  points: readonly PathPoint[],
  elevation: number,
  ground: GroundSampler,
): THREE.BufferGeometry {
  if (points.length < 3) throw new Error('A terrain patch needs at least three points.');
  let centerX = 0;
  let centerZ = 0;
  for (const point of points) {
    centerX += point.x;
    centerZ += point.z;
  }
  centerX /= points.length;
  centerZ /= points.length;
  const positions: number[] = [centerX, ground(centerZ) + elevation, centerZ];
  const uvs: number[] = [0.5, 0.5];
  let radius = 1;
  for (const point of points) radius = Math.max(radius, Math.hypot(point.x - centerX, point.z - centerZ));
  for (const point of points) {
    positions.push(point.x, ground(point.z) + elevation, point.z);
    uvs.push(0.5 + (point.x - centerX) / (radius * 2), 0.5 + (point.z - centerZ) / (radius * 2));
  }
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    indices.push(0, index + 1, ((index + 1) % points.length) + 1);
  }
  const geometry = tracker.geometry(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTriangleGeometry(
  tracker: ResourceTracker,
  vertices: readonly [number, number, number][],
  faces: readonly [number, number, number][],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const face of faces) {
    for (const vertexIndex of face) {
      const vertex = vertices[vertexIndex]!;
      positions.push(vertex[0], vertex[1], vertex[2]);
      uvs.push(vertex[0] * 0.2 + 0.5, vertex[2] * 0.2 + vertex[1] * 0.08 + 0.5);
    }
  }
  const geometry = tracker.geometry(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createHippedRoofGeometry(
  tracker: ResourceTracker,
  width: number,
  depth: number,
  rise: number,
): THREE.BufferGeometry {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const ridge = Math.max(0.15, halfWidth - halfDepth * 0.72);
  return createTriangleGeometry(
    tracker,
    [
      [-halfWidth, 0, -halfDepth],
      [halfWidth, 0, -halfDepth],
      [halfWidth, 0, halfDepth],
      [-halfWidth, 0, halfDepth],
      [-ridge, rise, 0],
      [ridge, rise, 0],
    ],
    [
      [0, 5, 1],
      [0, 4, 5],
      [3, 2, 5],
      [3, 5, 4],
      [3, 4, 0],
      [1, 5, 2],
    ],
  );
}

export function createGabledRoofGeometry(
  tracker: ResourceTracker,
  width: number,
  depth: number,
  rise: number,
  ridgeAxis: 'x' | 'z' = 'z',
): THREE.BufferGeometry {
  const buildWidth = ridgeAxis === 'z' ? width : depth;
  const buildDepth = ridgeAxis === 'z' ? depth : width;
  const halfWidth = buildWidth * 0.5;
  const halfDepth = buildDepth * 0.5;
  const geometry = createTriangleGeometry(
    tracker,
    [
      [-halfWidth, 0, -halfDepth],
      [halfWidth, 0, -halfDepth],
      [-halfWidth, 0, halfDepth],
      [halfWidth, 0, halfDepth],
      [0, rise, -halfDepth],
      [0, rise, halfDepth],
    ],
    [
      [0, 2, 5],
      [0, 5, 4],
      [1, 4, 5],
      [1, 5, 3],
      [0, 4, 1],
      [2, 3, 5],
    ],
  );
  if (ridgeAxis === 'x') {
    geometry.rotateY(Math.PI * 0.5);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

export interface VillaMaterials {
  granite: THREE.Material;
  wallWarm: THREE.Material;
  wallOchre: THREE.Material;
  wallBrick: THREE.Material;
  wallBlue: THREE.Material;
  roofTile: THREE.Material;
  roofUmber: THREE.Material;
  roofSlate: THREE.Material;
  roofGreen: THREE.Material;
  trim: THREE.Material;
  trimDark: THREE.Material;
  glass: THREE.Material;
  wood: THREE.Material;
}

export interface VillaBuildSpec {
  x: number;
  y: number;
  z: number;
  rotation: number;
  width: number;
  depth: number;
  floors: VillaSpec['storeys'];
  archetype: VillaSpec['archetype'] | 'nordic-blue';
  facade: VillaSpec['facade'];
  roof: VillaSpec['roof'];
}

interface WindowMaterials {
  trim: THREE.Material;
  glass: THREE.Material;
}

function addLocal(
  batcher: StaticBatcher,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  root: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
  yaw = 0,
  castShadow = true,
  receiveShadow = true,
): void {
  const local = createTransform(x, y, z, scaleX, scaleY, scaleZ, yaw);
  batcher.add(geometry, material, combineTransforms(root, local), castShadow, receiveShadow);
}

function addTrimmedPane(
  batcher: StaticBatcher,
  root: THREE.Matrix4,
  materials: WindowMaterials,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  side: 'x' | 'z',
  outward: number,
): void {
  if (side === 'z') {
    addLocal(batcher, batcher.unitBox, materials.trim, root, x, y, z + outward * 0.018, width + 0.18, height + 0.18, 0.055);
    addLocal(batcher, batcher.unitBox, materials.glass, root, x, y, z + outward * 0.052, width, height, 0.035, 0, false);
    addLocal(batcher, batcher.unitBox, materials.trim, root, x, y, z + outward * 0.074, 0.055, height, 0.025, 0, false);
  } else {
    addLocal(batcher, batcher.unitBox, materials.trim, root, x + outward * 0.018, y, z, 0.055, height + 0.18, width + 0.18);
    addLocal(batcher, batcher.unitBox, materials.glass, root, x + outward * 0.052, y, z, 0.035, height, width, 0, false);
    addLocal(batcher, batcher.unitBox, materials.trim, root, x + outward * 0.074, y, z, 0.025, height, 0.055, 0, false);
  }
}

function addBodyWindows(
  batcher: StaticBatcher,
  root: THREE.Matrix4,
  materials: VillaMaterials,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  baseHeight: number,
  floors: number,
  frontColumns: number,
): void {
  const floorHeight = 2.55;
  const paneWidth = Math.min(0.86, width / (frontColumns * 2.1));
  for (let floor = 0; floor < floors; floor += 1) {
    const y = baseHeight + floorHeight * (floor + 0.54);
    for (let column = 0; column < frontColumns; column += 1) {
      const x = centerX + ((column + 0.5) / frontColumns - 0.5) * width * 0.72;
      addTrimmedPane(batcher, root, materials, x, y, centerZ + depth * 0.5 + 0.015, paneWidth, 1.22, 'z', 1);
      if ((column + floor) % 2 === 0) {
        addTrimmedPane(batcher, root, materials, x, y, centerZ - depth * 0.5 - 0.015, paneWidth, 1.16, 'z', -1);
      }
    }
    const sideColumns = Math.max(1, Math.floor(depth / 4.1));
    for (let column = 0; column < sideColumns; column += 1) {
      const z = centerZ + ((column + 0.5) / sideColumns - 0.5) * depth * 0.58;
      addTrimmedPane(batcher, root, materials, centerX + width * 0.5 + 0.015, y, z, 0.72, 1.15, 'x', 1);
      if (floor === 0 || column % 2 === 0) {
        addTrimmedPane(batcher, root, materials, centerX - width * 0.5 - 0.015, y, z, 0.72, 1.15, 'x', -1);
      }
    }
  }
}

export function addVillaToBatch(
  tracker: ResourceTracker,
  batcher: StaticBatcher,
  spec: VillaBuildSpec,
  materials: VillaMaterials,
): void {
  const width = THREE.MathUtils.clamp(spec.width, 7.5, 15.5);
  const depth = THREE.MathUtils.clamp(spec.depth, 6.3, 12.5);
  const floors = THREE.MathUtils.clamp(Math.round(spec.floors), 2, 3);
  const baseHeight = 0.68;
  const floorHeight = 2.55;
  const wallHeight = floors * floorHeight;
  const root = createTransform(spec.x, spec.y, spec.z, 1, 1, 1, spec.rotation);
  const style = spec.archetype.toLowerCase();
  const isNordic = style.includes('nord') || style.includes('blue');
  const isArtDeco = style.includes('art-deco') || style.includes('art deco');
  const isHippedVeranda = style === 'hipped-veranda';
  const isSlate = style.includes('slate') || style.includes('goth') || style.includes('tower') || style.includes('half-timber');
  const isGabled = style.includes('gable') || style.includes('pastoral') || style.includes('terrace');
  const wallMaterial = spec.facade === 'warm-ivory'
    ? materials.wallWarm
    : spec.facade === 'sand-ochre'
      ? materials.wallOchre
      : spec.facade === 'muted-brick'
        ? materials.wallBrick
        : materials.wallBlue;
  const roofMaterial = spec.roof === 'terracotta-red'
    ? materials.roofTile
    : spec.roof === 'weathered-umber'
      ? materials.roofUmber
      : spec.roof === 'charcoal-slate'
        ? materials.roofSlate
        : materials.roofGreen;

  if (isNordic) {
    const mainWidth = width * 0.72;
    const wingWidth = width * 0.38;
    addLocal(batcher, batcher.unitBox, materials.granite, root, -width * 0.08, baseHeight * 0.5, 0, mainWidth + 0.25, baseHeight, depth + 0.25);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, -width * 0.08, baseHeight + wallHeight * 0.5, 0, mainWidth, wallHeight, depth);
    addLocal(batcher, batcher.unitBox, materials.granite, root, width * 0.29, baseHeight * 0.5, depth * 0.12, wingWidth + 0.2, baseHeight, depth * 0.72);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, width * 0.29, baseHeight + wallHeight * 0.5, depth * 0.12, wingWidth, wallHeight, depth * 0.72);
    const mainRoof = createGabledRoofGeometry(tracker, mainWidth + 1.05, depth + 1, 2.75, 'z');
    const wingRoof = createGabledRoofGeometry(tracker, wingWidth + 0.9, depth * 0.72 + 0.8, 2.25, 'x');
    addLocal(batcher, mainRoof, roofMaterial, root, -width * 0.08, baseHeight + wallHeight, 0);
    addLocal(batcher, wingRoof, roofMaterial, root, width * 0.29, baseHeight + wallHeight, depth * 0.12);
    addBodyWindows(batcher, root, materials, -width * 0.08, 0, mainWidth, depth, baseHeight, floors, 3);
    addLocal(batcher, batcher.unitBox, materials.trim, root, -width * 0.12, baseHeight + wallHeight + 1.25, depth * 0.505, 0.14, 1.3, 0.08, 0, false);
  } else if (isArtDeco) {
    const upperWidth = width * 0.82;
    const lowerHeight = floorHeight;
    const upperHeight = wallHeight - lowerHeight;
    addLocal(batcher, batcher.unitBox, materials.granite, root, 0, baseHeight * 0.5, 0, width + 0.28, baseHeight, depth + 0.28);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, 0, baseHeight + lowerHeight * 0.5, 0, width, lowerHeight, depth);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, 0, baseHeight + lowerHeight + upperHeight * 0.5, -depth * 0.06, upperWidth, upperHeight, depth * 0.88);
    const roof = createHippedRoofGeometry(tracker, upperWidth + 0.7, depth * 0.88 + 0.7, 0.92);
    addLocal(batcher, roof, roofMaterial, root, 0, baseHeight + wallHeight, -depth * 0.06);
    addBodyWindows(batcher, root, materials, 0, 0, upperWidth, depth * 0.88, baseHeight, floors, 4);
    addLocal(batcher, batcher.unitBox, materials.trim, root, 0, baseHeight + lowerHeight + 0.08, depth * 0.505, width * 0.88, 0.16, 0.12, 0, false);
    for (const x of [-0.31, -0.1, 0.1, 0.31]) {
      addLocal(batcher, batcher.unitBox, materials.trim, root, x * width, baseHeight + wallHeight * 0.58, depth * 0.506, 0.1, wallHeight * 0.62, 0.11, 0, false);
    }
  } else if (isHippedVeranda) {
    addLocal(batcher, batcher.unitBox, materials.granite, root, 0, baseHeight * 0.5, 0, width + 0.3, baseHeight, depth + 0.3);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, 0, baseHeight + wallHeight * 0.5, 0, width, wallHeight, depth);
    const roof = createHippedRoofGeometry(tracker, width + 1.2, depth + 1.2, 2.3);
    addLocal(batcher, roof, roofMaterial, root, 0, baseHeight + wallHeight, 0);
    addBodyWindows(batcher, root, materials, 0, 0, width, depth, baseHeight, floors, 3);

    const porchWidth = width * 0.68;
    const porchDepth = 1.35;
    const slabHeight = 0.16;
    const columnWidth = 0.14;
    const columnHeight = 2.25;
    const porchZ = depth * 0.5 + porchDepth * 0.5;
    addLocal(batcher, batcher.unitBox, materials.granite, root, 0, baseHeight - slabHeight * 0.5, porchZ, porchWidth, slabHeight, porchDepth);
    for (let column = 0; column < 4; column += 1) {
      const x = porchWidth * (-0.45 + column * 0.3);
      addLocal(
        batcher,
        batcher.unitBox,
        materials.trim,
        root,
        x,
        baseHeight + columnHeight * 0.5,
        depth * 0.5 + porchDepth - columnWidth * 0.5,
        columnWidth,
        columnHeight,
        columnWidth,
      );
    }
    const porchRoof = createHippedRoofGeometry(tracker, porchWidth + 0.36, porchDepth + 0.32, 0.55);
    addLocal(batcher, porchRoof, roofMaterial, root, 0, baseHeight + columnHeight, porchZ);
    addLocal(batcher, batcher.unitBox, materials.wood, root, 0, baseHeight + 1.05, depth * 0.505, 1.08, 2.05, 0.08, 0, false);
  } else if (isSlate) {
    addLocal(batcher, batcher.unitBox, materials.granite, root, 0, baseHeight * 0.5, 0, width + 0.3, baseHeight, depth + 0.3);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, 0, baseHeight + wallHeight * 0.5, 0, width, wallHeight, depth);
    const roof = createHippedRoofGeometry(tracker, width + 1.15, depth + 1.15, 3.1);
    addLocal(batcher, roof, roofMaterial, root, 0, baseHeight + wallHeight, 0);
    const turretRadius = Math.min(1.55, width * 0.135);
    addLocal(
      batcher,
      batcher.unitCylinder12,
      materials.granite,
      root,
      width * 0.38,
      baseHeight + wallHeight * 0.51,
      depth * 0.31,
      turretRadius,
      wallHeight + baseHeight,
      turretRadius,
    );
    const cap = tracker.geometry(new THREE.ConeGeometry(turretRadius * 1.22, 2.4, 12));
    addLocal(batcher, cap, roofMaterial, root, width * 0.38, baseHeight + wallHeight + 1.2, depth * 0.31);
    addBodyWindows(batcher, root, materials, 0, 0, width, depth, baseHeight, floors, 3);
    addLocal(batcher, batcher.unitBox, materials.granite, root, -width * 0.28, baseHeight + wallHeight + 1.25, -depth * 0.18, 0.8, 2.5, 0.72);
    if (style.includes('half-timber')) {
      for (const x of [-0.34, -0.17, 0, 0.17, 0.34]) {
        addLocal(batcher, batcher.unitBox, materials.trimDark, root, x * width, baseHeight + wallHeight * 0.72, depth * 0.506, 0.09, wallHeight * 0.48, 0.1, 0, false);
      }
      for (const y of [baseHeight + wallHeight * 0.53, baseHeight + wallHeight * 0.78]) {
        addLocal(batcher, batcher.unitBox, materials.trimDark, root, 0, y, depth * 0.508, width * 0.82, 0.09, 0.1, 0, false);
      }
    }
  } else if (isGabled) {
    const mainWidth = width * 0.67;
    const wingWidth = width * 0.4;
    addLocal(batcher, batcher.unitBox, materials.granite, root, -width * 0.12, baseHeight * 0.5, 0, mainWidth + 0.28, baseHeight, depth + 0.25);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, -width * 0.12, baseHeight + wallHeight * 0.5, 0, mainWidth, wallHeight, depth);
    addLocal(batcher, batcher.unitBox, materials.granite, root, width * 0.29, baseHeight * 0.5, depth * 0.11, wingWidth + 0.22, baseHeight, depth * 0.74);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, width * 0.29, baseHeight + wallHeight * 0.5, depth * 0.11, wingWidth, wallHeight, depth * 0.74);
    const mainRoof = createGabledRoofGeometry(tracker, mainWidth + 1.1, depth + 1.05, 2.65, 'z');
    const wingRoof = createGabledRoofGeometry(tracker, wingWidth + 0.95, depth * 0.74 + 0.85, 2.35, 'x');
    addLocal(batcher, mainRoof, roofMaterial, root, -width * 0.12, baseHeight + wallHeight, 0);
    addLocal(batcher, wingRoof, roofMaterial, root, width * 0.29, baseHeight + wallHeight, depth * 0.11);
    addBodyWindows(batcher, root, materials, -width * 0.12, 0, mainWidth, depth, baseHeight, floors, 2);
    addLocal(batcher, batcher.unitBox, materials.wood, root, -width * 0.12, baseHeight + 1.15, depth * 0.505, 1.15, 2.1, 0.09, 0, false);
  } else {
    addLocal(batcher, batcher.unitBox, materials.granite, root, 0, baseHeight * 0.5, 0, width + 0.3, baseHeight, depth + 0.3);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, 0, baseHeight + wallHeight * 0.5, 0, width, wallHeight, depth);
    const roof = createHippedRoofGeometry(tracker, width + 1.2, depth + 1.2, 2.45);
    addLocal(batcher, roof, roofMaterial, root, 0, baseHeight + wallHeight, 0);
    addBodyWindows(batcher, root, materials, 0, 0, width, depth, baseHeight, floors, 3);
    const bayWidth = Math.min(3.6, width * 0.32);
    addLocal(batcher, batcher.unitBox, materials.granite, root, width * 0.18, baseHeight * 0.5, depth * 0.55, bayWidth + 0.2, baseHeight, 1.05);
    addLocal(batcher, batcher.unitBox, wallMaterial, root, width * 0.18, baseHeight + floorHeight * 0.53, depth * 0.55, bayWidth, floorHeight, 0.95);
    const bayWindowY = baseHeight + floorHeight * 0.54;
    const bayFrontZ = depth * 0.55 + 0.49;
    for (const offset of [-0.24, 0.24]) {
      addTrimmedPane(
        batcher,
        root,
        materials,
        width * 0.18 + offset * bayWidth,
        bayWindowY,
        bayFrontZ,
        Math.min(0.72, bayWidth * 0.28),
        1.18,
        'z',
        1,
      );
    }
    const bayBackZ = depth * 0.55 - 0.49;
    for (const offset of [-0.24, 0.24]) {
      addTrimmedPane(
        batcher,
        root,
        materials,
        width * 0.18 + offset * bayWidth,
        bayWindowY,
        bayBackZ,
        Math.min(0.72, bayWidth * 0.28),
        1.18,
        'z',
        -1,
      );
    }
    addTrimmedPane(
      batcher,
      root,
      materials,
      width * 0.18 + bayWidth * 0.505,
      bayWindowY,
      depth * 0.55,
      0.66,
      1.12,
      'x',
      1,
    );
    addTrimmedPane(
      batcher,
      root,
      materials,
      width * 0.18 - bayWidth * 0.505,
      bayWindowY,
      depth * 0.55,
      0.66,
      1.12,
      'x',
      -1,
    );
    const bayRoof = createHippedRoofGeometry(tracker, bayWidth + 0.55, 1.55, 0.72);
    addLocal(batcher, bayRoof, roofMaterial, root, width * 0.18, baseHeight + floorHeight, depth * 0.55);
    addLocal(batcher, batcher.unitBox, materials.wood, root, -width * 0.2, baseHeight + 1.12, depth * 0.505, 1.08, 2.05, 0.08, 0, false);
    addLocal(batcher, batcher.unitBox, materials.granite, root, -width * 0.26, baseHeight + wallHeight + 1.05, -depth * 0.12, 0.76, 2.1, 0.68);
  }
}

export interface LandmarkMaterials {
  granite: THREE.Material;
  graniteDark: THREE.Material;
  roofTile: THREE.Material;
  roofGreen: THREE.Material;
  glass: THREE.Material;
  trim: THREE.Material;
  wood: THREE.Material;
}

export interface LandmarkBuildSpec {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale?: number;
}

export function addCoastalLandmarkToBatch(
  tracker: ResourceTracker,
  batcher: StaticBatcher,
  spec: LandmarkBuildSpec,
  materials: LandmarkMaterials,
): void {
  const scale = THREE.MathUtils.clamp(spec.scale ?? 1, 0.82, 1.08);
  const root = createTransform(spec.x, spec.y, spec.z, scale, scale, scale, spec.rotation);
  addLocal(batcher, batcher.unitBox, materials.granite, root, -1.2, 3.35, 0, 9.8, 6.7, 7.1);
  addLocal(batcher, batcher.unitBox, materials.graniteDark, root, -5.1, 2.55, 0.6, 3.5, 5.1, 5.3);
  addLocal(batcher, batcher.unitBox, materials.granite, root, 1.9, 2.65, -3.1, 5.4, 5.3, 2.6);
  const mainRoof = createHippedRoofGeometry(tracker, 10.8, 8.1, 2.15);
  addLocal(batcher, mainRoof, materials.roofTile, root, -1.2, 6.7, 0);
  const wingRoof = createGabledRoofGeometry(tracker, 6.1, 3.25, 1.5, 'x');
  addLocal(batcher, wingRoof, materials.roofTile, root, 1.9, 5.3, -3.1);

  const towerRadius = 2.25;
  addLocal(batcher, batcher.unitCylinder12, materials.graniteDark, root, 4.05, 6.15, 1.35, towerRadius, 12.3, towerRadius);
  addLocal(batcher, batcher.unitCylinder12, materials.granite, root, 4.05, 12.45, 1.35, towerRadius * 1.1, 0.62, towerRadius * 1.1);
  for (let index = 0; index < 12; index += 1) {
    if (index % 2 !== 0) continue;
    const angle = (index / 12) * Math.PI * 2;
    addLocal(
      batcher,
      batcher.unitBox,
      materials.graniteDark,
      root,
      4.05 + Math.sin(angle) * 2.1,
      13.15,
      1.35 + Math.cos(angle) * 2.1,
      0.7,
      1.05,
      0.72,
      angle,
    );
  }

  const turretRadius = 1.05;
  addLocal(batcher, batcher.unitCylinder8, materials.granite, root, -5.25, 6.05, -1.45, turretRadius, 7.1, turretRadius);
  const spire = tracker.geometry(new THREE.ConeGeometry(turretRadius * 1.3, 5.2, 12));
  addLocal(batcher, spire, materials.roofGreen, root, -5.25, 12.2, -1.45);

  const windowLevels = [2.5, 5.1, 8.1, 10.65];
  for (let level = 0; level < windowLevels.length; level += 1) {
    const y = windowLevels[level]!;
    addTrimmedPane(
      batcher,
      root,
      materials,
      4.05,
      y,
      1.35 + towerRadius + 0.03,
      0.72,
      1.28,
      'z',
      1,
    );
  }
  for (const x of [-3.8, -1.15, 1.5]) {
    addTrimmedPane(
      batcher,
      root,
      materials,
      x,
      3.15,
      3.575,
      0.72,
      1.45,
      'z',
      1,
    );
  }
  addLocal(batcher, batcher.unitBox, materials.wood, root, -0.2, 1.55, 3.6, 1.25, 2.65, 0.12, 0, false);
}

export interface GardenMaterials {
  granite: THREE.Material;
  graniteTop: THREE.Material;
  metal: THREE.Material;
  wood: THREE.Material;
}

export function addGardenWallSegment(
  batcher: StaticBatcher,
  start: PathPoint,
  end: PathPoint,
  ground: GroundSampler,
  materials: GardenMaterials,
  height = 1.12,
  thickness = 0.34,
): void {
  const centerX = (start.x + end.x) * 0.5;
  const centerZ = (start.z + end.z) * 0.5;
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  if (length < 0.12) return;
  const yaw = Math.atan2(end.x - start.x, end.z - start.z);
  const startY = ground(start.z);
  const endY = ground(end.z);
  const y = (startY + endY) * 0.5;
  const pitch = -Math.atan2(endY - startY, length);
  batcher.addBox(materials.granite, createTransform(centerX, y + height * 0.5, centerZ, thickness, height, length, yaw, pitch));
  batcher.addBox(materials.graniteTop, createTransform(centerX, y + height + 0.09, centerZ, thickness + 0.09, 0.18, length + 0.08, yaw, pitch));
}

export function addGardenGate(
  batcher: StaticBatcher,
  center: PathPoint,
  rotation: number,
  ground: GroundSampler,
  materials: GardenMaterials,
  width = 2.8,
): void {
  const root = createTransform(center.x, ground(center.z), center.z, 1, 1, 1, rotation);
  const postWidth = 0.38;
  const postHeight = 1.32;
  const capWidth = 0.48;
  const capHeight = 0.14;
  const postOffset = width * 0.5 + 0.18;
  for (const side of [-1, 1]) {
    addLocal(batcher, batcher.unitBox, materials.granite, root, side * postOffset, postHeight * 0.5, 0, postWidth, postHeight, postWidth);
    addLocal(batcher, batcher.unitBox, materials.graniteTop, root, side * postOffset, postHeight + capHeight * 0.5 - 0.02, 0, capWidth, capHeight, capWidth);
  }
  for (const side of [-1, 1]) {
    const leafRoot = combineTransforms(root, createTransform(side * width * 0.5, 0, 0, 1, 1, 1, side * 0.7));
    const leafWidth = width * 0.48;
    addLocal(batcher, batcher.unitBox, materials.metal, leafRoot, -side * leafWidth * 0.5, 0.55, 0, leafWidth, 0.07, 0.07, 0, false);
    addLocal(batcher, batcher.unitBox, materials.metal, leafRoot, -side * leafWidth * 0.5, 1.18, 0, leafWidth, 0.07, 0.07, 0, false);
    for (let bar = 0; bar < 5; bar += 1) {
      addLocal(
        batcher,
        batcher.unitBox,
        materials.metal,
        leafRoot,
        -side * (0.12 + (bar / 5) * leafWidth),
        0.87,
        0,
        0.055,
        1.34,
        0.055,
        0,
        false,
      );
    }
  }
}

export function addBench(
  batcher: StaticBatcher,
  position: PathPoint,
  rotation: number,
  ground: GroundSampler,
  materials: GardenMaterials,
): void {
  const root = createTransform(position.x, ground(position.z), position.z, 1, 1, 1, rotation);
  addLocal(batcher, batcher.unitBox, materials.wood, root, 0, 0.58, 0, 1.65, 0.13, 0.48, 0, false);
  addLocal(batcher, batcher.unitBox, materials.wood, root, 0, 1.02, -0.23, 1.65, 0.62, 0.1, 0, false);
  for (const x of [-0.62, 0.62]) {
    addLocal(batcher, batcher.unitBox, materials.metal, root, x, 0.3, 0, 0.07, 0.58, 0.38, 0, false);
  }
}

export interface VegetationMaterials {
  trunk: THREE.Material;
  plane: THREE.Material;
  ginkgo: THREE.Material;
  maple: THREE.Material;
  cedar: THREE.Material;
  shrub: THREE.Material;
}

export interface TreeBuildSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  height?: number;
  canopyRadius?: number;
  rotation: number;
  species: string;
  animate?: boolean;
  phase?: number;
}

export interface SwayingCrown {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  amplitude: number;
}

export interface VegetationBuildResult {
  group: THREE.Group;
  crowns: SwayingCrown[];
}

type TreeKind = 'plane' | 'ginkgo' | 'maple' | 'cedar' | 'shrub';

function treeKind(species: string): TreeKind {
  const value = species.toLowerCase();
  if (value.includes('ginkgo') || value.includes('maidenhair') || value.includes('gold')) return 'ginkgo';
  if (value.includes('maple') || value.includes('acer') || value.includes('sweetgum')) return 'maple';
  if (value.includes('cedar') || value.includes('pine') || value.includes('juniper') || value.includes('cypress')) return 'cedar';
  if (value.includes('shrub') || value.includes('understory') || value.includes('waxberry')) return 'shrub';
  return 'plane';
}

function crownAnisotropy(yaw: number): number {
  return 0.93 + Math.sin(yaw * 2) * 0.05;
}

function createClusteredCrownGeometry(
  tracker: ResourceTracker,
  kind: 'plane' | 'ginkgo' | 'maple',
): THREE.BufferGeometry {
  const lobes: THREE.BufferGeometry[] = [];
  const addLobe = (
    x: number,
    y: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    yaw = 0,
    pitch = 0,
    roll = 0,
  ): void => {
    const lobe = kind === 'maple'
      ? new THREE.OctahedronGeometry(1, 0)
      : new THREE.IcosahedronGeometry(1, 0);
    lobe.applyMatrix4(createTransform(x, y, z, scaleX, scaleY, scaleZ, yaw, pitch, roll));
    lobes.push(lobe);
  };

  if (kind === 'plane') {
    addLobe(-0.34, -0.05, 0.08, 0.78, 0.8, 0.72, -0.32, 0.04, -0.08);
    addLobe(0.35, 0.02, 0.04, 0.76, 0.78, 0.7, 0.38, -0.03, 0.06);
    addLobe(-0.02, 0.26, -0.22, 0.7, 0.76, 0.74, 0.1, 0.05, -0.02);
  } else if (kind === 'ginkgo') {
    addLobe(-0.28, -0.14, 0.04, 0.62, 0.82, 0.58, -0.25, 0.02, 0.03);
    addLobe(0.29, -0.06, 0.03, 0.6, 0.86, 0.58, 0.31, -0.02, -0.02);
    addLobe(0.02, 0.39, -0.1, 0.56, 0.84, 0.54, 0.05, 0.03);
  } else {
    addLobe(-0.32, -0.08, 0.12, 0.72, 0.8, 0.64, -0.42, 0.08, -0.14);
    addLobe(0.31, 0.05, -0.02, 0.66, 0.74, 0.69, 0.46, -0.1, 0.1);
    addLobe(-0.04, 0.3, -0.2, 0.58, 0.7, 0.61, 0.08, 0.16, -0.08);
  }

  const merged = mergeGeometries(lobes, false);
  for (const lobe of lobes) lobe.dispose();
  if (!merged) throw new Error(`Unable to build ${kind} crown geometry.`);

  merged.computeBoundingBox();
  const center = merged.boundingBox!.getCenter(new THREE.Vector3());
  merged.translate(-center.x, -center.y, -center.z);
  const positions = merged.getAttribute('position');
  let maxHorizontalRadiusSq = 0;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    maxHorizontalRadiusSq = Math.max(maxHorizontalRadiusSq, x * x + z * z);
  }
  const inverseRadius = 1 / Math.sqrt(maxHorizontalRadiusSq);
  merged.scale(inverseRadius, inverseRadius, inverseRadius);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return tracker.geometry(merged);
}

function createConiferGeometry(tracker: ResourceTracker): THREE.BufferGeometry {
  const lower = new THREE.ConeGeometry(1, 1.7, 7, 1);
  lower.translate(0, -0.45, 0);
  const middle = new THREE.ConeGeometry(0.78, 1.55, 7, 1);
  middle.translate(0, 0.35, 0);
  const upper = new THREE.ConeGeometry(0.56, 1.3, 7, 1);
  upper.translate(0, 1.02, 0);
  const merged = mergeGeometries([lower, middle, upper], false);
  lower.dispose();
  middle.dispose();
  upper.dispose();
  if (!merged) throw new Error('Unable to build conifer geometry.');

  merged.computeBoundingBox();
  const sourceBounds = merged.boundingBox!;
  const sourceHeight = sourceBounds.max.y - sourceBounds.min.y;
  const centerY = (sourceBounds.min.y + sourceBounds.max.y) * 0.5;
  merged.translate(0, -centerY, 0);
  merged.scale(1, 2 / sourceHeight, 1);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return tracker.geometry(merged);
}

export function buildVegetation(
  tracker: ResourceTracker,
  specs: readonly TreeBuildSpec[],
  materials: VegetationMaterials,
  animatedLimit: number,
): VegetationBuildResult {
  const group = new THREE.Group();
  group.name = 'Vegetation canopy';
  const trunkGeometry = tracker.geometry(new THREE.CylinderGeometry(0.48, 0.68, 1, 7));
  const planeGeometry = createClusteredCrownGeometry(tracker, 'plane');
  const ginkgoGeometry = createClusteredCrownGeometry(tracker, 'ginkgo');
  const mapleGeometry = createClusteredCrownGeometry(tracker, 'maple');
  const cedarGeometry = createConiferGeometry(tracker);
  const shrubGeometry = tracker.geometry(new THREE.IcosahedronGeometry(1, 0));
  const geometryByKind: Record<TreeKind, THREE.BufferGeometry> = {
    plane: planeGeometry,
    ginkgo: ginkgoGeometry,
    maple: mapleGeometry,
    cedar: cedarGeometry,
    shrub: shrubGeometry,
  };
  const materialByKind: Record<TreeKind, THREE.Material> = {
    plane: materials.plane,
    ginkgo: materials.ginkgo,
    maple: materials.maple,
    cedar: materials.cedar,
    shrub: materials.shrub,
  };
  const staticByKind: Record<TreeKind, TreeBuildSpec[]> = {
    plane: [],
    ginkgo: [],
    maple: [],
    cedar: [],
    shrub: [],
  };
  const animated: Array<{ spec: TreeBuildSpec; kind: TreeKind }> = [];
  let animatedCount = 0;
  for (const spec of specs) {
    const kind = treeKind(spec.species);
    if (spec.animate && kind !== 'shrub' && animatedCount < animatedLimit) {
      animated.push({ spec, kind });
      animatedCount += 1;
    } else {
      staticByKind[kind].push(spec);
    }
  }

  const trunkSpecs = specs.filter((spec) => treeKind(spec.species) !== 'shrub');
  if (trunkSpecs.length > 0) {
    const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, trunkSpecs.length);
    trunks.name = 'Tree trunks';
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    trunks.matrixAutoUpdate = false;
    for (let index = 0; index < trunkSpecs.length; index += 1) {
      const spec = trunkSpecs[index]!;
      const kind = treeKind(spec.species);
      const totalHeight = spec.height ?? (kind === 'cedar' ? 11.5 : kind === 'ginkgo' ? 13 : 14.2) * spec.scale;
      const height = totalHeight * (kind === 'cedar' ? 0.72 : 0.62);
      const radius = (kind === 'cedar' ? 0.42 : 0.5) * spec.scale;
      trunks.setMatrixAt(index, createTransform(spec.x, spec.y + height * 0.5, spec.z, radius, height, radius, spec.rotation));
    }
    trunks.instanceMatrix.needsUpdate = true;
    trunks.computeBoundingBox();
    trunks.computeBoundingSphere();
    group.add(trunks);
  }

  for (const kind of Object.keys(staticByKind) as TreeKind[]) {
    const entries = staticByKind[kind];
    if (entries.length === 0) continue;
    const crowns = new THREE.InstancedMesh(geometryByKind[kind], materialByKind[kind], entries.length);
    crowns.name = `${kind} crowns`;
    crowns.castShadow = kind !== 'shrub';
    crowns.receiveShadow = true;
    crowns.matrixAutoUpdate = false;
    for (let index = 0; index < entries.length; index += 1) {
      const spec = entries[index]!;
      if (kind === 'shrub') {
        const radius = spec.canopyRadius ?? 1.25 * spec.scale;
        const height = spec.height ?? 1.5 * spec.scale;
        crowns.setMatrixAt(index, createTransform(spec.x, spec.y + height * 0.5, spec.z, radius, height * 0.5, radius * 0.84, spec.rotation));
      } else {
        const totalHeight = spec.height ?? (kind === 'cedar' ? 11.5 : kind === 'ginkgo' ? 13 : 14.2) * spec.scale;
        const crownY = spec.y + totalHeight * (kind === 'cedar' ? 0.66 : 0.72);
        const width = spec.canopyRadius ?? (kind === 'cedar' ? 2.5 : kind === 'ginkgo' ? 3.35 : 3.8) * spec.scale;
        const height = totalHeight * (kind === 'cedar' ? 0.34 : kind === 'ginkgo' ? 0.24 : 0.255);
        crowns.setMatrixAt(index, createTransform(spec.x, crownY, spec.z, width, height, width * crownAnisotropy(spec.rotation), spec.rotation));
      }
    }
    crowns.instanceMatrix.needsUpdate = true;
    crowns.computeBoundingBox();
    crowns.computeBoundingSphere();
    group.add(crowns);
  }

  const swayingCrowns: SwayingCrown[] = [];
  for (let index = 0; index < animated.length; index += 1) {
    const { spec, kind } = animated[index]!;
    const totalHeight = spec.height ?? (kind === 'cedar' ? 11.5 : kind === 'ginkgo' ? 13 : 14.2) * spec.scale;
    const crownY = spec.y + totalHeight * (kind === 'cedar' ? 0.66 : 0.72);
    const width = spec.canopyRadius ?? (kind === 'cedar' ? 2.5 : kind === 'ginkgo' ? 3.35 : 3.8) * spec.scale;
    const height = totalHeight * (kind === 'cedar' ? 0.34 : kind === 'ginkgo' ? 0.24 : 0.255);
    const crown = new THREE.Mesh(geometryByKind[kind], materialByKind[kind]);
    crown.name = `Nearby ${kind} crown`;
    crown.position.set(spec.x, crownY, spec.z);
    crown.rotation.y = spec.rotation;
    crown.scale.set(width, height, width * crownAnisotropy(spec.rotation));
    crown.castShadow = false;
    crown.receiveShadow = true;
    group.add(crown);
    swayingCrowns.push({
      mesh: crown,
      baseX: spec.x,
      baseY: crownY,
      baseZ: spec.z,
      phase: spec.phase ?? index * 1.817,
      amplitude: 0.008 + (index % 4) * 0.0015,
    });
  }
  group.matrixAutoUpdate = false;
  return { group, crowns: swayingCrowns };
}

export function updateCrownSway(
  crowns: readonly SwayingCrown[],
  elapsed: number,
  viewerPosition: THREE.Vector3,
  reducedMotion: boolean,
): void {
  for (const crown of crowns) {
    const dx = crown.baseX - viewerPosition.x;
    const dz = crown.baseZ - viewerPosition.z;
    const nearby = dx * dx + dz * dz < 42 * 42;
    const strength = reducedMotion || !nearby ? 0 : 1;
    crown.mesh.rotation.z = Math.sin(elapsed * 0.48 + crown.phase) * crown.amplitude * strength;
    crown.mesh.rotation.x = Math.cos(elapsed * 0.37 + crown.phase * 1.3) * crown.amplitude * 0.55 * strength;
    crown.mesh.position.y = crown.baseY + Math.sin(elapsed * 0.3 + crown.phase) * 0.018 * strength;
  }
}

export interface LeafLitterSpec {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  color: THREE.ColorRepresentation;
}

export function buildLeafLitter(
  tracker: ResourceTracker,
  specs: readonly LeafLitterSpec[],
  material: THREE.MeshStandardMaterial,
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null;
  const geometry = tracker.geometry(new THREE.CircleGeometry(0.13, 5));
  const leaves = new THREE.InstancedMesh(geometry, material, specs.length);
  leaves.name = 'Restrained leaf litter';
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  leaves.matrixAutoUpdate = false;
  const color = new THREE.Color();
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!;
    leaves.setMatrixAt(index, createTransform(spec.x, spec.y, spec.z, spec.scale, spec.scale * 0.55, spec.scale, spec.rotation, -Math.PI * 0.5));
    leaves.setColorAt(index, color.set(spec.color));
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.computeBoundingBox();
  leaves.computeBoundingSphere();
  return leaves;
}

export interface RockBuildSpec {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotation: number;
}

export function buildRocks(
  tracker: ResourceTracker,
  specs: readonly RockBuildSpec[],
  material: THREE.Material,
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null;
  const geometry = tracker.geometry(new THREE.DodecahedronGeometry(1, 0));
  const rocks = new THREE.InstancedMesh(geometry, material, specs.length);
  rocks.name = 'Cove rocks';
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.matrixAutoUpdate = false;
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!;
    rocks.setMatrixAt(index, createTransform(spec.x, spec.y, spec.z, spec.scaleX, spec.scaleY, spec.scaleZ, spec.rotation));
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingBox();
  rocks.computeBoundingSphere();
  return rocks;
}
