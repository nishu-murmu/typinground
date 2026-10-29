/**
 * One typing session on a page: from the toggle shortcut until exit. Ties together
 * extraction, the engine, the renderer, the HUD and the picker.
 */
import { TypingEngine } from './engine';
import { extract, type Extraction } from './extract';
import { startPicker, uniqueSelector } from './picker';
import { PANEL_PALETTE, paletteFor, Renderer } from './render';
import { addResult, picksItem, savePick, settingsItem, type Settings } from './storage';
import { buildTextMap, textMapFromNode, type TextMap } from './textmap';
import { Ui } from './ui';
import { randomWords } from './words';

/** Below this many words on the page, type common words instead. */
const MIN_PAGE_WORDS = 15;
/** Enough text for a two-minute test at a very high speed. */
const MAX_WORDS = 600;

type StartAt = 'visible' | 'repeat' | HTMLElement;

export class Session {
  private ui: Ui | null = null;
  private settings!: Settings;
  private extraction: Extraction | null = null;
  private startBlock: HTMLElement | null = null;
  private engine: TypingEngine | null = null;
  private renderer: Renderer | null = null;
  private map: TextMap | null = null;
  private timer = 0;
  private picker: { stop(): void } | null = null;

  get active() {
    return this.ui !== null;
  }

  async toggle() {
    if (this.active) this.stop();
    else await this.start(false);
  }

  async pick() {
    if (!this.active) await this.start(true);
    else this.openPicker();
  }

  stop() {
    this.endTest();
    this.picker?.stop();
    this.picker = null;
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      window.removeEventListener(type, this.onKey, true);
    }
    window.removeEventListener('click', this.onClick, true);
    this.ui?.destroy();
    this.ui = null;
  }

  private async start(pickFirst: boolean) {
    this.settings = await settingsItem.getValue();
    this.ui = new Ui();
    (document.activeElement as HTMLElement | null)?.blur?.();
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      window.addEventListener(type, this.onKey, true);
    }
    window.addEventListener('click', this.onClick, true);
    this.renderHud();
    if (pickFirst || this.settings.alwaysPick) this.openPicker();
    else await this.begin('visible');
  }

  private async begin(startAt: StartAt) {
    const ui = this.ui;
    if (!ui) return;
    this.endTest();
    ui.clearOverlay();

    const saved = (await picksItem.getValue())[location.hostname];
    const picked = saved ? safeQuery(saved) : null;
    const extraction = extract(picked);
    this.extraction = extraction;

    const { mode, simple } = this.settings;
    const limit = mode === 'time' ? this.settings.time : this.settings.words;
    let map: TextMap | null = null;
    let focus: Element | null = null;

    if (extraction) {
      const { blocks } = extraction;
      let index = extraction.startIndex;
      if (startAt instanceof HTMLElement) index = Math.max(0, blocks.indexOf(startAt));
      else if (startAt === 'repeat' && this.startBlock) {
        const repeated = blocks.indexOf(this.startBlock);
        if (repeated !== -1) index = repeated;
      }
      // Words mode maps more text than it tests, so the text after the test is dimmed too.
      const candidate = buildTextMap(blocks.slice(index), simple, MAX_WORDS);
      if (candidate.text.split(' ').length >= Math.min(MIN_PAGE_WORDS, limit)) {
        map = candidate;
        focus = extraction.container;
        this.startBlock = blocks[index]!;
        scrollIntoViewIfNeeded(this.startBlock);
      }
    }

    if (!map) {
      if (startAt === 'visible') ui.toast('Not much text here, so typing common words instead');
      const count = mode === 'words' ? limit : 300;
      map = textMapFromNode(ui.showPanel(randomWords(count)));
      this.startBlock = null;
    }

    this.map = map;
    this.engine = new TypingEngine(map.text, mode, limit);
    this.renderer = new Renderer(map, this.engine, ui, focus ? paletteFor(focus) : PANEL_PALETTE, focus);
    this.renderer.paint();
    this.updateClock();
    this.timer = window.setInterval(this.onTick, 100);
  }

  private endTest() {
    clearInterval(this.timer);
    this.renderer?.destroy();
    this.renderer = null;
    this.engine = null;
  }

  private onTick = () => {
    const engine = this.engine;
    if (!engine) return;
    // The page replaced the text under us (single-page app navigation).
    if (this.startBlock && !this.startBlock.isConnected) return this.stop();
    engine.tick(Date.now());
    this.updateClock();
    if (engine.finished) this.finish();
  };

  private updateClock() {
    const engine = this.engine;
    if (!engine || !this.ui) return;
    if (engine.mode === 'time') this.ui.setClock(String(Math.ceil(engine.clock(Date.now()))));
    else this.ui.setClock(`${engine.finished ? engine.words.length : engine.wordIndex}/${engine.words.length}`);
  }

  private finish() {
    const engine = this.engine;
    const ui = this.ui;
    if (!engine || !ui) return;
    clearInterval(this.timer);
    this.renderer?.paint();
    const stats = engine.stats(Date.now());
    const summary = `${engine.mode} ${engine.limit}${this.settings.simple ? ' simple' : ''}`;
    void addResult({
      at: Date.now(),
      host: location.hostname,
      mode: engine.mode,
      limit: engine.limit,
      simple: this.settings.simple,
      ...stats,
    });
    ui.showResults(stats, engine.samples, summary, {
      onNext: () => this.begin('visible'),
      onRepeat: () => this.begin('repeat'),
      onExit: () => this.stop(),
    });
  }

  private openPicker() {
    const ui = this.ui;
    if (!ui) return;
    this.endTest();
    ui.clearOverlay();
    ui.setDim(null, false);
    ui.setClock('');
    this.picker?.stop();
    this.picker = startPicker(ui, {
      onPick: async (el) => {
        this.picker = null;
        await savePick(location.hostname, uniqueSelector(el));
        ui.toast(`Saved this section for ${location.hostname}`);
        await this.begin('visible');
      },
      onCancel: () => {
        this.picker = null;
        void this.begin('visible');
      },
    });
  }

  private renderHud() {
    this.ui?.renderHud(this.settings, {
      onMode: (mode) => this.updateSettings({ mode }),
      onLength: (length) =>
        this.updateSettings(this.settings.mode === 'time' ? { time: length } : { words: length }),
      onSimple: () => this.updateSettings({ simple: !this.settings.simple }),
      onPick: () => this.openPicker(),
      onExit: () => this.stop(),
    });
  }

  private async updateSettings(change: Partial<Settings>) {
    this.settings = { ...this.settings, ...change };
    await settingsItem.setValue(this.settings);
    this.renderHud();
    if (!this.picker) await this.begin('repeat');
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.picker || e.isComposing) return;
    const engine = this.engine;
    const ui = this.ui;
    if (!ui) return;

    const wordDelete = e.key === 'Backspace' && (e.ctrlKey || e.altKey);
    // Leave browser shortcuts (Ctrl+T, Ctrl+L, …) alone.
    if ((e.ctrlKey || e.metaKey || e.altKey) && !wordDelete) return;
    const handled = e.key.length === 1 || ['Backspace', 'Tab', 'Escape', 'Enter'].includes(e.key);
    if (!handled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;

    if (e.key === 'Escape') return this.stop();
    if (e.key === 'Tab') return void this.begin('visible');
    if (ui.hasResults) {
      if (e.key === 'Enter') void this.begin('repeat');
      return;
    }
    if (!engine || engine.finished) return;
    if (e.key === 'Backspace') engine.backspace(wordDelete);
    else if (e.key.length === 1) engine.input(e.key, Date.now());
    else return;
    this.renderer?.paint();
    this.updateClock();
    if (engine.finished) this.finish();
  };

  /** Clicking a paragraph restarts the test there. */
  private onClick = (e: MouseEvent) => {
    if (!this.ui || this.picker || e.composedPath().includes(this.ui.host)) return;
    const block = this.extraction?.blocks.find((b) => e.target instanceof Node && b.contains(e.target));
    if (!block) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.begin(block);
  };
}

function safeQuery(selector: string) {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function scrollIntoViewIfNeeded(el: Element) {
  const rect = el.getBoundingClientRect();
  if (rect.top >= 0 && rect.top < window.innerHeight * 0.7) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
