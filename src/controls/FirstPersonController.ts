import { Vector3, type PerspectiveCamera } from 'three';

import { CONTROLS } from '../config';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { ControlMode } from '../ui/ControlsOverlay';
import { groundHeightAt, type SpawnPose } from '../world/layout';

export type FirstPersonControllerMode = Extract<
  ControlMode,
  'exploring' | 'paused' | 'drag' | 'touch'
>;

export interface FirstPersonControllerOptions {
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly collision: CollisionWorld;
  readonly moveZone: HTMLElement;
  readonly lookZone: HTMLElement;
  readonly spawn: SpawnPose;
  readonly onModeChange: (mode: FirstPersonControllerMode) => void;
  readonly onInput: (code: string) => void;
  readonly onJoystick: (x: number, y: number, active: boolean) => void;
}

const MAX_SIMULATION_STEP = 1 / 60;
const MAX_COLLISION_STEP = CONTROLS.radius * 0.45;
const COLLISION_EPSILON = 1e-5;
const JOYSTICK_DEAD_ZONE = 0.12;
const JOYSTICK_RADIUS_FACTOR = 0.28;
const JOYSTICK_MIN_RADIUS = 36;
const JOYSTICK_MAX_RADIUS = 72;
const NON_PASSIVE_LISTENER = { passive: false } as const;
const POINTER_LOCK_FALLBACK_MS = 700;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isMovementCode(code: string): boolean {
  switch (code) {
    case 'KeyW':
    case 'KeyA':
    case 'KeyS':
    case 'KeyD':
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'ArrowDown':
    case 'ArrowRight':
    case 'ShiftLeft':
    case 'ShiftRight':
      return true;
    default:
      return false;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export class FirstPersonController {
  private readonly camera: PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly collision: CollisionWorld;
  private readonly moveZone: HTMLElement;
  private readonly lookZone: HTMLElement;
  private readonly spawn: SpawnPose;
  private readonly onModeChange: (mode: FirstPersonControllerMode) => void;
  private readonly onInput: (code: string) => void;
  private readonly onJoystick: (x: number, y: number, active: boolean) => void;

  private readonly pressedCodes = new Set<string>();
  private readonly velocity = new Vector3();
  private readonly displacement = new Vector3();
  private readonly resolvedPosition = new Vector3();

  private readonly previousCanvasTouchAction: string;
  private readonly previousMoveTouchAction: string;
  private readonly previousLookTouchAction: string;
  private readonly previousMoveOverscrollBehavior: string;
  private readonly previousLookOverscrollBehavior: string;

  private yaw: number;
  private pitch: number;
  private enabled = false;
  private disposed = false;
  private pointerLockPending = false;
  private ownsPointerLock = false;
  private pointerLockFallbackTimer: number | null = null;
  private mode: FirstPersonControllerMode | null = null;

  private dragPointerId: number | null = null;
  private dragLastX = 0;
  private dragLastY = 0;

  private movePointerId: number | null = null;
  private moveOriginX = 0;
  private moveOriginY = 0;
  private moveRadius = JOYSTICK_MIN_RADIUS;
  private joystickX = 0;
  private joystickY = 0;

  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  public constructor(options: FirstPersonControllerOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.collision = options.collision;
    this.moveZone = options.moveZone;
    this.lookZone = options.lookZone;
    this.spawn = options.spawn;
    this.onModeChange = options.onModeChange;
    this.onInput = options.onInput;
    this.onJoystick = options.onJoystick;

    this.yaw = options.spawn.yaw;
    this.pitch = clamp(options.spawn.pitch, CONTROLS.pitchMin, CONTROLS.pitchMax);

    this.previousCanvasTouchAction = this.canvas.style.touchAction;
    this.previousMoveTouchAction = this.moveZone.style.touchAction;
    this.previousLookTouchAction = this.lookZone.style.touchAction;
    this.previousMoveOverscrollBehavior = this.moveZone.style.overscrollBehavior;
    this.previousLookOverscrollBehavior = this.lookZone.style.overscrollBehavior;

    this.canvas.style.touchAction = 'none';
    this.moveZone.style.touchAction = 'none';
    this.lookZone.style.touchAction = 'none';
    this.moveZone.style.overscrollBehavior = 'contain';
    this.lookZone.style.overscrollBehavior = 'contain';

    this.camera.rotation.order = 'YXZ';
    this.placeAtSpawn();
    this.installEventListeners();
  }

  public activateFromGesture(): void {
    if (this.disposed) {
      return;
    }

    this.enabled = true;
    this.focusCanvas();

    if (this.pointerLockPending) {
      return;
    }

    this.clearKeyboardAndVelocity();
    this.clearPointerInputs();

    if (document.pointerLockElement === this.canvas) {
      this.completePointerLockSuccess();
      return;
    }

    const requestPointerLock = this.canvas.requestPointerLock;
    if (typeof requestPointerLock !== 'function') {
      this.completePointerLockFailure();
      return;
    }

    this.clearPointerLockFallbackTimer();
    this.pointerLockPending = true;
    this.ownsPointerLock = false;

    try {
      const requestResult: unknown = requestPointerLock.call(this.canvas);
      if (
        requestResult !== null &&
        typeof requestResult === 'object' &&
        'then' in requestResult &&
        typeof (requestResult as PromiseLike<void>).then === 'function'
      ) {
        void Promise.resolve(requestResult).catch(this.handlePointerLockRequestFailure);
      }
    } catch {
      this.completePointerLockFailure();
      return;
    }

    if (this.pointerLockPending) {
      this.pointerLockFallbackTimer = window.setTimeout(
        this.handlePointerLockFallback,
        POINTER_LOCK_FALLBACK_MS,
      );
    }
  }

  public activateTouch(): void {
    if (this.disposed) {
      return;
    }

    this.releasePointerLockSilently();
    this.clearPointerInputs();
    this.enabled = true;
    this.focusCanvas();
    this.setMode('touch');
  }

  public activateDrag(): void {
    if (this.disposed) {
      return;
    }

    this.releasePointerLockSilently();
    this.clearPointerInputs();
    this.enabled = true;
    this.focusCanvas();
    this.setMode('drag');
  }

  public suspend(): void {
    if (this.disposed) {
      return;
    }

    this.enabled = false;
    this.releasePointerLockSilently();
    this.resetInput();
    this.mode = null;
  }

  public update(dt: number): void {
    if (this.disposed) {
      return;
    }

    this.camera.position.y = groundHeightAt(this.camera.position.z) + CONTROLS.eyeHeight;

    if (!this.enabled || !Number.isFinite(dt) || dt <= 0) {
      return;
    }

    let localRight =
      (this.pressedCodes.has('KeyD') || this.pressedCodes.has('ArrowRight') ? 1 : 0) -
      (this.pressedCodes.has('KeyA') || this.pressedCodes.has('ArrowLeft') ? 1 : 0) +
      this.joystickX;
    let localForward =
      (this.pressedCodes.has('KeyW') || this.pressedCodes.has('ArrowUp') ? 1 : 0) -
      (this.pressedCodes.has('KeyS') || this.pressedCodes.has('ArrowDown') ? 1 : 0) -
      this.joystickY;

    const inputLength = Math.hypot(localRight, localForward);
    if (inputLength > 1) {
      localRight /= inputLength;
      localForward /= inputLength;
    }

    const brisk =
      this.pressedCodes.has('ShiftLeft') || this.pressedCodes.has('ShiftRight');
    const speed = brisk ? CONTROLS.briskSpeed : CONTROLS.walkSpeed;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const targetVelocityX = (cosYaw * localRight - sinYaw * localForward) * speed;
    const targetVelocityZ = (-sinYaw * localRight - cosYaw * localForward) * speed;
    const acceleration = inputLength > 0 ? CONTROLS.acceleration : CONTROLS.deceleration;

    let remaining = Math.min(dt, CONTROLS.maxDelta);
    while (remaining > COLLISION_EPSILON) {
      const step = Math.min(remaining, MAX_SIMULATION_STEP);
      this.approachVelocity(targetVelocityX, targetVelocityZ, acceleration * step);
      this.moveWithCollision(this.velocity.x * step, this.velocity.z * step);
      remaining -= step;
    }
  }

  public resetInput(): void {
    this.clearKeyboardAndVelocity();
    this.clearPointerInputs();
  }

  public respawn(): void {
    if (this.disposed) {
      return;
    }

    this.resetInput();
    this.yaw = this.spawn.yaw;
    this.pitch = clamp(this.spawn.pitch, CONTROLS.pitchMin, CONTROLS.pitchMax);
    this.placeAtSpawn();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.releasePointerLockSilently();
    this.resetInput();
    this.removeEventListeners();

    this.canvas.style.touchAction = this.previousCanvasTouchAction;
    this.moveZone.style.touchAction = this.previousMoveTouchAction;
    this.lookZone.style.touchAction = this.previousLookTouchAction;
    this.moveZone.style.overscrollBehavior = this.previousMoveOverscrollBehavior;
    this.lookZone.style.overscrollBehavior = this.previousLookOverscrollBehavior;

    this.enabled = false;
    this.mode = null;
  }

  private placeAtSpawn(): void {
    this.camera.position.set(
      this.spawn.x,
      groundHeightAt(this.spawn.z) + CONTROLS.eyeHeight,
      this.spawn.z,
    );

    this.displacement.set(0, 0, 0);
    this.collision.resolveMove(
      this.camera.position,
      this.displacement,
      CONTROLS.radius,
      this.resolvedPosition,
    );
    this.camera.position.x = this.resolvedPosition.x;
    this.camera.position.z = this.resolvedPosition.z;
    this.camera.position.y = groundHeightAt(this.camera.position.z) + CONTROLS.eyeHeight;
    this.applyRotation();
  }

  private approachVelocity(targetX: number, targetZ: number, maximumChange: number): void {
    const deltaX = targetX - this.velocity.x;
    const deltaZ = targetZ - this.velocity.z;
    const deltaLength = Math.hypot(deltaX, deltaZ);

    if (deltaLength <= maximumChange || deltaLength <= COLLISION_EPSILON) {
      this.velocity.x = targetX;
      this.velocity.z = targetZ;
      return;
    }

    const scale = maximumChange / deltaLength;
    this.velocity.x += deltaX * scale;
    this.velocity.z += deltaZ * scale;
  }

  private moveWithCollision(deltaX: number, deltaZ: number): void {
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= COLLISION_EPSILON) {
      return;
    }

    const substeps = Math.max(1, Math.ceil(distance / MAX_COLLISION_STEP));
    const stepX = deltaX / substeps;
    const stepZ = deltaZ / substeps;

    for (let index = 0; index < substeps; index += 1) {
      const startX = this.camera.position.x;
      const startZ = this.camera.position.z;
      this.displacement.set(stepX, 0, stepZ);
      this.collision.resolveMove(
        this.camera.position,
        this.displacement,
        CONTROLS.radius,
        this.resolvedPosition,
      );

      this.camera.position.x = this.resolvedPosition.x;
      this.camera.position.z = this.resolvedPosition.z;
      this.camera.position.y =
        groundHeightAt(this.camera.position.z) + CONTROLS.eyeHeight;

      if (Math.abs(this.camera.position.x - startX - stepX) > COLLISION_EPSILON) {
        this.velocity.x = 0;
      }
      if (Math.abs(this.camera.position.z - startZ - stepZ) > COLLISION_EPSILON) {
        this.velocity.z = 0;
      }
    }
  }

  private applyLookDelta(deltaX: number, deltaY: number, sensitivity: number): void {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    this.yaw -= deltaX * sensitivity;
    this.pitch = clamp(
      this.pitch - deltaY * sensitivity,
      CONTROLS.pitchMin,
      CONTROLS.pitchMax,
    );
    this.applyRotation();
  }

  private applyRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private setMode(mode: FirstPersonControllerMode): void {
    if (this.mode === mode || this.disposed) {
      return;
    }

    this.mode = mode;
    this.onModeChange(mode);
  }

  private clearKeyboardAndVelocity(): void {
    this.pressedCodes.clear();
    this.velocity.set(0, 0, 0);
  }

  private focusCanvas(): void {
    try {
      this.canvas.focus({ preventScroll: true });
    } catch {
      this.canvas.focus();
    }
  }

  private clearPointerLockFallbackTimer(): void {
    if (this.pointerLockFallbackTimer === null) {
      return;
    }

    window.clearTimeout(this.pointerLockFallbackTimer);
    this.pointerLockFallbackTimer = null;
  }

  private completePointerLockSuccess(): void {
    this.clearPointerLockFallbackTimer();
    this.pointerLockPending = false;
    this.ownsPointerLock = true;
    this.enabled = true;
    this.clearPointerInputs();
    this.setMode('exploring');
  }

  private completePointerLockFailure(): void {
    this.clearPointerLockFallbackTimer();
    this.pointerLockPending = false;
    this.ownsPointerLock = false;
    this.enabled = true;
    this.setMode('drag');
  }

  private releasePointerLockSilently(): void {
    const shouldExit = document.pointerLockElement === this.canvas;
    this.clearPointerLockFallbackTimer();
    this.pointerLockPending = false;
    this.ownsPointerLock = false;

    if (shouldExit && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch {
        // The document may already be leaving pointer lock.
      }
    }
  }

  private clearPointerInputs(): void {
    this.clearDragInput();
    this.clearMoveInput();
    this.clearLookInput();
  }

  private clearDragInput(): void {
    const pointerId = this.dragPointerId;
    this.dragPointerId = null;
    this.dragLastX = 0;
    this.dragLastY = 0;

    if (pointerId !== null) {
      this.releasePointerCapture(this.canvas, pointerId);
    }
  }

  private clearMoveInput(): void {
    const pointerId = this.movePointerId;
    const joystickWasActive =
      pointerId !== null || this.joystickX !== 0 || this.joystickY !== 0;
    this.movePointerId = null;
    this.moveOriginX = 0;
    this.moveOriginY = 0;
    this.moveRadius = JOYSTICK_MIN_RADIUS;
    this.joystickX = 0;
    this.joystickY = 0;

    if (pointerId !== null) {
      this.releasePointerCapture(this.moveZone, pointerId);
    }
    if (joystickWasActive) {
      this.onJoystick(0, 0, false);
    }
  }

  private clearLookInput(): void {
    const pointerId = this.lookPointerId;
    this.lookPointerId = null;
    this.lookLastX = 0;
    this.lookLastY = 0;

    if (pointerId !== null) {
      this.releasePointerCapture(this.lookZone, pointerId);
    }
  }

  private releasePointerCapture(element: HTMLElement, pointerId: number): void {
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // The browser may have already released capture during cancellation or teardown.
    }
  }

  private capturePointer(element: HTMLElement, pointerId: number): void {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Capture can fail if the pointer ended between pointerdown and this call.
    }
  }

  private installEventListeners(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleLockedMouseMove);

    this.canvas.addEventListener(
      'pointerdown',
      this.handleCanvasPointerDown,
      NON_PASSIVE_LISTENER,
    );
    this.canvas.addEventListener(
      'pointermove',
      this.handleCanvasPointerMove,
      NON_PASSIVE_LISTENER,
    );
    this.canvas.addEventListener('pointerup', this.handleCanvasPointerEnd, NON_PASSIVE_LISTENER);
    this.canvas.addEventListener(
      'pointercancel',
      this.handleCanvasPointerEnd,
      NON_PASSIVE_LISTENER,
    );
    this.canvas.addEventListener('lostpointercapture', this.handleCanvasLostPointerCapture);

    this.moveZone.addEventListener(
      'pointerdown',
      this.handleMovePointerDown,
      NON_PASSIVE_LISTENER,
    );
    this.moveZone.addEventListener(
      'pointermove',
      this.handleMovePointerMove,
      NON_PASSIVE_LISTENER,
    );
    this.moveZone.addEventListener('pointerup', this.handleMovePointerEnd, NON_PASSIVE_LISTENER);
    this.moveZone.addEventListener(
      'pointercancel',
      this.handleMovePointerEnd,
      NON_PASSIVE_LISTENER,
    );
    this.moveZone.addEventListener('lostpointercapture', this.handleMoveLostPointerCapture);

    this.lookZone.addEventListener(
      'pointerdown',
      this.handleLookPointerDown,
      NON_PASSIVE_LISTENER,
    );
    this.lookZone.addEventListener(
      'pointermove',
      this.handleLookPointerMove,
      NON_PASSIVE_LISTENER,
    );
    this.lookZone.addEventListener('pointerup', this.handleLookPointerEnd, NON_PASSIVE_LISTENER);
    this.lookZone.addEventListener(
      'pointercancel',
      this.handleLookPointerEnd,
      NON_PASSIVE_LISTENER,
    );
    this.lookZone.addEventListener('lostpointercapture', this.handleLookLostPointerCapture);
  }

  private removeEventListeners(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('mousemove', this.handleLockedMouseMove);

    this.canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.removeEventListener('pointerup', this.handleCanvasPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.handleCanvasPointerEnd);
    this.canvas.removeEventListener('lostpointercapture', this.handleCanvasLostPointerCapture);

    this.moveZone.removeEventListener('pointerdown', this.handleMovePointerDown);
    this.moveZone.removeEventListener('pointermove', this.handleMovePointerMove);
    this.moveZone.removeEventListener('pointerup', this.handleMovePointerEnd);
    this.moveZone.removeEventListener('pointercancel', this.handleMovePointerEnd);
    this.moveZone.removeEventListener('lostpointercapture', this.handleMoveLostPointerCapture);

    this.lookZone.removeEventListener('pointerdown', this.handleLookPointerDown);
    this.lookZone.removeEventListener('pointermove', this.handleLookPointerMove);
    this.lookZone.removeEventListener('pointerup', this.handleLookPointerEnd);
    this.lookZone.removeEventListener('pointercancel', this.handleLookPointerEnd);
    this.lookZone.removeEventListener('lostpointercapture', this.handleLookLostPointerCapture);
  }

  private readonly handlePointerLockFallback = (): void => {
    this.pointerLockFallbackTimer = null;
    if (this.disposed || !this.pointerLockPending) {
      return;
    }

    if (document.pointerLockElement === this.canvas) {
      this.completePointerLockSuccess();
    } else {
      this.completePointerLockFailure();
    }
  };

  private readonly handlePointerLockRequestFailure = (): void => {
    if (this.disposed || !this.pointerLockPending) {
      return;
    }

    if (document.pointerLockElement === this.canvas) {
      this.completePointerLockSuccess();
    } else {
      this.completePointerLockFailure();
    }
  };

  private readonly handlePointerLockChange = (): void => {
    if (this.disposed) {
      return;
    }

    if (document.pointerLockElement === this.canvas) {
      if (!this.pointerLockPending && !this.ownsPointerLock) {
        this.releasePointerLockSilently();
        return;
      }

      this.completePointerLockSuccess();
      return;
    }

    if (this.ownsPointerLock) {
      this.clearPointerLockFallbackTimer();
      this.ownsPointerLock = false;
      this.pointerLockPending = false;
      this.enabled = false;
      this.resetInput();
      this.setMode('paused');
    } else if (this.pointerLockPending) {
      this.completePointerLockFailure();
    }
  };

  private readonly handlePointerLockError = (): void => {
    if (this.disposed || !this.pointerLockPending) {
      return;
    }

    if (document.pointerLockElement === this.canvas) {
      this.completePointerLockSuccess();
    } else {
      this.completePointerLockFailure();
    }
  };

  private readonly handleLockedMouseMove = (event: MouseEvent): void => {
    if (this.disposed || !this.enabled || !this.ownsPointerLock) {
      return;
    }

    this.applyLookDelta(event.movementX, event.movementY, CONTROLS.pointerSensitivity);
    if (event.movementX !== 0 || event.movementY !== 0) {
      this.onInput('MouseMove');
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      this.disposed ||
      !this.enabled ||
      !isMovementCode(event.code) ||
      isEditableTarget(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (event.repeat && !this.pressedCodes.has(event.code)) {
      return;
    }

    if (!this.pressedCodes.has(event.code)) {
      this.pressedCodes.add(event.code);
      this.onInput(event.code);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!isMovementCode(event.code)) {
      return;
    }

    if (this.enabled && !isEditableTarget(event.target)) {
      event.preventDefault();
    }
    this.pressedCodes.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.resetInput();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      this.resetInput();
    }
  };

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    if (
      this.disposed ||
      !this.enabled ||
      this.pointerLockPending ||
      this.ownsPointerLock ||
      this.dragPointerId !== null ||
      event.pointerType === 'touch' ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    this.dragPointerId = event.pointerId;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    this.capturePointer(this.canvas, event.pointerId);
    this.setMode('drag');
    this.onInput('MouseDrag');
  };

  private readonly handleCanvasPointerMove = (event: PointerEvent): void => {
    if (
      this.disposed ||
      this.ownsPointerLock ||
      event.pointerId !== this.dragPointerId
    ) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - this.dragLastX;
    const deltaY = event.clientY - this.dragLastY;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    this.applyLookDelta(deltaX, deltaY, CONTROLS.dragSensitivity);
    if (deltaX !== 0 || deltaY !== 0) {
      this.onInput('MouseDrag');
    }
  };

  private readonly handleCanvasPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) {
      return;
    }

    event.preventDefault();
    this.clearDragInput();
  };

  private readonly handleCanvasLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) {
      return;
    }

    this.clearDragInput();
  };

  private readonly handleMovePointerDown = (event: PointerEvent): void => {
    if (
      this.disposed ||
      !this.enabled ||
      this.pointerLockPending ||
      this.ownsPointerLock ||
      event.pointerType === 'mouse' ||
      this.movePointerId !== null
    ) {
      return;
    }

    event.preventDefault();
    this.movePointerId = event.pointerId;
    this.moveOriginX = event.clientX;
    this.moveOriginY = event.clientY;

    const bounds = this.moveZone.getBoundingClientRect();
    const availableRadius = Math.min(bounds.width, bounds.height) * JOYSTICK_RADIUS_FACTOR;
    this.moveRadius = clamp(
      availableRadius || JOYSTICK_MIN_RADIUS,
      JOYSTICK_MIN_RADIUS,
      JOYSTICK_MAX_RADIUS,
    );

    this.joystickX = 0;
    this.joystickY = 0;
    this.capturePointer(this.moveZone, event.pointerId);
    this.onJoystick(0, 0, true);
    this.setMode('touch');
    this.onInput('TouchMove');
  };

  private readonly handleMovePointerMove = (event: PointerEvent): void => {
    if (this.disposed || event.pointerId !== this.movePointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - this.moveOriginX;
    const deltaY = event.clientY - this.moveOriginY;
    const distance = Math.hypot(deltaX, deltaY);
    const normalizedDistance = Math.min(distance / this.moveRadius, 1);

    if (distance <= COLLISION_EPSILON || normalizedDistance <= JOYSTICK_DEAD_ZONE) {
      this.joystickX = 0;
      this.joystickY = 0;
    } else {
      const magnitude =
        (normalizedDistance - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
      const directionScale = magnitude / distance;
      this.joystickX = deltaX * directionScale;
      this.joystickY = deltaY * directionScale;
    }

    this.onJoystick(this.joystickX, this.joystickY, true);
    this.onInput('TouchMove');
  };

  private readonly handleMovePointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointerId) {
      return;
    }

    event.preventDefault();
    this.clearMoveInput();
  };

  private readonly handleMoveLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointerId) {
      return;
    }

    this.clearMoveInput();
  };

  private readonly handleLookPointerDown = (event: PointerEvent): void => {
    if (
      this.disposed ||
      !this.enabled ||
      this.pointerLockPending ||
      this.ownsPointerLock ||
      event.pointerType === 'mouse' ||
      this.lookPointerId !== null
    ) {
      return;
    }

    event.preventDefault();
    this.lookPointerId = event.pointerId;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
    this.capturePointer(this.lookZone, event.pointerId);
    this.setMode('touch');
    this.onInput('TouchLook');
  };

  private readonly handleLookPointerMove = (event: PointerEvent): void => {
    if (this.disposed || event.pointerId !== this.lookPointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - this.lookLastX;
    const deltaY = event.clientY - this.lookLastY;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
    this.applyLookDelta(deltaX, deltaY, CONTROLS.touchLookSensitivity);
    if (deltaX !== 0 || deltaY !== 0) {
      this.onInput('TouchLook');
    }
  };

  private readonly handleLookPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) {
      return;
    }

    event.preventDefault();
    this.clearLookInput();
  };

  private readonly handleLookLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) {
      return;
    }

    this.clearLookInput();
  };
}
