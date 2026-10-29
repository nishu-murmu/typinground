/**
 * Hover-to-highlight section picker, for pages where the automatic pick is wrong.
 */
import type { Ui } from './ui';

export interface PickerHandlers {
  onPick(el: Element): void;
  onCancel(): void;
}

const MIN_WORDS = 5;

export function startPicker(ui: Ui, handlers: PickerHandlers) {
  let current: Element | null = null;
  /** Elements stepped out of with ↑, so ↓ can step back in. */
  const inner: Element[] = [];
  const previousCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'crosshair';
  ui.showPickHint(true);

  const isOurs = (e: Event) => e.composedPath().includes(ui.host);

  const draw = () => {
    if (!current) return ui.setPickBox(null);
    const rect = current.getBoundingClientRect();
    ui.setPickBox(rect, describe(current));
  };

  const widen = () => {
    const parent = current?.parentElement;
    if (!current || !parent || parent === document.documentElement) return;
    inner.push(current);
    current = parent;
    draw();
  };

  const narrow = () => {
    const child = inner.pop();
    if (child) {
      current = child;
      draw();
    }
  };

  const choose = () => {
    if (!current) return;
    const picked = current;
    stop();
    handlers.onPick(picked);
  };

  const onMove = (e: MouseEvent) => {
    if (isOurs(e) || !(e.target instanceof Element)) return;
    const target = snap(e.target);
    // Keep a widened selection while the mouse stays inside it.
    if (target === current || (current && inner.length && current.contains(target))) return;
    current = target;
    inner.length = 0;
    draw();
  };

  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') {
      stop();
      handlers.onCancel();
    } else if (e.key === 'ArrowUp') widen();
    else if (e.key === 'ArrowDown') narrow();
    else if (e.key === 'Enter') choose();
  };

  const onMouse = (e: MouseEvent) => {
    if (isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') choose();
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.altKey) return;
    e.preventDefault();
    if (e.deltaY < 0) widen();
    else narrow();
  };

  const onScroll = () => draw();

  const keyEvents = ['keydown', 'keypress', 'keyup'] as const;
  const mouseEvents = ['mousedown', 'mouseup', 'click', 'auxclick'] as const;
  window.addEventListener('mousemove', onMove, true);
  for (const type of keyEvents) window.addEventListener(type, onKey, true);
  for (const type of mouseEvents) window.addEventListener(type, onMouse, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });

  function stop() {
    window.removeEventListener('mousemove', onMove, true);
    for (const type of keyEvents) window.removeEventListener(type, onKey, true);
    for (const type of mouseEvents) window.removeEventListener(type, onMouse, true);
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('scroll', onScroll, { capture: true });
    document.documentElement.style.cursor = previousCursor;
    ui.setPickBox(null);
    ui.showPickHint(false);
  }

  return { stop };
}

/** The nearest element around `el` that is a block with real text in it. */
function snap(el: Element): Element {
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).display !== 'inline' && wordCount(node) >= MIN_WORDS) return node;
  }
  return document.body;
}

function wordCount(el: Element) {
  return (el.textContent ?? '').split(/\s+/).filter(Boolean).length;
}

function describe(el: Element) {
  const id = el.id ? `#${el.id}` : '';
  const cls = !id && typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
  return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''} · ${wordCount(el)} words`;
}

/**
 * A CSS selector that finds `el` again on later visits. Prefers stable ids and class
 * names over positions, and skips generated-looking names (css-1x2y3z, sc-bdVaJa).
 */
export function uniqueSelector(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
    if (node.id && isStable(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      const selector = parts.join(' > ');
      if (matchesOnly(selector, el)) return selector;
      break;
    }
    parts.unshift(describeForSelector(node));
    const selector = parts.join(' > ');
    if (matchesOnly(selector, el)) return selector;
  }
  return positionalSelector(el);
}

function describeForSelector(el: Element) {
  const classes = [...el.classList].filter(isStable).slice(0, 2);
  return el.tagName.toLowerCase() + classes.map((c) => `.${CSS.escape(c)}`).join('');
}

function positionalSelector(el: Element) {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const tag = node.tagName.toLowerCase();
    const sameTag = node.parentElement
      ? [...node.parentElement.children].filter((child) => child.tagName === node!.tagName)
      : [node];
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
  }
  return ['body', ...parts].join(' > ');
}

function isStable(token: string) {
  return (
    token.length <= 40 &&
    !/^(css|sc|jsx|emotion|styled)-/i.test(token) &&
    (token.match(/\d/g)?.length ?? 0) < 2 &&
    !/^[a-z]{1,3}[A-Z][a-zA-Z]{3,}$/.test(token)
  );
}

function matchesOnly(selector: string, el: Element) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}
