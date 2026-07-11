import type { Aabb2, Bounds2 } from "../world/layout";

const DEFAULT_CELL_SIZE = 12;
const CONTACT_EPSILON = 0.0001;
const DISTANCE_EPSILON = 1e-12;

interface ReadonlyVector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MutableVector3Like {
  x: number;
  y: number;
  z: number;
}

export class CollisionWorld {
  private readonly bounds: Bounds2;
  private readonly cellSize: number;
  private readonly columnCount: number;
  private readonly rowCount: number;
  private readonly grid: number[][];
  private readonly colliderMinX: Float64Array;
  private readonly colliderMaxX: Float64Array;
  private readonly colliderMinZ: Float64Array;
  private readonly colliderMaxZ: Float64Array;
  private readonly colliderActive: Uint8Array;
  private readonly visited: Uint32Array;
  private queryStamp = 0;

  constructor(bounds: Bounds2, colliders: readonly Aabb2[], cellSize = DEFAULT_CELL_SIZE) {
    const minX = Math.min(bounds.minX, bounds.maxX);
    const maxX = Math.max(bounds.minX, bounds.maxX);
    const minZ = Math.min(bounds.minZ, bounds.maxZ);
    const maxZ = Math.max(bounds.minZ, bounds.maxZ);
    this.bounds = Object.freeze({ minX, maxX, minZ, maxZ });
    this.cellSize = Number.isFinite(cellSize) && cellSize > 0.25 ? cellSize : DEFAULT_CELL_SIZE;
    this.columnCount = Math.max(1, Math.ceil((maxX - minX) / this.cellSize));
    this.rowCount = Math.max(1, Math.ceil((maxZ - minZ) / this.cellSize));

    const cellCount = this.columnCount * this.rowCount;
    this.grid = new Array<number[]>(cellCount);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      this.grid[cellIndex] = [];
    }

    const colliderCount = colliders.length;
    this.colliderMinX = new Float64Array(colliderCount);
    this.colliderMaxX = new Float64Array(colliderCount);
    this.colliderMinZ = new Float64Array(colliderCount);
    this.colliderMaxZ = new Float64Array(colliderCount);
    this.colliderActive = new Uint8Array(colliderCount);
    this.visited = new Uint32Array(colliderCount);

    for (let colliderIndex = 0; colliderIndex < colliderCount; colliderIndex += 1) {
      const collider = colliders[colliderIndex];
      if (
        !collider ||
        !Number.isFinite(collider.minX) ||
        !Number.isFinite(collider.maxX) ||
        !Number.isFinite(collider.minZ) ||
        !Number.isFinite(collider.maxZ)
      ) {
        continue;
      }

      const colliderMinX = Math.min(collider.minX, collider.maxX);
      const colliderMaxX = Math.max(collider.minX, collider.maxX);
      const colliderMinZ = Math.min(collider.minZ, collider.maxZ);
      const colliderMaxZ = Math.max(collider.minZ, collider.maxZ);
      if (colliderMaxX < minX || colliderMinX > maxX || colliderMaxZ < minZ || colliderMinZ > maxZ) {
        continue;
      }

      this.colliderMinX[colliderIndex] = colliderMinX;
      this.colliderMaxX[colliderIndex] = colliderMaxX;
      this.colliderMinZ[colliderIndex] = colliderMinZ;
      this.colliderMaxZ[colliderIndex] = colliderMaxZ;
      this.colliderActive[colliderIndex] = 1;

      const firstColumn = this.columnFor(colliderMinX);
      const lastColumn = this.columnFor(colliderMaxX);
      const firstRow = this.rowFor(colliderMinZ);
      const lastRow = this.rowFor(colliderMaxZ);
      for (let row = firstRow; row <= lastRow; row += 1) {
        const rowOffset = row * this.columnCount;
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          this.grid[rowOffset + column]?.push(colliderIndex);
        }
      }
    }
  }

  isFree(position: { readonly x: number; readonly z: number }, radius: number): boolean {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
      return false;
    }

    const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    if (
      position.x - safeRadius < this.bounds.minX ||
      position.x + safeRadius > this.bounds.maxX ||
      position.z - safeRadius < this.bounds.minZ ||
      position.z + safeRadius > this.bounds.maxZ
    ) {
      return false;
    }

    const stamp = this.nextQueryStamp();
    const firstColumn = this.columnFor(position.x - safeRadius);
    const lastColumn = this.columnFor(position.x + safeRadius);
    const firstRow = this.rowFor(position.z - safeRadius);
    const lastRow = this.rowFor(position.z + safeRadius);
    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowOffset = row * this.columnCount;
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const bucket = this.grid[rowOffset + column];
        if (!bucket) {
          continue;
        }
        for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex += 1) {
          const colliderIndex = bucket[bucketIndex];
          if (colliderIndex === undefined || this.visited[colliderIndex] === stamp) {
            continue;
          }
          this.visited[colliderIndex] = stamp;
          if (this.colliderActive[colliderIndex] && this.intersects(colliderIndex, position.x, position.z, safeRadius)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  resolveMove<T extends MutableVector3Like>(
    position: ReadonlyVector3Like,
    displacement: ReadonlyVector3Like,
    radius: number,
    out: T,
  ): T {
    const startX = Number.isFinite(position.x) ? position.x : 0;
    const startY = position.y;
    const startZ = Number.isFinite(position.z) ? position.z : 0;
    const moveX = Number.isFinite(displacement.x) ? displacement.x : 0;
    const moveY = displacement.y;
    const moveZ = Number.isFinite(displacement.z) ? displacement.z : 0;
    const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    const minimumX = this.bounds.minX + safeRadius;
    const maximumX = this.bounds.maxX - safeRadius;
    const minimumZ = this.bounds.minZ + safeRadius;
    const maximumZ = this.bounds.maxZ - safeRadius;

    let x = minimumX <= maximumX ? Math.min(maximumX, Math.max(minimumX, startX)) : (this.bounds.minX + this.bounds.maxX) * 0.5;
    let z = minimumZ <= maximumZ ? Math.min(maximumZ, Math.max(minimumZ, startZ)) : (this.bounds.minZ + this.bounds.maxZ) * 0.5;
    const maximumComponent = Math.max(Math.abs(moveX), Math.abs(moveZ));
    const substepLength = Math.max(0.08, Math.min(0.18, safeRadius > 0 ? safeRadius * 0.45 : 0.12));
    const substepCount = Math.max(1, Math.ceil(maximumComponent / substepLength));
    const stepX = moveX / substepCount;
    const stepZ = moveZ / substepCount;

    // All scratch state lives in locals or preallocated typed arrays; this loop allocates nothing.
    for (let step = 0; step < substepCount; step += 1) {
      if (stepX !== 0) {
        x = this.resolveX(x, z, stepX, safeRadius, minimumX, maximumX);
      }
      if (stepZ !== 0) {
        z = this.resolveZ(x, z, stepZ, safeRadius, minimumZ, maximumZ);
      }
    }

    out.x = x;
    out.y = startY + moveY;
    out.z = z;
    return out;
  }

  private resolveX(
    currentX: number,
    z: number,
    deltaX: number,
    radius: number,
    minimumX: number,
    maximumX: number,
  ): number {
    let candidateX = minimumX <= maximumX
      ? Math.min(maximumX, Math.max(minimumX, currentX + deltaX))
      : (this.bounds.minX + this.bounds.maxX) * 0.5;
    const stamp = this.nextQueryStamp();
    const firstColumn = this.columnFor(candidateX - radius);
    const lastColumn = this.columnFor(candidateX + radius);
    const firstRow = this.rowFor(z - radius);
    const lastRow = this.rowFor(z + radius);

    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowOffset = row * this.columnCount;
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const bucket = this.grid[rowOffset + column];
        if (!bucket) {
          continue;
        }
        for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex += 1) {
          const colliderIndex = bucket[bucketIndex];
          if (colliderIndex === undefined || this.visited[colliderIndex] === stamp) {
            continue;
          }
          this.visited[colliderIndex] = stamp;
          if (!this.colliderActive[colliderIndex] || !this.intersects(colliderIndex, candidateX, z, radius)) {
            continue;
          }
          const colliderMinX = this.colliderMinX[colliderIndex];
          const colliderMaxX = this.colliderMaxX[colliderIndex];
          if (colliderMinX === undefined || colliderMaxX === undefined) {
            continue;
          }

          if (deltaX > 0 && currentX <= colliderMinX) {
            candidateX = Math.min(candidateX, colliderMinX - radius - CONTACT_EPSILON);
          } else if (deltaX < 0 && currentX >= colliderMaxX) {
            candidateX = Math.max(candidateX, colliderMaxX + radius + CONTACT_EPSILON);
          } else {
            candidateX = currentX;
          }
        }
      }
    }
    return candidateX;
  }

  private resolveZ(
    x: number,
    currentZ: number,
    deltaZ: number,
    radius: number,
    minimumZ: number,
    maximumZ: number,
  ): number {
    let candidateZ = minimumZ <= maximumZ
      ? Math.min(maximumZ, Math.max(minimumZ, currentZ + deltaZ))
      : (this.bounds.minZ + this.bounds.maxZ) * 0.5;
    const stamp = this.nextQueryStamp();
    const firstColumn = this.columnFor(x - radius);
    const lastColumn = this.columnFor(x + radius);
    const firstRow = this.rowFor(candidateZ - radius);
    const lastRow = this.rowFor(candidateZ + radius);

    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowOffset = row * this.columnCount;
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const bucket = this.grid[rowOffset + column];
        if (!bucket) {
          continue;
        }
        for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex += 1) {
          const colliderIndex = bucket[bucketIndex];
          if (colliderIndex === undefined || this.visited[colliderIndex] === stamp) {
            continue;
          }
          this.visited[colliderIndex] = stamp;
          if (!this.colliderActive[colliderIndex] || !this.intersects(colliderIndex, x, candidateZ, radius)) {
            continue;
          }
          const colliderMinZ = this.colliderMinZ[colliderIndex];
          const colliderMaxZ = this.colliderMaxZ[colliderIndex];
          if (colliderMinZ === undefined || colliderMaxZ === undefined) {
            continue;
          }

          if (deltaZ > 0 && currentZ <= colliderMinZ) {
            candidateZ = Math.min(candidateZ, colliderMinZ - radius - CONTACT_EPSILON);
          } else if (deltaZ < 0 && currentZ >= colliderMaxZ) {
            candidateZ = Math.max(candidateZ, colliderMaxZ + radius + CONTACT_EPSILON);
          } else {
            candidateZ = currentZ;
          }
        }
      }
    }
    return candidateZ;
  }

  private intersects(colliderIndex: number, x: number, z: number, radius: number): boolean {
    const colliderMinX = this.colliderMinX[colliderIndex];
    const colliderMaxX = this.colliderMaxX[colliderIndex];
    const colliderMinZ = this.colliderMinZ[colliderIndex];
    const colliderMaxZ = this.colliderMaxZ[colliderIndex];
    if (
      colliderMinX === undefined ||
      colliderMaxX === undefined ||
      colliderMinZ === undefined ||
      colliderMaxZ === undefined
    ) {
      return false;
    }

    if (radius === 0) {
      return (
        x > colliderMinX &&
        x < colliderMaxX &&
        z > colliderMinZ &&
        z < colliderMaxZ
      );
    }

    const closestX = x < colliderMinX
      ? colliderMinX
      : x > colliderMaxX
        ? colliderMaxX
        : x;
    const closestZ = z < colliderMinZ
      ? colliderMinZ
      : z > colliderMaxZ
        ? colliderMaxZ
        : z;
    const differenceX = x - closestX;
    const differenceZ = z - closestZ;
    return differenceX * differenceX + differenceZ * differenceZ < radius * radius - DISTANCE_EPSILON;
  }

  private columnFor(x: number): number {
    const column = Math.floor((x - this.bounds.minX) / this.cellSize);
    return Math.min(this.columnCount - 1, Math.max(0, column));
  }

  private rowFor(z: number): number {
    const row = Math.floor((z - this.bounds.minZ) / this.cellSize);
    return Math.min(this.rowCount - 1, Math.max(0, row));
  }

  private nextQueryStamp(): number {
    this.queryStamp = (this.queryStamp + 1) >>> 0;
    if (this.queryStamp === 0) {
      this.visited.fill(0);
      this.queryStamp = 1;
    }
    return this.queryStamp;
  }
}
