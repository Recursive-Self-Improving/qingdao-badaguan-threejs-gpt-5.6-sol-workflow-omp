export type ControlMode =
  | 'loading'
  | 'ready'
  | 'exploring'
  | 'paused'
  | 'drag'
  | 'touch'
  | 'still'
  | 'fatal';

export interface ControlsOverlayElements {
  startButton: HTMLButtonElement;
  stillButton: HTMLButtonElement;
  helpButton: HTMLButtonElement;
  closeHelpButton: HTMLButtonElement;
  homeButton: HTMLButtonElement;
  motionButton: HTMLButtonElement;
  moveZone: HTMLElement;
  lookZone: HTMLElement;
}

type HTMLElementConstructor<T extends HTMLElement> = new () => T;

type ModePresentation = Readonly<{
  label: string;
  announcement: string;
}>;

export type MotionReductionState = 'normal' | 'manual' | 'system' | 'still';

const MODE_PRESENTATION: Readonly<Record<ControlMode, ModePresentation>> = {
  loading: {
    label: '载入中',
    announcement: '正在载入八大关景观',
  },
  ready: {
    label: '已就绪',
    announcement: '景观已就绪，可以开始漫步',
  },
  exploring: {
    label: '指针漫步',
    announcement: '已进入漫步模式',
  },
  paused: {
    label: '漫步暂停',
    announcement: '漫步已暂停，点击或按回车键或空格键继续',
  },
  drag: {
    label: '拖动环顾',
    announcement: '已切换为拖动视角模式',
  },
  touch: {
    label: '触控漫步',
    announcement: '已进入触控漫步模式',
  },
  still: {
    label: '静观风景',
    announcement: '已进入静观模式',
  },
  fatal: {
    label: '无法载入',
    announcement: '三维景观无法载入',
  },
};

const CONTROL_ALIASES: Readonly<Record<string, string>> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Escape: 'pause',
  MouseMove: 'look',
  MouseDrag: 'look',
  PointerMove: 'look',
  Drag: 'look',
  TouchLook: 'look',
  TouchMove: 'move',
};

const HUD_VISIBLE_BY_MODE: Readonly<Record<ControlMode, boolean>> = {
  loading: false,
  ready: false,
  exploring: true,
  paused: true,
  drag: true,
  touch: true,
  still: true,
  fatal: false,
};

const ENTRY_VISIBLE_BY_MODE: Readonly<Record<ControlMode, boolean>> = {
  loading: true,
  ready: true,
  exploring: false,
  paused: false,
  drag: false,
  touch: false,
  still: false,
  fatal: false,
};
const CONTROL_FLASH_DURATION_MS = 420;
const JOYSTICK_TRAVEL_PX = 34;

function requireUniqueElement<T extends HTMLElement>(
  root: ParentNode,
  id: string,
  Constructor: HTMLElementConstructor<T>,
): T {
  const matches = root.querySelectorAll(`#${id}`);

  if (matches.length !== 1) {
    throw new Error(`应当且只能找到一个 #${id} 元素，实际找到 ${matches.length} 个。`);
  }

  const element = matches.item(0);
  if (!(element instanceof Constructor)) {
    throw new Error(`#${id} 元素类型不正确。`);
  }

  return element;
}

function resolveAppRoot(scope: ParentNode): HTMLElement {
  if (scope instanceof HTMLElement && scope.id === 'app') {
    return scope;
  }

  return requireUniqueElement(scope, 'app', HTMLElement);
}

function isControlMode(value: string | undefined): value is ControlMode {
  return value !== undefined && value in MODE_PRESENTATION;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(-1, value));
}

function setRegionVisible(element: HTMLElement, visible: boolean): void {
  element.hidden = !visible;
  element.inert = !visible;
  element.setAttribute('aria-hidden', String(!visible));
}

export class ControlsOverlay {
  readonly elements: Readonly<ControlsOverlayElements>;

  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly skipLink: HTMLAnchorElement;
  private readonly entry: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly progressCopy: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly pausePrompt: HTMLButtonElement;
  private readonly pauseMessage: HTMLElement;
  private readonly modeCopy: HTMLElement;
  private readonly moveStick: HTMLElement;
  private readonly fatalPanel: HTMLElement;
  private readonly helpPanel: HTMLElement;
  private readonly fatalCopy: HTMLElement;
  private readonly liveStatus: HTMLElement;
  private readonly controlGlyphs: HTMLElement[];
  private readonly flashTimers = new Map<HTMLElement, number>();

  private progress = 0;
  private currentMode: ControlMode | null = null;
  private currentAnnouncement = '';
  private helpOpen = false;
  private motionReductionState: MotionReductionState | null = null;
  private disposed = false;

  constructor(scope: ParentNode = document) {
    this.root = resolveAppRoot(scope);
    this.canvas = requireUniqueElement(this.root, 'scene', HTMLCanvasElement);
    this.skipLink = requireUniqueElement(this.root, 'skip-link', HTMLAnchorElement);
    this.entry = requireUniqueElement(this.root, 'entry', HTMLElement);
    this.progressBar = requireUniqueElement(this.root, 'progress-bar', HTMLElement);
    this.progressCopy = requireUniqueElement(this.root, 'progress-copy', HTMLElement);
    this.hud = requireUniqueElement(this.root, 'hud', HTMLElement);
    requireUniqueElement(this.hud, 'control-strip', HTMLElement);
    this.helpPanel = requireUniqueElement(this.root, 'help-panel', HTMLElement);
    this.pausePrompt = requireUniqueElement(this.root, 'pause-prompt', HTMLButtonElement);
    this.pauseMessage = requireUniqueElement(this.pausePrompt, 'pause-message', HTMLElement);
    this.modeCopy = requireUniqueElement(this.hud, 'mode-copy', HTMLElement);
    this.moveStick = requireUniqueElement(this.root, 'move-stick', HTMLElement);
    this.fatalPanel = requireUniqueElement(this.root, 'fatal-panel', HTMLElement);
    this.fatalCopy = requireUniqueElement(this.root, 'fatal-copy', HTMLElement);
    this.liveStatus = requireUniqueElement(this.root, 'live-status', HTMLElement);

    this.elements = Object.freeze({
      startButton: requireUniqueElement(this.root, 'enter-button', HTMLButtonElement),
      stillButton: requireUniqueElement(this.root, 'still-button', HTMLButtonElement),
      helpButton: requireUniqueElement(this.root, 'help-button', HTMLButtonElement),
      closeHelpButton: requireUniqueElement(this.root, 'help-close', HTMLButtonElement),
      homeButton: requireUniqueElement(this.root, 'home-button', HTMLButtonElement),
      motionButton: requireUniqueElement(this.root, 'motion-button', HTMLButtonElement),
      moveZone: requireUniqueElement(this.root, 'move-zone', HTMLElement),
      lookZone: requireUniqueElement(this.root, 'look-zone', HTMLElement),
    });

    this.controlGlyphs = Array.from(
      this.root.querySelectorAll<HTMLElement>('[data-control]'),
    );
    for (const glyph of this.controlGlyphs) {
      glyph.addEventListener('animationend', this.handleControlAnimationEnd);
    }

    const requestedMode = this.root.dataset.mode;
    const initialMode: ControlMode = isControlMode(requestedMode)
      ? requestedMode
      : 'loading';
    this.setProgress(0);
    this.setMode(initialMode);
  }

  setMode(mode: ControlMode, message?: string): void {
    if (this.disposed) {
      return;
    }

    const presentation = MODE_PRESENTATION[mode];
    const resolvedMessage = message?.trim() || presentation.announcement;
    const modeChanged = this.currentMode !== mode;
    const announcementChanged = this.currentAnnouncement !== resolvedMessage;

    if (!modeChanged && !announcementChanged) {
      return;
    }

    this.currentMode = mode;
    this.currentAnnouncement = resolvedMessage;

    if (modeChanged) {
      if (this.root.dataset.mode !== mode) {
        this.root.dataset.mode = mode;
      }
      if (this.modeCopy.textContent !== presentation.label) {
        this.modeCopy.textContent = presentation.label;
      }
      this.applyModeState(mode);
    }

    if (announcementChanged && this.liveStatus.textContent !== resolvedMessage) {
      this.liveStatus.textContent = resolvedMessage;
    }

    if (mode === 'loading' && message) {
      this.setProgress(this.progress, message);
    } else if (mode === 'ready') {
      this.setProgress(1, message || presentation.announcement);
    } else if (mode === 'paused') {
      if (this.pauseMessage.textContent !== resolvedMessage) {
        this.pauseMessage.textContent = resolvedMessage;
      }
    } else if (mode === 'fatal' && this.fatalCopy.textContent !== resolvedMessage) {
      this.fatalCopy.textContent = resolvedMessage;
    }
  }

  setHelpOpen(open: boolean): void {
    if (this.disposed || this.helpOpen === open) {
      return;
    }

    this.helpOpen = open;
    setRegionVisible(this.helpPanel, open);
    this.elements.helpButton.setAttribute('aria-expanded', String(open));

    if (this.currentMode !== null) {
      this.applyModeState(this.currentMode);
    }
  }

  setMotionReduction(state: MotionReductionState): void {
    if (this.disposed || this.motionReductionState === state) {
      return;
    }

    this.motionReductionState = state;
    const reduced = state !== 'normal';
    const locked = state === 'system' || state === 'still';
    const button = this.elements.motionButton;

    if (this.root.dataset.reducedMotion !== String(reduced)) {
      this.root.dataset.reducedMotion = String(reduced);
    }
    button.disabled = locked;
    button.setAttribute('aria-pressed', String(reduced));

    if (state === 'manual') {
      button.setAttribute('aria-label', '恢复动态');
      button.title = '恢复环境动态';
    } else if (state === 'system') {
      button.setAttribute('aria-label', '动态已降低');
      button.title = '已按系统偏好降低动态';
    } else if (state === 'still') {
      button.setAttribute('aria-label', '动态已降低');
      button.title = '静观模式下动态已降低';
    } else {
      button.setAttribute('aria-label', '减少动态');
      button.title = '减少环境动态';
    }
  }

  setProgress(value: number, message?: string): void {
    if (this.disposed) {
      return;
    }

    const normalized = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    const percent = Math.round(normalized * 100);
    const suppliedMessage = message?.trim();
    const defaultMessage =
      normalized >= 1 ? '风景已就绪' : `正在载入林荫与海风 · ${percent}%`;
    const visibleMessage = suppliedMessage
      ? /%/.test(suppliedMessage)
        ? suppliedMessage
        : `${suppliedMessage} · ${percent}%`
      : defaultMessage;

    this.progress = normalized;
    this.progressBar.style.setProperty('--progress', normalized.toFixed(4));
    this.progressBar.setAttribute('aria-valuenow', String(percent));
    this.progressBar.setAttribute(
      'aria-valuetext',
      suppliedMessage ? `${suppliedMessage}，${percent}%` : `${percent}%`,
    );
    this.progressBar.toggleAttribute('data-complete', normalized >= 1);
    this.progressCopy.textContent = visibleMessage;
  }

  setJoystick(x: number, y: number, active: boolean): void {
    if (this.disposed) {
      return;
    }

    let normalizedX = active ? clampUnit(x) : 0;
    let normalizedY = active ? clampUnit(y) : 0;
    const magnitude = Math.hypot(normalizedX, normalizedY);

    if (magnitude > 1) {
      normalizedX /= magnitude;
      normalizedY /= magnitude;
    }

    this.moveStick.style.setProperty(
      '--stick-x',
      `${(normalizedX * JOYSTICK_TRAVEL_PX).toFixed(2)}px`,
    );
    this.moveStick.style.setProperty(
      '--stick-y',
      `${(normalizedY * JOYSTICK_TRAVEL_PX).toFixed(2)}px`,
    );
    this.moveStick.dataset.active = String(active);
    this.elements.moveZone.dataset.active = String(active);
  }

  flashControl(code: string): void {
    if (this.disposed || !code) {
      return;
    }

    const canonicalCode = CONTROL_ALIASES[code] ?? code;

    for (const glyph of this.controlGlyphs) {
      const controls = glyph.dataset.control?.split(/\s+/) ?? [];
      if (!controls.includes(code) && !controls.includes(canonicalCode)) {
        continue;
      }

      const existingTimer = this.flashTimers.get(glyph);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }

      glyph.classList.add('is-flashed');
      const timer = window.setTimeout(() => {
        glyph.classList.remove('is-flashed');
        this.flashTimers.delete(glyph);
      }, CONTROL_FLASH_DURATION_MS);
      this.flashTimers.set(glyph, timer);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    for (const glyph of this.controlGlyphs) {
      glyph.removeEventListener('animationend', this.handleControlAnimationEnd);
      glyph.classList.remove('is-flashed');
    }

    for (const timer of this.flashTimers.values()) {
      window.clearTimeout(timer);
    }
    this.flashTimers.clear();

    this.moveStick.style.setProperty('--stick-x', '0px');
    this.moveStick.style.setProperty('--stick-y', '0px');
    this.moveStick.dataset.active = 'false';
    this.elements.moveZone.dataset.active = 'false';
    this.disposed = true;
  }

  private applyModeState(mode: ControlMode): void {
    const entryVisible = ENTRY_VISIBLE_BY_MODE[mode];
    const hudVisible = HUD_VISIBLE_BY_MODE[mode];
    const pauseVisible = mode === 'paused' && !this.helpOpen;
    const fatalVisible = mode === 'fatal' && !this.helpOpen;
    const touchVisible = mode === 'touch' && !this.helpOpen;

    setRegionVisible(this.entry, entryVisible);
    setRegionVisible(this.hud, hudVisible);
    setRegionVisible(this.pausePrompt, pauseVisible);
    setRegionVisible(this.fatalPanel, fatalVisible);

    if (this.helpOpen) {
      this.entry.inert = true;
      this.entry.setAttribute('aria-hidden', 'true');
      this.hud.inert = true;
      this.hud.setAttribute('aria-hidden', 'true');
    }
    this.skipLink.inert = this.helpOpen;
    this.skipLink.setAttribute('aria-hidden', String(this.helpOpen));

    this.pausePrompt.disabled = !pauseVisible;
    this.elements.moveZone.hidden = !touchVisible;
    this.elements.moveZone.inert = !touchVisible;
    this.elements.lookZone.hidden = !touchVisible;
    this.elements.lookZone.inert = !touchVisible;
    this.elements.moveZone.setAttribute('aria-hidden', 'true');
    this.elements.lookZone.setAttribute('aria-hidden', 'true');

    const sceneHidden = mode === 'fatal' || this.helpOpen;
    this.canvas.inert = sceneHidden;
    this.canvas.setAttribute('aria-hidden', String(sceneHidden));

    const entryActionsEnabled =
      mode !== 'loading' && mode !== 'fatal' && !this.helpOpen;
    this.elements.startButton.disabled = !entryActionsEnabled;
    this.elements.stillButton.disabled = !entryActionsEnabled;

    if (!touchVisible) {
      this.setJoystick(0, 0, false);
    }
  }

  private readonly handleControlAnimationEnd = (event: AnimationEvent): void => {
    const glyph = event.currentTarget;
    if (!(glyph instanceof HTMLElement) || !glyph.classList.contains('is-flashed')) {
      return;
    }

    const timer = this.flashTimers.get(glyph);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.flashTimers.delete(glyph);
    }
    glyph.classList.remove('is-flashed');
  };
}
