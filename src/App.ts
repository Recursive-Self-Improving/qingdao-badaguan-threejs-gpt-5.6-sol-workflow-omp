import {
  AgXToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Timer,
  WebGLRenderer,
} from 'three';
import {
  CAMERA,
  CONTROLS,
  selectQualityProfile,
  type QualityProfile,
} from './config';
import { FirstPersonController } from './controls/FirstPersonController';
import { CollisionWorld } from './physics/CollisionWorld';
import { ControlsOverlay, type ControlMode } from './ui/ControlsOverlay';
import { createWorld, type World } from './world/createWorld';
import { createWorldLayout } from './world/layout';

export interface AppElements {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: ControlsOverlay;
}

const MAX_FRAME_DELTA = 0.05;
const TONE_MAPPING_EXPOSURE = 0.95;

type ActiveControlMode = Extract<ControlMode, 'exploring' | 'drag' | 'touch'>;

function isActiveControlMode(mode: ControlMode): mode is ActiveControlMode {
  return mode === 'exploring' || mode === 'drag' || mode === 'touch';
}

const UNEXPECTED_RENDERING_MESSAGE = '风景遇到意外的渲染错误。';

export class App {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: ControlsOverlay;
  private readonly seed: number | undefined;
  private readonly document: Document;
  private readonly helpPanel: HTMLElement;
  private readonly pausePrompt: HTMLButtonElement;
  private readonly window: Window;
  private readonly events = new AbortController();
  private readonly coarsePointerQuery: MediaQueryList;
  private readonly reducedMotionQuery: MediaQueryList;

  private renderer: WebGLRenderer | null = null;
  private camera: PerspectiveCamera | null = null;
  private quality: QualityProfile | null = null;
  private world: World | null = null;
  private collision: CollisionWorld | null = null;
  private controller: FirstPersonController | null = null;
  private timer: Timer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private initPromise: Promise<void> | null = null;
  private frameRequest: number | null = null;

  private mode: ControlMode = 'loading';
  private modeBeforePause: ActiveControlMode = 'drag';
  private modeBeforeHelp: ControlMode = 'ready';
  private modeBeforeContextLoss: ControlMode = 'ready';
  private initialized = false;
  private disposed = false;
  private runRequested = false;
  private contextLost = false;
  private pendingResize = true;
  private helpOpen = false;
  private stillViewing = false;
  private userMotionPaused = false;
  private motionElapsed = 0;
  private lastStartPointerType: string | null = null;
  private focusBeforeHelp: HTMLElement | null = null;

  public constructor(
    { root, canvas, overlay }: AppElements,
    seed?: number,
  ) {
    this.root = root;
    this.canvas = canvas;
    this.overlay = overlay;
    this.seed = seed;
    this.document = canvas.ownerDocument;

    const helpPanel = this.document.getElementById('help-panel');
    const pausePrompt = this.document.getElementById('pause-prompt');
    if (!(helpPanel instanceof HTMLElement)) {
      throw new Error('缺少操作与设置面板。');
    }
    if (!(pausePrompt instanceof HTMLButtonElement)) {
      throw new Error('缺少继续漫步按钮。');
    }
    this.helpPanel = helpPanel;
    this.pausePrompt = pausePrompt;

    const view = this.document.defaultView;
    if (view === null) {
      throw new Error('三维画布尚未连接到浏览器窗口。');
    }

    this.window = view;
    this.coarsePointerQuery = view.matchMedia('(pointer: coarse)');
    this.reducedMotionQuery = view.matchMedia('(prefers-reduced-motion: reduce)');
  }

  public init(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('无法初始化已释放的景观应用。'));
    }

    this.initPromise ??= this.initialize();
    return this.initPromise;
  }

  public start(): void {
    if (this.disposed) return;
    if (!this.initialized) {
      throw new Error('必须先完成景观初始化，再启动应用。');
    }

    if (this.runRequested) return;
    this.runRequested = true;
    this.timer?.reset();
    this.requestFrame();
  }

  public stop(): void {
    this.runRequested = false;

    if (this.frameRequest !== null) {
      this.window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }

    this.controller?.resetInput();
  }

  public dispose(): void {
    if (this.disposed) return;

    this.stop();
    this.disposed = true;
    this.events.abort();
    this.reducedMotionQuery.removeEventListener(
      'change',
      this.handleReducedMotionChange,
    );
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.timer?.dispose();
    this.timer = null;
    this.controller?.dispose();
    this.controller = null;
    this.collision = null;
    this.setHelpPanelOpen(false, false);
    this.overlay.dispose();
    this.world?.dispose();
    this.world = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.camera = null;
    this.quality = null;
  }

  private async initialize(): Promise<void> {
    try {
      this.setHelpPanelOpen(false, false);
      this.setMode('loading');
      this.overlay.setProgress(0, '正在准备景观视角');

      const quality = selectQualityProfile(this.coarsePointerQuery.matches);
      const renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: quality.antialias,
        powerPreference:
          quality.name === 'coarse' ? 'default' : 'high-performance',
      });
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = AgXToneMapping;
      renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFShadowMap;

      const camera = new PerspectiveCamera(
        CAMERA.fov,
        1,
        CAMERA.near,
        CAMERA.far,
      );
      camera.rotation.order = 'YXZ';

      this.quality = quality;
      this.renderer = renderer;
      this.camera = camera;
      this.applyResize(true);
      this.installListeners();

      this.overlay.setProgress(0.18, '正在铺展花园道路');
      const layout = createWorldLayout(this.seed);
      camera.position.set(
        layout.spawn.x,
        layout.spawn.y,
        layout.spawn.z,
      );
      camera.rotation.set(
        layout.spawn.pitch,
        layout.spawn.yaw,
        0,
        'YXZ',
      );
      camera.updateMatrixWorld();

      const collision = new CollisionWorld(layout.bounds, layout.colliders);
      if (!collision.isFree(layout.spawn, CONTROLS.radius)) {
        throw new Error('初始视角受到阻挡。');
      }
      this.collision = collision;

      this.overlay.setProgress(0.42, '正在生成八大关树冠');
      const world = createWorld(renderer, layout, quality);
      this.world = world;

      const controller = new FirstPersonController({
        camera,
        canvas: this.canvas,
        collision,
        moveZone: this.overlay.elements.moveZone,
        lookZone: this.overlay.elements.lookZone,
        spawn: layout.spawn,
        onModeChange: this.handleControllerModeChange,
        onInput: (code) => {
          this.overlay.flashControl(code);
          if (this.stillViewing) this.requestFrame();
        },
        onJoystick: (x, y, active) =>
          this.overlay.setJoystick(x, y, active),
      });
      this.controller = controller;
      controller.respawn();

      const timer = new Timer();
      timer.connect(this.document);
      timer.reset();
      this.timer = timer;

      this.overlay.setProgress(0.78, '正在点亮午后光影');
      await renderer.compileAsync(world.scene, camera);
      if (this.disposed) return;

      world.invalidateShadow();
      world.update(
        0,
        this.motionElapsed,
        camera.position,
        this.isAmbientMotionReduced(),
      );
      if (!this.contextLost) renderer.render(world.scene, camera);

      this.initialized = true;
      this.overlay.setProgress(1, '八大关景观已就绪');
      this.setMode(
        this.contextLost ? 'paused' : 'ready',
        this.contextLost
          ? '显示环境恢复期间，三维景观已暂停。'
          : undefined,
      );
    } catch (error) {
      if (!this.disposed) this.setMode('fatal', UNEXPECTED_RENDERING_MESSAGE);
      console.error('八大关景观初始化失败：', error);
      throw new Error(UNEXPECTED_RENDERING_MESSAGE);
    }
  }

  private installListeners(): void {
    const signal = this.events.signal;
    const elements = this.overlay.elements;

    elements.startButton.addEventListener(
      'pointerdown',
      this.handleStartPointerDown,
      { signal },
    );
    elements.startButton.addEventListener(
      'click',
      this.handleStartButton,
      { signal },
    );
    this.pausePrompt.addEventListener('click', this.handleResumeButton, {
      signal,
    });
    elements.stillButton.addEventListener(
      'click',
      this.handleStillButton,
      { signal },
    );
    elements.helpButton.addEventListener(
      'click',
      this.handleHelpButton,
      { signal },
    );
    elements.closeHelpButton.addEventListener(
      'click',
      this.handleCloseHelpButton,
      { signal },
    );
    elements.homeButton.addEventListener(
      'click',
      this.handleHomeButton,
      { signal },
    );
    elements.motionButton.addEventListener(
      'click',
      this.handleMotionButton,
      { signal },
    );

    this.canvas.addEventListener(
      'webglcontextlost',
      this.handleContextLost,
      { signal },
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
      { signal },
    );
    this.window.addEventListener('resize', this.handleResize, { signal });
    this.window.addEventListener('keydown', this.handleKeyDown, {
      capture: true,
      signal,
    });
    this.document.addEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
      { signal },
    );
    this.reducedMotionQuery.addEventListener(
      'change',
      this.handleReducedMotionChange,
    );

    if ('ResizeObserver' in this.window) {
      this.resizeObserver = new ResizeObserver(() => {
        this.pendingResize = true;
        this.requestFrame();
      });
      this.resizeObserver.observe(this.root);
    }

    this.updateMotionButton();
  }

  private readonly handleStartPointerDown = (event: PointerEvent): void => {
    this.lastStartPointerType = event.isPrimary ? event.pointerType : null;
  };

  private readonly handleStartButton = (event: MouseEvent): void => {
    const pointerType = event.detail === 0 ? null : this.lastStartPointerType;
    this.lastStartPointerType = null;

    if (
      this.disposed ||
      !this.initialized ||
      this.contextLost ||
      this.controller === null
    ) {
      return;
    }

    if (this.helpOpen) this.setHelpPanelOpen(false, false);
    this.stillViewing = false;
    this.updateMotionButton();
    this.timer?.reset();

    const useTouch =
      pointerType === 'touch' ||
      (pointerType !== null && this.coarsePointerQuery.matches);
    this.activateMode(useTouch ? 'touch' : 'exploring');
    this.requestFrame();
  };

  private readonly handleResumeButton = (): void => {
    if (
      this.disposed ||
      !this.initialized ||
      this.helpOpen ||
      this.contextLost ||
      this.mode !== 'paused' ||
      this.controller === null
    ) {
      return;
    }

    this.stillViewing = false;
    this.updateMotionButton();
    this.timer?.reset();
    this.activateMode(this.modeBeforePause);
    this.requestFrame();
  };

  private readonly handleStillButton = (): void => {
    if (this.disposed || !this.initialized || this.controller === null) return;

    if (this.helpOpen) this.setHelpPanelOpen(false, false);
    this.stillViewing = true;
    this.controller.suspend();
    this.updateMotionButton();
    this.timer?.reset();
    this.setMode('still', '已进入静观模式，环境动态已暂停。');
    this.focusScene();
    this.requestFrame();
  };

  private readonly handleHelpButton = (): void => {
    if (
      this.disposed ||
      !this.initialized ||
      this.helpOpen ||
      this.controller === null
    ) {
      return;
    }

    this.modeBeforeHelp = this.mode;
    if (isActiveControlMode(this.mode)) {
      this.modeBeforePause = this.mode;
    }
    const activeElement = this.document.activeElement;
    this.focusBeforeHelp =
      activeElement instanceof HTMLElement &&
      activeElement !== this.document.body &&
      activeElement !== this.document.documentElement
        ? activeElement
        : this.overlay.elements.helpButton;

    this.controller.suspend();
    this.setHelpPanelOpen(true, false);
    this.setMode('paused', '已打开操作与设置，漫步已暂停。');
    this.timer?.reset();
    this.requestFrame();
  };

  private readonly handleCloseHelpButton = (): void => {
    this.closeHelpFromGesture();
  };

  private readonly handleHomeButton = (): void => {
    if (this.disposed || !this.initialized || this.controller === null) return;

    this.controller.resetInput();
    this.controller.respawn();
    this.requestFrame();
  };

  private readonly handleMotionButton = (): void => {
    if (
      this.disposed ||
      !this.initialized ||
      this.reducedMotionQuery.matches
    ) {
      return;
    }

    this.userMotionPaused = !this.userMotionPaused;
    this.updateMotionButton();
    this.timer?.reset();
    this.requestFrame();
  };

  private readonly handleControllerModeChange = (
    mode: ControlMode,
  ): void => {
    if (
      this.disposed ||
      !this.initialized ||
      this.helpOpen ||
      this.contextLost ||
      this.stillViewing
    ) {
      return;
    }

    if (mode === 'paused') {
      const previousMode = isActiveControlMode(this.mode)
        ? this.mode
        : this.modeBeforePause;
      this.enterPaused(previousMode);
      return;
    }

    if (!isActiveControlMode(mode)) {
      return;
    }

    this.modeBeforePause = mode;
    this.setMode(mode);
    this.focusScene();
    this.timer?.reset();
    this.requestFrame();
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed || this.contextLost) return;

    this.contextLost = true;
    this.modeBeforeContextLoss = this.mode;
    if (isActiveControlMode(this.mode)) {
      this.modeBeforePause = this.mode;
    }
    this.controller?.suspend();

    if (this.frameRequest !== null) {
      this.window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }

    if (!this.stillViewing && !this.helpOpen) {
      this.setMode('paused', '显示环境恢复期间，三维景观已暂停。');
      this.focusPausePrompt();
    }
  };

  private readonly handleContextRestored = (): void => {
    if (this.disposed) return;

    this.contextLost = false;
    this.pendingResize = true;
    this.timer?.reset();
    this.world?.invalidateShadow();

    if (!this.helpOpen && !this.stillViewing) {
      if (this.modeBeforeContextLoss === 'ready') {
        this.setMode('ready');
        this.overlay.elements.startButton.focus({ preventScroll: true });
      } else {
        if (isActiveControlMode(this.modeBeforeContextLoss)) {
          this.modeBeforePause = this.modeBeforeContextLoss;
        }
        this.setMode('paused', '显示环境已恢复。点击，或按回车键或空格键继续漫步。');
        this.focusPausePrompt();
      }
    }

    this.requestFrame();
  };

  private readonly handleResize = (): void => {
    this.pendingResize = true;
    this.requestFrame();
  };

  private readonly handleReducedMotionChange = (): void => {
    if (this.disposed) return;

    this.updateMotionButton();
    this.timer?.reset();
    this.requestFrame();
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) return;

    if (this.document.visibilityState !== 'visible') {
      this.controller?.resetInput();
      if (this.frameRequest !== null) {
        this.window.cancelAnimationFrame(this.frameRequest);
        this.frameRequest = null;
      }
      return;
    }

    this.pendingResize = true;
    this.timer?.reset();
    if (this.mode === 'paused' && !this.helpOpen) {
      this.focusPausePrompt();
    }
    this.requestFrame();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.helpOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closeHelpFromGesture();
      } else if (event.key === 'Tab') {
        this.trapHelpFocus(event);
      }
      return;
    }

    if (event.key === 'Escape' && isActiveControlMode(this.mode)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.enterPaused(this.mode);
    }
  };

  private closeHelpFromGesture(): void {
    if (this.disposed || !this.helpOpen || this.controller === null) return;

    const previousMode = this.modeBeforeHelp;
    const focusTarget = this.focusBeforeHelp;
    this.focusBeforeHelp = null;
    this.setHelpPanelOpen(false, false);

    if (this.contextLost) {
      this.setMode('paused', '显示环境恢复期间，三维景观已暂停。');
      this.focusPausePrompt();
    } else if (isActiveControlMode(previousMode)) {
      this.stillViewing = false;
      this.modeBeforePause = previousMode;
      this.updateMotionButton();
      this.timer?.reset();
      this.activateMode(previousMode);
      this.requestFrame();
      return;
    } else {
      this.stillViewing = previousMode === 'still';
      this.updateMotionButton();
      this.setMode(previousMode);
      this.restoreLogicalFocus(focusTarget);
    }

    this.timer?.reset();
    this.requestFrame();
  }

  private setHelpPanelOpen(open: boolean, restoreFocus: boolean): void {
    this.helpOpen = open;
    this.overlay.setHelpOpen(open);

    if (open) {
      this.overlay.elements.closeHelpButton.focus({ preventScroll: true });
    } else if (restoreFocus) {
      this.restoreLogicalFocus(this.focusBeforeHelp);
    }
  }

  private activateMode(mode: ActiveControlMode): void {
    const controller = this.controller;
    if (controller === null) return;

    if (mode === 'touch') {
      controller.activateTouch();
    } else if (mode === 'drag') {
      controller.activateDrag();
    } else {
      controller.activateFromGesture();
    }
  }

  private enterPaused(previousMode: ActiveControlMode): void {
    this.modeBeforePause = previousMode;
    this.controller?.suspend();
    this.setMode('paused');
    this.timer?.reset();
    this.focusPausePrompt();
    this.requestFrame();
  }

  private trapHelpFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.helpPanel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.closest('[hidden], [inert]') === null);

    if (focusable.length === 0) {
      event.preventDefault();
      this.helpPanel.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = this.document.activeElement;
    const focusIsOutside =
      activeElement === null || !this.helpPanel.contains(activeElement);

    event.stopPropagation();
    if (event.shiftKey && (activeElement === first || focusIsOutside)) {
      event.preventDefault();
      last?.focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeElement === last || focusIsOutside)) {
      event.preventDefault();
      first?.focus({ preventScroll: true });
    }
  }

  private restoreLogicalFocus(target: HTMLElement | null): void {
    const targetUnavailable =
      target === null ||
      !target.isConnected ||
      target.closest('[hidden], [inert]') !== null ||
      (target instanceof HTMLButtonElement && target.disabled);

    if (!targetUnavailable) {
      target.focus({ preventScroll: true });
    } else if (this.mode === 'paused') {
      this.focusPausePrompt();
    } else if (this.mode === 'ready') {
      this.overlay.elements.startButton.focus({ preventScroll: true });
    } else {
      this.focusScene();
    }
  }

  private focusPausePrompt(): void {
    if (!this.pausePrompt.hidden && !this.pausePrompt.disabled) {
      this.pausePrompt.focus({ preventScroll: true });
    }
  }

  private focusScene(): void {
    this.canvas.focus({ preventScroll: true });
  }

  private readonly frame = (timestamp: number): void => {
    this.frameRequest = null;
    if (
      this.disposed ||
      !this.runRequested ||
      this.contextLost ||
      this.document.visibilityState !== 'visible' ||
      this.renderer === null ||
      this.camera === null ||
      this.world === null ||
      this.timer === null
    ) {
      return;
    }

    try {
      this.timer.update(timestamp);
      const delta = Math.min(
        Math.max(this.timer.getDelta(), 0),
        MAX_FRAME_DELTA,
      );

      if (this.pendingResize) this.applyResize(false);
      if (
        this.controller !== null &&
        !this.helpOpen &&
        !this.stillViewing &&
        isActiveControlMode(this.mode)
      ) {
        this.controller.update(delta);
      }

      const reducedMotion = this.isAmbientMotionReduced();
      if (!reducedMotion) this.motionElapsed += delta;
      this.world.update(
        reducedMotion ? 0 : delta,
        this.motionElapsed,
        this.camera.position,
        reducedMotion,
      );
      this.renderer.render(this.world.scene, this.camera);
    } catch (error) {
      this.failDuringFrame(error);
      return;
    }

    if (this.shouldRenderContinuously()) {
      this.requestFrame();
    }
  };

  private applyResize(force: boolean): void {
    const renderer = this.renderer;
    const camera = this.camera;
    const quality = this.quality;
    if (renderer === null || camera === null || quality === null) return;

    this.pendingResize = false;
    const bounds = this.root.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.round(bounds.width || this.canvas.clientWidth || this.window.innerWidth),
    );
    const height = Math.max(
      1,
      Math.round(
        bounds.height || this.canvas.clientHeight || this.window.innerHeight,
      ),
    );
    const pixelRatio = this.effectivePixelRatio(width, height, quality);
    const drawingWidth = Math.floor(width * pixelRatio);
    const drawingHeight = Math.floor(height * pixelRatio);
    const aspect = width / height;

    if (
      force ||
      this.canvas.width !== drawingWidth ||
      this.canvas.height !== drawingHeight
    ) {
      renderer.setDrawingBufferSize(width, height, pixelRatio);
    }

    if (force || camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }

  private effectivePixelRatio(
    width: number,
    height: number,
    quality: QualityProfile,
  ): number {
    const deviceRatio = this.window.devicePixelRatio || 1;
    const pixelBudgetRatio = Math.sqrt(
      quality.maxDrawingBufferPixels / (width * height),
    );
    const ratio = Math.min(deviceRatio, quality.dprCap, pixelBudgetRatio);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }

  private isAmbientMotionReduced(): boolean {
    return (
      this.stillViewing ||
      this.userMotionPaused ||
      this.reducedMotionQuery.matches
    );
  }

  private updateMotionButton(): void {
    const state = this.stillViewing
      ? 'still'
      : this.reducedMotionQuery.matches
        ? 'system'
        : this.userMotionPaused
          ? 'manual'
          : 'normal';
    this.overlay.setMotionReduction(state);
  }

  private setMode(mode: ControlMode, message?: string): void {
    this.mode = mode;
    this.overlay.setMode(mode, message);
    this.requestFrame();
  }

  private shouldRenderContinuously(): boolean {
    return (
      this.document.visibilityState === 'visible' &&
      !this.helpOpen &&
      !this.stillViewing &&
      isActiveControlMode(this.mode)
    );
  }

  private requestFrame(): void {
    if (
      this.disposed ||
      !this.runRequested ||
      this.contextLost ||
      this.document.visibilityState !== 'visible' ||
      this.frameRequest !== null
    ) {
      return;
    }

    this.frameRequest = this.window.requestAnimationFrame(this.frame);
  }

  private failDuringFrame(error: unknown): void {
    this.controller?.suspend();
    this.stop();
    this.mode = 'fatal';
    this.overlay.setMode('fatal', UNEXPECTED_RENDERING_MESSAGE);
    console.error('八大关景观渲染循环已停止：', error);
  }
}
