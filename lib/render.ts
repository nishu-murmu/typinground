/**
 * Paints typing progress onto the page's own text with the CSS Custom Highlight API,
 * so the page's DOM is never modified, and keeps the caret and spotlight in place.
 */
import type { CharState, TypingEngine } from './engine';
import type { TextMap } from './textmap';
import { THEME, type Box, type Ui } from './ui';

const STATES: CharState[] = ['untyped', 'correct', 'incorrect', 'missed'];

export interface Palette {
  untyped: string;
  correct: string;
  incorrect: string;
  caret: string;
  dim: string;
}

const LIGHT: Palette = {
  untyped: '#a3a8ae',
  correct: '#0d1117',
  incorrect: '#d2123c',
  caret: '#004296',
  dim: 'rgba(6, 10, 18, 0.22)',
};

const DARK: Palette = {
  untyped: '#6f7386',
  correct: '#eef1f6',
  incorrect: '#ff6b81',
  caret: '#7cb0f5',
  dim: 'rgba(0, 0, 0, 0.5)',
};

export const PANEL_PALETTE: Palette = {
  untyped: '#a3a8ae',
  correct: THEME.ink,
  incorrect: THEME.error,
  caret: THEME.main,
  dim: 'rgba(6, 10, 18, 0.35)',
};

/** Light or dark colors, depending on what's behind the text. */
export function paletteFor(el: Element): Palette {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const match = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
    if (!match) continue;
    const [r = 0, g = 0, b = 0, a = 1] = match.map(Number);
    if (a < 0.5) continue;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.45 ? DARK : LIGHT;
  }
  return LIGHT;
}

function highlightCss(p: Palette) {
  return `
::highlight(tg-untyped) { color: ${p.untyped}; }
::highlight(tg-correct) { color: ${p.correct}; }
::highlight(tg-incorrect) { color: ${p.incorrect}; background-color: rgba(210, 18, 60, 0.12); }
::highlight(tg-missed) { color: ${p.untyped}; text-decoration: underline wavy ${p.incorrect}; }
`;
}

export class Renderer {
  private highlights = new Map(STATES.map((state) => [state, new Highlight()]));
  private style = document.createElement('style');
  private frame = 0;
  private lastCaretTop: number | null = null;

  constructor(
    private map: TextMap,
    private engine: TypingEngine,
    private ui: Ui,
    palette: Palette,
    /** Element to spotlight; null dims the whole page. */
    private focus: Element | null,
  ) {
    for (const [state, highlight] of this.highlights) CSS.highlights.set(`tg-${state}`, highlight);
    this.style.textContent = highlightCss(palette);
    document.head.append(this.style);
    ui.setHighlightCss(highlightCss(palette));
    ui.setColors(palette.caret, palette.dim);
    window.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', this.onViewportChange, { passive: true });
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    for (const state of STATES) CSS.highlights.delete(`tg-${state}`);
    this.style.remove();
    window.removeEventListener('scroll', this.onViewportChange, { capture: true });
    window.removeEventListener('resize', this.onViewportChange);
    this.ui.setCaret(null);
  }

  /** Repaints after a keystroke and keeps the active line in view. */
  paint() {
    for (const highlight of this.highlights.values()) highlight.clear();
    const { engine } = this;

    let run = null as { state: CharState; from: number } | null;
    const flush = (to: number) => {
      if (run) this.addRanges(run.state, run.from, to);
      run = null;
    };
    for (let w = 0; w <= engine.wordIndex && w < engine.words.length; w++) {
      const start = engine.wordStarts[w]!;
      const word = engine.words[w]!;
      for (let c = 0; c < word.length; c++) {
        const state = engine.charState(w, c);
        if (run?.state !== state) {
          flush(start + c);
          run = { state, from: start + c };
        }
      }
      flush(start + word.length);
    }
    // Everything after the current word, including mapped text past a words-mode test.
    const next = engine.wordStarts[engine.wordIndex + 1] ?? engine.target.length;
    this.addRanges('untyped', next, this.map.text.length);

    this.position(true);
  }

  private onViewportChange = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.position(false));
  };

  private position(fromTyping: boolean) {
    this.ui.setDim(this.focus ? toBox(this.focus.getBoundingClientRect()) : null);
    if (this.engine.finished) {
      this.ui.setCaret(null);
      return;
    }
    let caret = this.caretBox();
    const source = this.map.sources[this.engine.cursor] ?? this.map.sources[this.engine.cursor - 1];
    const font = source ? getComputedStyle(source.node.parentElement!).font : '';
    // The words panel shifts its text before the caret is drawn, so the caret never
    // flashes on the line below.
    if (fromTyping && caret && source && !this.focus && this.snapPanelLine(caret, source.node.parentElement!)) {
      caret = this.caretBox();
    }
    this.ui.setCaret(caret, this.engine.extra, font, this.engine.started);
    if (fromTyping && caret && source && this.focus) this.keepInView(caret, source.node.parentElement!);
  }

  /**
   * Keeps the active line as the second line of the words panel by scrolling whole
   * lines instantly. Returns whether it scrolled.
   */
  private snapPanelLine(caret: Box, el: Element) {
    const scroller = scrollParent(el);
    if (!scroller) return false;
    const lineHeight = parseFloat(getComputedStyle(scroller).lineHeight);
    if (!lineHeight) return false;
    const line = Math.floor((caret.top - scroller.getBoundingClientRect().top) / lineHeight);
    if (line < 2) return false;
    // Work from absolute line numbers so rounding of scrollTop never drifts.
    const firstVisible = Math.round(scroller.scrollTop / lineHeight);
    scroller.scrollTop = Math.round((firstVisible + line - 1) * lineHeight);
    return true;
  }

  /** Caret before the next letter, or after the last one once the word is fully typed. */
  private caretBox(): Box | null {
    const { engine } = this;
    if (engine.words.length === 0) return null;
    const atWordEnd = engine.currentTyped.length >= engine.currentWord.length;
    const index = atWordEnd ? engine.cursor - 1 : engine.cursor;
    const rect = this.charRect(index, atWordEnd);
    if (!rect) return null;
    return { left: atWordEnd ? rect.right : rect.left, top: rect.top, width: 0, height: rect.height };
  }

  private charRect(index: number, last: boolean) {
    const source = this.map.sources[index];
    if (!source || !source.node.isConnected) return null;
    const range = document.createRange();
    range.setStart(source.node, source.start);
    range.setEnd(source.node, source.end);
    const rects = range.getClientRects();
    return rects.length ? rects[last ? rects.length - 1 : 0] : null;
  }

  /** Scrolls when the caret moves to a line outside the middle band of the view. */
  private keepInView(caret: Box, el: Element) {
    const lineChanged = this.lastCaretTop === null || Math.abs(caret.top - this.lastCaretTop) > caret.height / 2;
    this.lastCaretTop = caret.top;
    if (!lineChanged) return;
    const scroller = scrollParent(el);
    const view = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
    const relative = caret.top - view.top;
    if (relative > view.height * 0.2 && relative < view.height * 0.6) return;
    const delta = relative - view.height * 0.38;
    (scroller ?? window).scrollBy({ top: delta, behavior: 'smooth' });
  }

  private addRanges(state: CharState, from: number, to: number) {
    const highlight = this.highlights.get(state)!;
    let range: Range | null = null;
    let node: Text | null = null;
    let end = 0;
    for (let i = from; i < to; i++) {
      const source = this.map.sources[i];
      if (!source) continue;
      if (range && source.node === node && source.start <= end) {
        end = Math.max(end, source.end);
        range.setEnd(node, end);
        continue;
      }
      range = document.createRange();
      node = source.node;
      end = source.end;
      range.setStart(node, source.start);
      range.setEnd(node, end);
      highlight.add(range);
    }
  }
}

function toBox(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function scrollParent(el: Element | null): Element | null {
  for (let node = el; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}
