import { App } from './App';
import { ControlsOverlay } from './ui/ControlsOverlay';

type ElementConstructor<T extends Element> = new () => T;

let app: App | null = null;
let overlay: ControlsOverlay | null = null;
let hotDisposed = false;

function requireElement<T extends Element>(
  id: string,
  constructor: ElementConstructor<T>,
): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Required DOM element #${id} is missing or invalid.`);
  }

  return element;
}

function parseSeed(search: string): number | undefined {
  const rawSeed = new URLSearchParams(search).get('seed');
  if (rawSeed === null || rawSeed === '') return undefined;

  for (let index = 0; index < rawSeed.length; index += 1) {
    const code = rawSeed.charCodeAt(index);
    if (code < 48 || code > 57) {
      throw new Error(
        'The seed query parameter must be an unsigned decimal integer.',
      );
    }
  }

  const seed = Number(rawSeed);
  if (!Number.isSafeInteger(seed) || seed > 0xffff_ffff) {
    throw new Error('The seed query parameter must be between 0 and 4294967295.');
  }

  return seed;
}


function showFatalState(error: unknown): void {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : 'The landscape could not be started in this browser.';
  const root = document.getElementById('app');
  const panel = document.getElementById('fatal-panel');
  const copy = document.getElementById('fatal-copy');
  const entry = document.getElementById('entry');

  if (root instanceof HTMLElement) root.dataset.mode = 'fatal';
  if (
    entry instanceof HTMLElement &&
    panel instanceof HTMLElement &&
    !entry.contains(panel)
  ) {
    entry.hidden = true;
  }
  if (copy instanceof HTMLElement) copy.textContent = message;

  if (panel instanceof HTMLElement) {
    panel.hidden = false;
    panel.removeAttribute('inert');
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  }

  console.error('Unable to start the Badaguan landscape:', error);
}

async function bootstrap(): Promise<void> {
  try {
    const root = requireElement('app', HTMLElement);
    const canvas = requireElement('scene', HTMLCanvasElement);
    const seed = parseSeed(window.location.search);

    overlay = new ControlsOverlay(document);
    app = new App({ root, canvas, overlay }, seed);
    await app.init();

    if (hotDisposed) {
      app.dispose();
      return;
    }

    app.start();
  } catch (error) {
    if (app !== null) app.dispose();
    else overlay?.dispose();

    app = null;
    overlay = null;
    if (!hotDisposed) showFatalState(error);
  }
}

void bootstrap();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    hotDisposed = true;
    app?.dispose();
    app = null;
    overlay = null;
  });
}
