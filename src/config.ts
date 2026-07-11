export interface QualityProfile {
  readonly name: "desktop" | "coarse";
  readonly dprCap: number;
  readonly maxDrawingBufferPixels: number;
  readonly antialias: boolean;
  readonly shadowMapSize: 1024 | 2048;
  readonly shadowDistance: number;
  readonly treeDensity: number;
  readonly detailDistance: number;
}

export const DEFAULT_SEED = "badaguan-october-1635";

const DESKTOP_QUALITY: QualityProfile = Object.freeze({
  name: "desktop",
  dprCap: 1.5,
  maxDrawingBufferPixels: 3_000_000,
  antialias: true,
  shadowMapSize: 2048,
  shadowDistance: 108,
  treeDensity: 1,
  detailDistance: 156,
});

const COARSE_QUALITY: QualityProfile = Object.freeze({
  name: "coarse",
  dprCap: 1.25,
  maxDrawingBufferPixels: 1_500_000,
  antialias: false,
  shadowMapSize: 1024,
  shadowDistance: 72,
  treeDensity: 0.68,
  detailDistance: 112,
});

export function selectQualityProfile(coarsePointer: boolean): QualityProfile {
  return coarsePointer ? COARSE_QUALITY : DESKTOP_QUALITY;
}

export const CAMERA = Object.freeze({
  fov: 58,
  near: 0.08,
  far: 320,
  eyeHeight: 1.65,
});

export const CONTROLS = Object.freeze({
  eyeHeight: 1.65,
  radius: 0.35,
  walkSpeed: 2.4,
  briskSpeed: 4.2,
  acceleration: 7,
  deceleration: 9,
  pointerSensitivity: 0.0019,
  dragSensitivity: 0.004,
  touchLookSensitivity: 0.004,
  pitchMin: -0.959931,
  pitchMax: 1.134464,
  maxDelta: 0.05,
} as const);

export const ATMOSPHERE = Object.freeze({
  timeLabel: "Early October · 16:35",
  fogColor: 0xb8c3bd,
  fogNear: 76,
  fogFar: 286,
  hazeDensity: 0.0036,
  sunAzimuthDegrees: 238,
  sunElevationDegrees: 21,
  sunColor: 0xffe6c7,
  sunIntensity: 2.6,
  skyIntensity: 0.74,
  seaLevel: 0.72,
  windSpeed: 0.34,
});

export const PALETTE = Object.freeze({
  skyZenith: 0x94a9aa,
  skyHorizon: 0xd5d0bd,
  haze: 0xb8c3bd,
  sea: 0x5f8f8d,
  seaHighlight: 0x91aaa0,
  asphalt: 0x4c514f,
  sidewalk: 0x9b9990,
  granite: 0x777a73,
  graniteDark: 0x5f625d,
  soil: 0x65594a,
  grass: 0x61735b,
  foliage: 0x55705a,
  foliageDeep: 0x354f43,
  foliageBlue: 0x587069,
  ginkgo: 0xb59a4a,
  terracotta: 0x8f4e3e,
  plaster: 0xc9bda5,
  ochre: 0xb39162,
  brick: 0x875849,
  blueGreen: 0x64898a,
  wood: 0x5e4636,
  metal: 0x4e5552,
});
