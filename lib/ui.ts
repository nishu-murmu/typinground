/**
 * Everything Typinground draws on top of a page, kept in a shadow root so the
 * page's CSS can't touch it (and ours can't touch the page).
 */
import type { Mode, Stats } from './engine';
import { TIME_OPTIONS, WORD_OPTIONS, type Settings } from './storage';

export const THEME = {
  bg: '#ffffff',
  panel: '#f7f9fc',
  border: '#d5dbe4',
  ink: '#060a12',
  main: '#004296',
  mainSoft: '#e3ecf8',
  sub: '#6b7486',
  text: '#1b2230',
  error: '#d2123c',
};

const FONT = `'DM Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  font-family: ${FONT};
  color: ${THEME.text};
}
.dim {
  position: fixed; border-radius: 8px; pointer-events: none;
  box-shadow: 0 0 0 200vmax var(--dim, rgba(0,0,0,.3));
}
.dim.full { inset: 0; border-radius: 0; box-shadow: none; background: var(--dim, rgba(0,0,0,.5)); }
.caret {
  position: fixed; width: 2px; border-radius: 1px; background: var(--caret, ${THEME.main});
  transition: left 80ms ease-out, top 80ms ease-out; animation: blink 1s step-end infinite;
}
.caret.typing { animation: none; }
@keyframes blink { 50% { opacity: 0; } }
.extra { position: fixed; color: ${THEME.error}; white-space: pre; opacity: .8; }
.hud {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 10px;
  background: ${THEME.bg}; color: ${THEME.sub}; font-size: 12px; pointer-events: auto;
  border: 1px solid ${THEME.border}; box-shadow: 0 8px 24px -10px rgba(6,10,18,.3); user-select: none; white-space: nowrap;
}
.hud .clock {
  min-width: 64px; padding-right: 6px; color: ${THEME.main}; font-size: 16px;
  font-variant-numeric: tabular-nums; font-weight: 600; text-align: right;
}
.hud .sep { width: 1px; height: 16px; margin: 0 4px; background: ${THEME.border}; }
/* While picking a section there's no test running, so no clock. */
.hud .clock:empty, .hud .clock:empty + .sep { display: none; }
button {
  all: unset; cursor: pointer; padding: 3px 7px; border-radius: 6px; color: ${THEME.sub};
  transition: color .12s;
}
button:hover { color: ${THEME.ink}; }
button.on { color: ${THEME.main}; background: ${THEME.mainSoft}; font-weight: 600; }
.backdrop {
  position: fixed; inset: 0; display: grid; place-items: center; pointer-events: auto;
  background: rgba(6,10,18,.28);
}
.card {
  min-width: min(480px, calc(100vw - 32px)); padding: 28px 32px; border-radius: 14px;
  background: ${THEME.bg}; border: 1px solid ${THEME.border}; box-shadow: 0 24px 60px -20px rgba(6,10,18,.4);
}
.stats { display: flex; gap: 36px; align-items: flex-end; }
.stat .label { color: ${THEME.sub}; font-size: 13px; }
.stat .value { color: ${THEME.ink}; font-size: 30px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat.big .value { color: ${THEME.main}; }
.stat.big .value { font-size: 60px; }
.details { margin-top: 18px; display: flex; gap: 24px; font-size: 12px; color: ${THEME.sub}; }
.details b { color: ${THEME.text}; font-weight: 500; }
.chart { display: block; margin-top: 18px; width: 100%; height: 70px; }
.actions { margin-top: 22px; display: flex; gap: 8px; }
.actions button { padding: 6px 12px; border: 1px solid ${THEME.border}; color: ${THEME.ink}; border-radius: 8px; }
.actions button:hover { border-color: ${THEME.ink}; }
.actions kbd { font: inherit; color: ${THEME.sub}; margin-left: 6px; font-size: 11px; }
.panel {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(860px, calc(100vw - 32px)); padding: 28px 32px; border-radius: 14px;
  background: ${THEME.bg}; border: 1px solid ${THEME.border}; pointer-events: auto;
}
.panel p {
  margin: 0; height: calc(1.6em * 3); overflow-y: auto; scrollbar-width: none;
  font-size: 24px; line-height: 1.6; color: ${THEME.sub};
}
.pickbox {
  position: fixed; border: 2px solid ${THEME.main}; border-radius: 4px;
  background: rgba(0,66,150,.07); transition: all 60ms ease-out;
}
.pickbox span {
  position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; padding: 2px 8px;
  border-radius: 4px; background: ${THEME.main}; color: #fff; font-size: 11px; white-space: nowrap;
}
.pickbox.below span { bottom: auto; top: 100%; margin: 4px 0 0; }
.hint {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  padding: 9px 16px; border-radius: 999px; background: ${THEME.ink}; color: #fff;
  font-size: 12px; box-shadow: 0 10px 30px -10px rgba(6,10,18,.5); white-space: nowrap;
}
.hint b { color: #7cb0f5; font-weight: 500; }
.toast {
  position: fixed; bottom: 16px; right: 16px; padding: 8px 14px; border-radius: 10px;
  background: ${THEME.ink}; color: #fff; font-size: 12px;
  box-shadow: 0 10px 30px -10px rgba(6,10,18,.5); transition: opacity .3s;
}
`;

type Child = Node | string | null | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
) {
  const el = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) el.className = className;
  Object.assign(el, rest);
  for (const child of children) if (child) el.append(child);
  return el;
}

export interface HudHandlers {
  onMode(mode: Mode): void;
  onLength(length: number): void;
  onSimple(): void;
  onPick(): void;
  onExit(): void;
}

export interface ResultHandlers {
  onNext(): void;
  onRepeat(): void;
  onExit(): void;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class Ui {
  readonly host: HTMLElement;
  private shadow: ShadowRoot;
  private root: HTMLElement;
  private highlightStyle: HTMLStyleElement;
  private dim = h('div', { class: 'dim full' });
  private caret = h('div', { class: 'caret' });
  private extra = h('div', { class: 'extra' });
  private clock = h('span', { class: 'clock' });
  private hud: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private pickbox: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private toastTimer = 0;

  constructor() {
    this.host = document.createElement('typinground-ui');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.highlightStyle = h('style');
    this.root = h('div', { class: 'root' }, this.dim, this.caret, this.extra);
    this.shadow.append(h('style', { textContent: CSS }), this.highlightStyle, this.root);
    // Stops keyboard focus from landing in the HUD, where Space would click buttons.
    this.root.addEventListener('mousedown', (e) => e.preventDefault());
    document.documentElement.append(this.host);
  }

  destroy() {
    clearTimeout(this.toastTimer);
    this.host.remove();
  }

  /** `::highlight()` rules must also live in the shadow root to reach the fallback panel. */
  setHighlightCss(css: string) {
    this.highlightStyle.textContent = css;
  }

  setColors(caret: string, dim: string) {
    this.root.style.setProperty('--caret', caret);
    this.root.style.setProperty('--dim', dim);
  }

  /** A spotlight around `box`, or the whole page dimmed when null. */
  setDim(box: Box | null, visible = true) {
    this.dim.hidden = !visible;
    this.dim.classList.toggle('full', box === null);
    if (!box) return;
    const pad = 10;
    Object.assign(this.dim.style, {
      left: `${box.left - pad}px`,
      top: `${box.top - pad}px`,
      width: `${box.width + pad * 2}px`,
      height: `${box.height + pad * 2}px`,
    });
  }

  setCaret(box: Box | null, extra = '', font = '', typing = false) {
    this.caret.hidden = box === null;
    this.extra.hidden = box === null || extra === '';
    if (!box) return;
    this.extra.textContent = extra;
    this.extra.style.font = font;
    Object.assign(this.extra.style, { left: `${box.left}px`, top: `${box.top}px`, lineHeight: `${box.height}px` });
    const offset = extra ? this.extra.getBoundingClientRect().width : 0;
    Object.assign(this.caret.style, {
      left: `${box.left + offset - 1}px`,
      top: `${box.top}px`,
      height: `${box.height}px`,
    });
    this.caret.classList.toggle('typing', typing);
  }

  renderHud(settings: Settings, handlers: HudHandlers) {
    const lengths = settings.mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS;
    const current = settings.mode === 'time' ? settings.time : settings.words;
    const hud = h(
      'div',
      { class: 'hud' },
      this.clock,
      h('span', { class: 'sep' }),
      ...(['time', 'words'] as const).map((mode) =>
        h('button', { class: settings.mode === mode ? 'on' : '', textContent: mode, onclick: () => handlers.onMode(mode) }),
      ),
      h('span', { class: 'sep' }),
      ...lengths.map((length) =>
        h('button', { class: length === current ? 'on' : '', textContent: String(length), onclick: () => handlers.onLength(length) }),
      ),
      h('span', { class: 'sep' }),
      h('button', {
        class: settings.simple ? 'on' : '',
        textContent: 'simple',
        title: 'Lowercase, no punctuation',
        onclick: handlers.onSimple,
      }),
      h('button', { textContent: 'pick section', title: 'Alt+Shift+P', onclick: handlers.onPick }),
      h('button', { textContent: '✕', title: 'Exit (Esc)', onclick: handlers.onExit }),
    );
    this.hud?.remove();
    this.hud = hud;
    this.root.append(hud);
  }

  setClock(text: string) {
    this.clock.textContent = text;
  }

  showResults(stats: Stats, samples: number[], summary: string, handlers: ResultHandlers) {
    const stat = (label: string, value: string, big = false) =>
      h('div', { class: big ? 'stat big' : 'stat' }, h('div', { class: 'label', textContent: label }), h('div', { class: 'value', textContent: value }));
    const { correct, incorrect, extra, missed } = stats.chars;
    const card = h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'stats' },
        stat('wpm', String(Math.round(stats.wpm)), true),
        stat('acc', `${Math.round(stats.accuracy)}%`),
        stat('raw', String(Math.round(stats.raw))),
      ),
      chart(samples),
      h(
        'div',
        { class: 'details' },
        h('span', {}, 'test ', h('b', { textContent: summary })),
        h('span', {}, 'time ', h('b', { textContent: `${Math.round(stats.seconds)}s` })),
        h('span', { title: 'correct / incorrect / extra / missed' }, 'chars ', h('b', { textContent: `${correct}/${incorrect}/${extra}/${missed}` })),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { onclick: handlers.onNext }, 'next test', h('kbd', { textContent: 'tab' })),
        h('button', { onclick: handlers.onRepeat }, 'repeat', h('kbd', { textContent: 'enter' })),
        h('button', { onclick: handlers.onExit }, 'exit', h('kbd', { textContent: 'esc' })),
      ),
    );
    this.setOverlay(h('div', { class: 'backdrop' }, card));
  }

  /** The common-words panel for pages without enough text. Returns its text node. */
  showPanel(text: string): Text {
    const node = document.createTextNode(text);
    this.setOverlay(h('div', { class: 'panel' }, h('p', {}, node)));
    return node;
  }

  clearOverlay() {
    this.setOverlay(null);
  }

  get hasResults() {
    return this.overlay?.classList.contains('backdrop') ?? false;
  }

  setPickBox(box: Box | null, label = '') {
    if (!box) {
      this.pickbox?.remove();
      this.pickbox = null;
      return;
    }
    if (!this.pickbox) {
      this.pickbox = h('div', { class: 'pickbox' }, h('span'));
      this.root.append(this.pickbox);
    }
    this.pickbox.querySelector('span')!.textContent = label;
    this.pickbox.classList.toggle('below', box.top < 24);
    Object.assign(this.pickbox.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
  }

  showPickHint(visible: boolean) {
    this.hint?.remove();
    this.hint = null;
    if (!visible) return;
    this.hint = h(
      'div',
      { class: 'hint' },
      h('b', { textContent: 'hover' }), ' a section · ',
      h('b', { textContent: '↑ ↓' }), ' widen / narrow · ',
      h('b', { textContent: 'click' }), ' to pick · ',
      h('b', { textContent: 'esc' }), ' cancel',
    );
    this.root.append(this.hint);
  }

  toast(message: string) {
    this.shadow.querySelector('.toast')?.remove();
    clearTimeout(this.toastTimer);
    const toast = h('div', { class: 'toast', textContent: message });
    this.root.append(toast);
    this.toastTimer = window.setTimeout(() => toast.remove(), 3500);
  }

  private setOverlay(el: HTMLElement | null) {
    this.overlay?.remove();
    this.overlay = el;
    // Keep the overlay under the caret so the caret still shows on the fallback panel.
    if (el) this.root.insertBefore(el, this.caret);
  }
}

/** WPM per second as a small line chart. */
function chart(samples: number[]) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'chart');
  if (samples.length < 2) {
    svg.style.display = 'none';
    return svg;
  }
  const width = 400;
  const height = 70;
  // Scale to the speeds actually reached, so changes in pace are visible.
  const top = Math.max(...samples);
  const bottom = Math.min(...samples);
  const pad = Math.max((top - bottom) * 0.25, 5);
  const low = Math.max(0, bottom - pad);
  const range = top + pad - low;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const points = samples.map((wpm, i) => {
    const x = (i / (samples.length - 1)) * width;
    const y = height - ((wpm - low) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `0,${height} ${points.join(' ')} ${width},${height}`);
  area.setAttribute('fill', THEME.main);
  area.setAttribute('fill-opacity', '0.08');
  svg.append(area);
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', points.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', THEME.main);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);
  return svg;
}
