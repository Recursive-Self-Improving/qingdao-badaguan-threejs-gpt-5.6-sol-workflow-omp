import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

import { ATMOSPHERE, PALETTE, type QualityProfile } from '../config';
import {
  addBench,
  addCoastalLandmarkToBatch,
  addGardenGate,
  addGardenWallSegment,
  addVillaToBatch,
  buildLeafLitter,
  buildRocks,
  buildVegetation,
  createIrregularPatchGeometry,
  createProceduralTexture,
  createRibbonGeometry,
  createSeededRandom,
  createTerrainGeometry,
  createTransform,
  offsetPath,
  ResourceTracker,
  StaticBatcher,
  updateCrownSway,
  type GardenMaterials,
  type LandmarkMaterials,
  type LeafLitterSpec,
  type RockBuildSpec,
  type TreeBuildSpec,
  type VegetationMaterials,
  type VillaMaterials,
} from './geometry';
import { groundHeightAt, type Bounds2, type WorldLayout } from './layout';

export interface World {
  readonly scene: THREE.Scene;
  readonly bounds: Bounds2;
  update(dt: number, elapsed: number, viewerPosition: THREE.Vector3, reducedMotion: boolean): void;
  invalidateShadow(): void;
  dispose(): void;
}

function seedFromText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createWorld(
  renderer: THREE.WebGLRenderer,
  layout: WorldLayout,
  quality: QualityProfile,
): World {
  const resources = new ResourceTracker();
  const scene = new THREE.Scene();
  scene.name = 'Badaguan, Qingdao';
  scene.background = new THREE.Color(ATMOSPHERE.fogColor);
  scene.fog = new THREE.Fog(ATMOSPHERE.fogColor, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const seed = seedFromText(String(layout.seed));
  const random = createSeededRandom(seed);
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const sky = new Sky();
  sky.name = 'October sky';
  sky.scale.setScalar(10_000);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.material.depthWrite = false;
  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity']!.value = 3.7;
  skyUniforms['rayleigh']!.value = 1.45;
  skyUniforms['mieCoefficient']!.value = 0.0065;
  skyUniforms['mieDirectionalG']!.value = 0.79;

  const azimuth = THREE.MathUtils.degToRad(ATMOSPHERE.sunAzimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(ATMOSPHERE.sunElevationDegrees);
  const sunDirection = new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ).normalize();
  skyUniforms['sunPosition']!.value.copy(sunDirection);
  scene.add(sky);
  resources.object(sky);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const environmentTarget = resources.renderTarget(pmremGenerator.fromScene(scene, 0.035, 0.1, 12_000, { size: 64 }));
  pmremGenerator.dispose();
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.68;

  const hemisphere = new THREE.HemisphereLight(PALETTE.skyZenith, PALETTE.grass, ATMOSPHERE.skyIntensity);
  hemisphere.name = 'Cool marine sky fill';
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(ATMOSPHERE.sunColor, ATMOSPHERE.sunIntensity);
  sun.name = 'Low west-southwest sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  const shadowSpan = Math.min(70, Math.max(46, quality.shadowDistance * 0.65));
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 1.5;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);

  const grassTexture = createProceduralTexture(resources, 'grass', seed + 1, {
    size: 128,
    repeat: [42, 38],
    anisotropy: maxAnisotropy,
  });
  const asphaltTexture = createProceduralTexture(resources, 'asphalt', seed + 2, {
    size: 128,
    repeat: [2, 2],
    anisotropy: maxAnisotropy,
  });
  const graniteTexture = createProceduralTexture(resources, 'granite', seed + 3, {
    size: 128,
    repeat: [5, 5],
    anisotropy: maxAnisotropy,
  });
  const stuccoTexture = createProceduralTexture(resources, 'stucco', seed + 4, {
    size: 128,
    repeat: [3, 3],
    anisotropy: maxAnisotropy,
  });
  const terracottaTexture = createProceduralTexture(resources, 'terracotta', seed + 5, {
    size: 128,
    repeat: [5, 5],
    anisotropy: maxAnisotropy,
  });
  const slateTexture = createProceduralTexture(resources, 'slate', seed + 6, {
    size: 128,
    repeat: [5, 5],
    anisotropy: maxAnisotropy,
  });
  const sandTexture = createProceduralTexture(resources, 'sand', seed + 7, {
    size: 128,
    repeat: [7, 7],
    anisotropy: maxAnisotropy,
  });
  const waterTexture = createProceduralTexture(resources, 'water', seed + 8, {
    size: 128,
    repeat: [16, 42],
    anisotropy: maxAnisotropy,
  });
  const shimmerTexture = createProceduralTexture(resources, 'water', seed + 9, {
    size: 128,
    repeat: [23, 57],
    anisotropy: maxAnisotropy,
  });

  const groundMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Mossy garden ground',
    map: grassTexture,
    color: 0xd8dfd0,
    roughness: 0.98,
    metalness: 0,
  }));
  const asphaltMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Weathered asphalt',
    map: asphaltTexture,
    color: 0xd0d2cf,
    roughness: 0.97,
    metalness: 0,
  }));
  const sidewalkMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Granite aggregate walks',
    map: graniteTexture,
    color: 0xc9c6ba,
    roughness: 0.96,
    metalness: 0,
  }));
  const graniteMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Warm local granite',
    map: graniteTexture,
    color: 0xc6c2b8,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  }));
  const graniteDarkMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Shadowed rough granite',
    map: graniteTexture,
    color: 0x92958f,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  }));
  const gardenGraniteMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Weathered garden-wall granite',
    map: graniteTexture,
    color: 0x8f928b,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  }));
  const gardenGraniteTopMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Shadowed garden-wall cap',
    map: graniteTexture,
    color: 0x6f746f,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  }));
  const wallWarmMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Warm plaster',
    map: stuccoTexture,
    color: 0xf0dfc4,
    roughness: 0.91,
  }));
  const wallBrickMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Muted brick masonry',
    map: stuccoTexture,
    color: PALETTE.brick,
    roughness: 0.86,
  }));
  const wallOchreMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Muted ochre plaster',
    map: stuccoTexture,
    color: 0xd8b784,
    roughness: 0.92,
  }));
  const wallBlueMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Blue-green Nordic render',
    map: stuccoTexture,
    color: 0x8eb7b7,
    roughness: 0.9,
  }));
  const roofTileMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Aged terracotta tile',
    map: terracottaTexture,
    color: 0xd8a18a,
    roughness: 0.94,
  }));
  const roofUmberMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Weathered umber tile',
    map: terracottaTexture,
    color: 0x695044,
    roughness: 0.74,
  }));
  const roofSlateMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Blue-gray slate',
    map: slateTexture,
    color: 0x8b9a9c,
    roughness: 0.9,
  }));
  const roofGreenMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Weathered green metal',
    color: 0x486d63,
    roughness: 0.78,
    metalness: 0.32,
  }));
  const trimMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Pale mineral trim',
    color: 0xded9c9,
    roughness: 0.88,
  }));
  const trimDarkMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Dark timber trim',
    color: 0x55463b,
    roughness: 0.9,
  }));
  const glassMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Muted window glass',
    color: 0x526c72,
    emissive: 0x101719,
    emissiveIntensity: 0.2,
    roughness: 0.24,
    metalness: 0.18,
  }));
  const woodMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Dark stained wood',
    color: PALETTE.wood,
    roughness: 0.9,
  }));
  const metalMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Painted iron',
    color: PALETTE.metal,
    roughness: 0.75,
    metalness: 0.28,
  }));
  const sandMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Compact cove sand',
    map: sandTexture,
    color: 0xe1d1af,
    roughness: 0.99,
    side: THREE.DoubleSide,
  }));
  const rockMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Tide-worn granite',
    map: graniteTexture,
    color: 0x9b9b91,
    roughness: 0.97,
    flatShading: true,
  }));
  const seaMaterial = resources.material(new THREE.MeshPhysicalMaterial({
    name: 'Muted Taiping Bay',
    map: waterTexture,
    color: PALETTE.sea,
    roughness: 0.31,
    metalness: 0.03,
    clearcoat: 0.28,
    clearcoatRoughness: 0.38,
  }));
  const shimmerMaterial = resources.material(new THREE.MeshBasicMaterial({
    name: 'Sea glints',
    map: shimmerTexture,
    color: PALETTE.seaHighlight,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const trunkMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Tree bark',
    color: 0x5c5244,
    roughness: 1,
    flatShading: true,
  }));
  const planeFoliageMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Plane tree foliage',
    color: PALETTE.foliage,
    roughness: 0.91,
    flatShading: true,
  }));
  const ginkgoFoliageMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Restrained ginkgo gold',
    color: PALETTE.ginkgo,
    roughness: 0.93,
    flatShading: true,
  }));
  const mapleFoliageMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Deep maple foliage',
    color: 0x687052,
    roughness: 0.92,
    flatShading: true,
  }));
  const cedarFoliageMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Cedar and juniper foliage',
    color: PALETTE.foliageDeep,
    roughness: 0.94,
    flatShading: true,
  }));
  const shrubMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Flowering understory',
    color: PALETTE.foliageBlue,
    roughness: 0.95,
    flatShading: true,
  }));
  const leafMaterial = resources.material(new THREE.MeshStandardMaterial({
    name: 'Leaf litter',
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  }));

  const villaMaterials: VillaMaterials = {
    granite: graniteMaterial,
    wallWarm: wallWarmMaterial,
    wallOchre: wallOchreMaterial,
    wallBrick: wallBrickMaterial,
    wallBlue: wallBlueMaterial,
    roofTile: roofTileMaterial,
    roofUmber: roofUmberMaterial,
    roofSlate: roofSlateMaterial,
    roofGreen: roofGreenMaterial,
    trim: trimMaterial,
    trimDark: trimDarkMaterial,
    glass: glassMaterial,
    wood: woodMaterial,
  };
  const landmarkMaterials: LandmarkMaterials = {
    granite: graniteMaterial,
    graniteDark: graniteDarkMaterial,
    roofTile: roofTileMaterial,
    roofGreen: roofGreenMaterial,
    glass: glassMaterial,
    trim: trimMaterial,
    wood: woodMaterial,
  };
  const gardenMaterials: GardenMaterials = {
    granite: gardenGraniteMaterial,
    graniteTop: gardenGraniteTopMaterial,
    metal: metalMaterial,
    wood: woodMaterial,
  };
  const vegetationMaterials: VegetationMaterials = {
    trunk: trunkMaterial,
    plane: planeFoliageMaterial,
    ginkgo: ginkgoFoliageMaterial,
    maple: mapleFoliageMaterial,
    cedar: cedarFoliageMaterial,
    shrub: shrubMaterial,
  };

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'Terrain and wooded hill';
  const terrainBounds = {
    minX: layout.bounds.minX - 54,
    maxX: layout.bounds.maxX + 54,
    minZ: Math.min(layout.bounds.minZ - 34, layout.hill.minZ),
    maxZ: Math.max(layout.bounds.maxZ + 34, layout.sea.minZ + 46),
  };
  const coastalGroundHeightAt = (z: number): number => {
    const coastProgress = THREE.MathUtils.clamp((z - layout.sea.minZ) / 12, 0, 1);
    const easedProgress = coastProgress * coastProgress * (3 - 2 * coastProgress);
    return THREE.MathUtils.lerp(groundHeightAt(z), layout.sea.level - 0.45, easedProgress);
  };
  const terrainGeometry = createTerrainGeometry(
    resources,
    terrainBounds,
    coastalGroundHeightAt,
    quality.name === 'desktop' ? 96 : 68,
    quality.name === 'desktop' ? 88 : 60,
  );
  const terrain = new THREE.Mesh(terrainGeometry, groundMaterial);
  terrain.name = 'Sloping garden ground';
  terrain.receiveShadow = true;
  terrain.matrixAutoUpdate = false;
  terrainGroup.add(terrain);

  const hillHeightAt = (z: number): number => {
    const progress = THREE.MathUtils.clamp(
      (z - layout.hill.minZ) / Math.max(1, layout.hill.maxZ - layout.hill.minZ),
      0,
      1,
    );
    return THREE.MathUtils.lerp(layout.hill.crestHeight, layout.hill.baseHeight, progress);
  };
  const hillGeometry = createTerrainGeometry(
    resources,
    {
      minX: terrainBounds.minX,
      maxX: terrainBounds.maxX,
      minZ: layout.hill.minZ,
      maxZ: layout.hill.maxZ,
    },
    hillHeightAt,
    quality.name === 'desktop' ? 56 : 36,
    quality.name === 'desktop' ? 20 : 14,
  );
  const hill = new THREE.Mesh(hillGeometry, groundMaterial);
  hill.name = 'Wooded northern rise';
  hill.receiveShadow = true;
  hill.matrixAutoUpdate = false;
  terrainGroup.add(hill);
  terrainGroup.matrixAutoUpdate = false;
  scene.add(terrainGroup);

  const roadBatcher = new StaticBatcher(resources);
  const identity = new THREE.Matrix4();
  for (const road of layout.roads) {
    const path = road.points.map((point) => ({ x: point.x, z: point.z }));
    const asphalt = createRibbonGeometry(resources, path, road.width, 0.045, groundHeightAt, 2.1);
    roadBatcher.add(asphalt, asphaltMaterial, identity, false, true);
    const curbOffset = road.width * 0.5 + 0.18;
    for (const side of [-1, 1]) {
      const curbPath = offsetPath(path, curbOffset * side);
      const curb = createRibbonGeometry(resources, curbPath, 0.34, 0.115, groundHeightAt, 2.1);
      roadBatcher.add(curb, graniteMaterial, identity, false, true);
      const walkOffset = road.width * 0.5 + 0.42 + road.sidewalkWidth * 0.5;
      const walkPath = offsetPath(path, walkOffset * side);
      const walk = createRibbonGeometry(resources, walkPath, road.sidewalkWidth, 0.075, groundHeightAt, 2.1);
      roadBatcher.add(walk, sidewalkMaterial, identity, false, true);
    }
  }
  scene.add(roadBatcher.build('3 × 7 asphalt road grid, curbs, and walks'));

  const villaBatcher = new StaticBatcher(resources);
  for (const villa of layout.villas) {
    addVillaToBatch(resources, villaBatcher, {
      x: villa.x,
      y: groundHeightAt(villa.z),
      z: villa.z,
      rotation: villa.yaw,
      width: villa.width,
      depth: villa.depth,
      floors: villa.storeys,
      archetype: villa.archetype,
      facade: villa.facade,
      roof: villa.roof,
    }, villaMaterials);
  }
  scene.add(villaBatcher.build('Detached garden villas'));

  const landmarkBatcher = new StaticBatcher(resources);
  for (const landmark of layout.landmarks) {
    if (landmark.kind === 'huashi-inspired') {
      addCoastalLandmarkToBatch(resources, landmarkBatcher, {
        x: landmark.x,
        y: groundHeightAt(landmark.z),
        z: landmark.z,
        rotation: landmark.yaw,
        scale: Math.min(1.05, landmark.width / 14),
      }, landmarkMaterials);
    } else if (landmark.kind === 'blue-green-villa') {
      addVillaToBatch(resources, landmarkBatcher, {
        x: landmark.x,
        y: groundHeightAt(landmark.z),
        z: landmark.z,
        rotation: landmark.yaw,
        width: landmark.width,
        depth: landmark.depth,
        floors: landmark.storeys,
        archetype: 'nordic-blue',
        facade: landmark.facade === 'muted-blue-green' ? 'sage-grey' : 'warm-ivory',
        roof: landmark.roof,
      }, villaMaterials);
    }
  }
  scene.add(landmarkBatcher.build('Coastal landmarks'));

  const gardenBatcher = new StaticBatcher(resources);
  for (const wall of layout.walls) {
    addGardenWallSegment(
      gardenBatcher,
      { x: wall.from.x, z: wall.from.z },
      { x: wall.to.x, z: wall.to.z },
      groundHeightAt,
      gardenMaterials,
      wall.height,
      wall.width,
    );
  }
  for (const villa of layout.villas) {
    const gateZ = villa.entrance === 'north' ? villa.parcel.minZ : villa.parcel.maxZ;
    addGardenGate(
      gardenBatcher,
      { x: (villa.parcel.minX + villa.parcel.maxX) * 0.5, z: gateZ },
      0,
      groundHeightAt,
      gardenMaterials,
      2.8,
    );
  }
  for (const furniture of layout.furniture) {
    const kind = String(furniture.kind).toLowerCase();
    const position = { x: furniture.x, z: furniture.z };
    if (kind.includes('gate')) {
      addGardenGate(gardenBatcher, position, furniture.yaw, groundHeightAt, gardenMaterials, 2.7 * furniture.scale);
    } else if (kind.includes('bench')) {
      addBench(gardenBatcher, position, furniture.yaw, groundHeightAt, gardenMaterials);
    } else if (kind.includes('lamp')) {
      const y = groundHeightAt(furniture.z);
      gardenBatcher.add(gardenBatcher.unitCylinder8, metalMaterial, createTransform(furniture.x, y + 1.55 * furniture.scale, furniture.z, 0.07, 3.1 * furniture.scale, 0.07));
      gardenBatcher.addBox(metalMaterial, createTransform(furniture.x, y + 3.05 * furniture.scale, furniture.z, 0.48, 0.5, 0.48, furniture.yaw), false, true);
      gardenBatcher.addBox(glassMaterial, createTransform(furniture.x, y + 3.05 * furniture.scale, furniture.z, 0.32, 0.34, 0.32, furniture.yaw), false, true);
    } else if (kind.includes('sign')) {
      const y = groundHeightAt(furniture.z);
      const scale = furniture.scale;
      const root = createTransform(furniture.x, y, furniture.z, 1, 1, 1, furniture.yaw);
      gardenBatcher.addBox(graniteMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(0, 0.64 * scale, 0, 0.24 * scale, 1.28 * scale, 0.24 * scale)));
      gardenBatcher.addBox(graniteMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(0, 1.25 * scale, 0, 0.36 * scale, 0.12 * scale, 0.3 * scale)));
      gardenBatcher.addBox(trimMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(0, 1.48 * scale, 0, 1.44 * scale, 0.52 * scale, 0.08 * scale)), false, true);
      gardenBatcher.addBox(roofGreenMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(0, 1.48 * scale, 0.055 * scale, 1.25 * scale, 0.33 * scale, 0.035 * scale)), false, true);
      gardenBatcher.addBox(roofGreenMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(0, 1.48 * scale, -0.055 * scale, 1.25 * scale, 0.33 * scale, 0.035 * scale)), false, true);
    } else if (kind.includes('rail') || kind.includes('overlook')) {
      const y = groundHeightAt(furniture.z);
      const root = createTransform(furniture.x, y, furniture.z, 1, 1, 1, furniture.yaw);
      gardenBatcher.addBox(metalMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(0, 0.58, 0, 4.2 * furniture.scale, 0.07, 0.07)), false, true);
      for (const x of [-1.9, 0, 1.9]) {
        gardenBatcher.addBox(metalMaterial, new THREE.Matrix4().multiplyMatrices(root, createTransform(x * furniture.scale, 0.52, 0, 0.07, 1.04, 0.07)), false, true);
      }
    } else {
      const y = groundHeightAt(furniture.z);
      gardenBatcher.addBox(graniteMaterial, createTransform(furniture.x, y + 0.48 * furniture.scale, furniture.z, 0.72 * furniture.scale, 0.96 * furniture.scale, 0.28 * furniture.scale, furniture.yaw));
      gardenBatcher.addBox(metalMaterial, createTransform(furniture.x, y + 0.74 * furniture.scale, furniture.z, 0.58 * furniture.scale, 0.32 * furniture.scale, 0.035, furniture.yaw), false, true);
    }
  }
  scene.add(gardenBatcher.build('Granite garden walls, gates, and street furniture'));

  const coveGroup = new THREE.Group();
  coveGroup.name = 'Sand and rock cove';
  const shoreZ = layout.sea.minZ;
  const sandGeometry = createIrregularPatchGeometry(resources, [
    { x: -27, z: shoreZ - 3.2 },
    { x: -31, z: shoreZ + 2.5 },
    { x: -22, z: shoreZ + 8.2 },
    { x: -6, z: shoreZ + 10.8 },
    { x: 11, z: shoreZ + 9.6 },
    { x: 27, z: shoreZ + 5.2 },
    { x: 31, z: shoreZ - 1.8 },
    { x: 19, z: shoreZ - 4.5 },
    { x: 2, z: shoreZ - 5.3 },
    { x: -14, z: shoreZ - 4.8 },
  ], 0.06, coastalGroundHeightAt);
  const sand = new THREE.Mesh(sandGeometry, sandMaterial);
  sand.name = 'Compact pale sand';
  sand.receiveShadow = true;
  sand.matrixAutoUpdate = false;
  coveGroup.add(sand);

  const rockSpecs: RockBuildSpec[] = [];
  const rockCount = quality.name === 'desktop' ? 28 : 18;
  for (let index = 0; index < rockCount; index += 1) {
    const rightSide = index % 2 === 0;
    const x = rightSide ? 24 + random() * 16 : -24 - random() * 15;
    const z = shoreZ - 4 + random() * 16;
    const size = 0.45 + random() * 1.25;
    rockSpecs.push({
      x,
      y: Math.max(layout.sea.level - size * 0.34, coastalGroundHeightAt(z) + size * 0.18),
      z,
      scaleX: size * (0.8 + random() * 0.65),
      scaleY: size * (0.55 + random() * 0.42),
      scaleZ: size * (0.75 + random() * 0.7),
      rotation: random() * Math.PI,
    });
  }
  const rocks = buildRocks(resources, rockSpecs, rockMaterial);
  if (rocks) coveGroup.add(rocks);
  coveGroup.matrixAutoUpdate = false;
  scene.add(coveGroup);

  const seaGroup = new THREE.Group();
  seaGroup.name = 'Taiping Bay';
  const seaNearZ = layout.sea.minZ - 8;
  const seaFarZ = layout.bounds.maxZ + ATMOSPHERE.fogFar;
  const seaWidth = layout.bounds.maxX - layout.bounds.minX + ATMOSPHERE.fogFar * 2;
  const seaDepth = seaFarZ - seaNearZ;
  const seaGeometry = resources.geometry(new THREE.PlaneGeometry(seaWidth, seaDepth, 1, 1));
  seaGeometry.rotateX(-Math.PI * 0.5);
  const seaCenterZ = (seaNearZ + seaFarZ) * 0.5;
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.name = 'Muted teal water';
  sea.position.set(0, layout.sea.level, seaCenterZ);
  sea.receiveShadow = false;
  sea.matrixAutoUpdate = false;
  sea.updateMatrix();
  seaGroup.add(sea);
  const shimmer = new THREE.Mesh(seaGeometry, shimmerMaterial);
  shimmer.name = 'Low marine shimmer';
  shimmer.position.set(0, layout.sea.level + 0.018, seaCenterZ);
  shimmer.renderOrder = 2;
  shimmer.matrixAutoUpdate = false;
  shimmer.updateMatrix();
  seaGroup.add(shimmer);
  seaGroup.matrixAutoUpdate = false;
  scene.add(seaGroup);

  const vegetationSpecs: TreeBuildSpec[] = [];
  for (let index = 0; index < layout.vegetation.length; index += 1) {
    const vegetation = layout.vegetation[index]!;
    let selectionHash = seedFromText(`${layout.seed}:${vegetation.id}`);
    selectionHash = Math.imul(selectionHash ^ (selectionHash >>> 16), 0x45d9f3b);
    const selection = (selectionHash >>> 0) / 4294967296;
    if (quality.name === 'coarse' && !vegetation.corridorId && selection > quality.treeDensity) continue;
    vegetationSpecs.push({
      x: vegetation.x,
      y: groundHeightAt(vegetation.z),
      z: vegetation.z,
      scale: vegetation.scale,
      height: vegetation.height,
      canopyRadius: vegetation.canopyRadius,
      rotation: vegetation.yaw,
      species: `${vegetation.species} ${vegetation.foliage}`,
      animate: Math.abs(vegetation.x) < 24 && vegetation.z > -72 && vegetation.z < 68 && index % 5 === 0,
      phase: selection * Math.PI * 2,
    });
  }

  const northTreeCount = quality.name === 'desktop' ? 38 : 25;
  for (let index = 0; index < northTreeCount; index += 1) {
    const x = THREE.MathUtils.lerp(terrainBounds.minX + 5, terrainBounds.maxX - 5, (index + random() * 0.6) / northTreeCount);
    const z = THREE.MathUtils.lerp(layout.hill.minZ + 4, layout.hill.maxZ - 3, 0.28 + random() * 0.64);
    vegetationSpecs.push({
      x,
      y: hillHeightAt(z),
      z,
      scale: 0.85 + random() * 0.45,
      height: 13.5 + random() * 4.5,
      canopyRadius: 3.5 + random() * 1.6,
      rotation: random() * Math.PI * 2,
      species: index % 5 === 0 ? 'cedar' : index % 4 === 0 ? 'maple' : 'plane',
    });
  }
  const sideTreeCount = quality.name === 'desktop' ? 24 : 16;
  for (const side of [-1, 1]) {
    for (let index = 0; index < sideTreeCount; index += 1) {
      const z = THREE.MathUtils.lerp(layout.bounds.minZ - 14, layout.sea.minZ + 2, (index + random() * 0.7) / sideTreeCount);
      const x = side < 0
        ? layout.bounds.minX - 9 - random() * 13
        : layout.bounds.maxX + 9 + random() * 13;
      vegetationSpecs.push({
        x,
        y: coastalGroundHeightAt(z),
        z,
        scale: 0.9 + random() * 0.45,
        height: 13 + random() * 4,
        canopyRadius: 3.4 + random() * 1.5,
        rotation: random() * Math.PI * 2,
        species: index % 6 === 0 ? 'cedar' : index % 5 === 0 ? 'maple' : 'plane',
      });
    }
  }

  const vegetation = buildVegetation(
    resources,
    vegetationSpecs,
    vegetationMaterials,
    quality.name === 'desktop' ? 18 : 8,
  );
  const vegetationGroup = new THREE.Group();
  vegetationGroup.name = 'Dense species-varied canopy';
  vegetationGroup.add(vegetation.group);

  const litterSpecs: LeafLitterSpec[] = [];
  const litterPerTree = quality.name === 'desktop' ? 6 : 3;
  for (const vegetation of layout.vegetation) {
    const species = vegetation.species.toLowerCase();
    if (!species.includes('ginkgo') && !species.includes('maidenhair') && !species.includes('maple')) continue;
    for (let index = 0; index < litterPerTree; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = vegetation.canopyRadius * (0.35 + random() * 0.9);
      const x = vegetation.x + Math.cos(angle) * radius;
      const z = vegetation.z + Math.sin(angle) * radius;
      litterSpecs.push({
        x,
        y: coastalGroundHeightAt(z) + 0.095,
        z,
        rotation: random() * Math.PI * 2,
        scale: 0.55 + random() * 0.85,
        color: species.includes('ginkgo') || species.includes('maidenhair')
          ? random() > 0.28 ? 0xb89b48 : 0x8b713d
          : random() > 0.55 ? 0x865844 : 0x6f6d45,
      });
    }
  }
  const leafLitter = buildLeafLitter(resources, litterSpecs, leafMaterial);
  if (leafLitter) vegetationGroup.add(leafLitter);
  vegetationGroup.matrixAutoUpdate = false;
  scene.add(vegetationGroup);

  let lastShadowCellX = Number.NaN;
  let lastShadowCellZ = Number.NaN;
  let disposed = false;

  const world: World = {
    scene,
    bounds: layout.bounds,
    update(dt, elapsed, viewerPosition, reducedMotion) {
      if (disposed) return;
      void dt;
      const windElapsed = elapsed * (ATMOSPHERE.windSpeed / 0.34);
      if (!reducedMotion) {
        waterTexture.offset.set((windElapsed * 0.0018) % 1, (windElapsed * 0.0036) % 1);
        shimmerTexture.offset.set((-windElapsed * 0.0032) % 1, (windElapsed * 0.0061) % 1);
      }
      updateCrownSway(vegetation.crowns, windElapsed, viewerPosition, reducedMotion);

      const shadowCellX = Math.round(viewerPosition.x / 12) * 12;
      const shadowCellZ = Math.round(viewerPosition.z / 12) * 12;
      if (shadowCellX !== lastShadowCellX || shadowCellZ !== lastShadowCellZ) {
        lastShadowCellX = shadowCellX;
        lastShadowCellZ = shadowCellZ;
        const targetY = groundHeightAt(shadowCellZ);
        sun.target.position.set(shadowCellX, targetY, shadowCellZ);
        sun.position.set(shadowCellX, targetY, shadowCellZ).addScaledVector(sunDirection, 168);
        sun.target.updateMatrixWorld();
        sun.updateMatrixWorld();
        sun.shadow.needsUpdate = true;
      }
    },
    invalidateShadow() {
      if (!disposed) sun.shadow.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.traverse((object) => {
        const instance = object as THREE.InstancedMesh;
        if (instance.isInstancedMesh) instance.dispose();
      });
      sun.shadow.dispose();
      scene.environment = null;
      scene.background = null;
      scene.fog = null;
      scene.clear();
      resources.dispose();
    },
  };

  return world;
}
