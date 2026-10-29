/**
 * Turns page text into typeable text while remembering where each character came
 * from, so typing results can be painted back onto the original text nodes.
 */

/** Where one typeable character lives in the page; null for spaces added between blocks. */
export type Source = { node: Text; start: number; end: number } | null;

export interface TextMap {
  /** Trimmed, single-spaced, keyboard-typeable text. */
  text: string;
  sources: Source[];
}

/** Footnotes, edit links and other noise inside paragraphs. */
const SKIP = [
  'script',
  'style',
  'noscript',
  'template',
  'math',
  'svg',
  'button',
  'sup.reference',
  'sup.noprint',
  '.reference',
  '.mw-editsection',
  '.mwe-math-element',
  '.Inline-Template',
  '[aria-hidden=true]',
].join(',');

const REPLACEMENTS: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '…': '...',
  '×': 'x',
};

/** Stands in for a character with no keyboard equivalent; its word is dropped. */
const UNTYPEABLE = '\u0000';

interface Char {
  ch: string;
  source: Source;
}

/** Maps one source character to what the user should type (possibly nothing). */
export function normalizeChar(ch: string, simple: boolean): string {
  if (/\s/.test(ch)) return ' ';
  let out = REPLACEMENTS[ch] ?? ch;
  if (/[^\x20-\x7E]/.test(out)) {
    // é → e, ñ → n; anything still not on a keyboard is dropped.
    out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/[^\x20-\x7E]/.test(out)) return '';
  }
  if (simple) out = out.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  return out;
}

export function buildTextMap(blocks: Element[], simple: boolean, maxWords = Infinity): TextMap {
  const chars: Char[] = [];
  let words = 0;
  for (const block of blocks) {
    const blockChars = collapse(dropUntypeableWords(blockToChars(block, simple)));
    if (blockChars.length === 0) continue;
    if (chars.length > 0) chars.push({ ch: ' ', source: null });
    chars.push(...blockChars);
    words += blockChars.filter((c) => c.ch === ' ').length + 1;
    if (words >= maxWords) break;
  }
  return { text: chars.map((c) => c.ch).join(''), sources: chars.map((c) => c.source) };
}

/** A map over plain words (used by the fallback panel, whose text node we own). */
export function textMapFromNode(node: Text): TextMap {
  const text = node.data;
  return {
    text,
    sources: [...text].map((_, i) => ({ node, start: i, end: i + 1 })),
  };
}

function blockToChars(block: Element, simple: boolean): Char[] {
  const chars: Char[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element) {
        if (node.matches(SKIP) || isBracketFootnote(node)) return NodeFilter.FILTER_REJECT;
        if (node instanceof HTMLElement && node.checkVisibility && !node.checkVisibility()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const data = text.data;
    for (let i = 0; i < data.length; i++) {
      // Keep surrogate pairs (emoji) together so they're dropped as one.
      const code = data.charCodeAt(i);
      const width = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
      const source = { node: text, start: i, end: i + width };
      const ch = data.slice(i, i + width);
      if (normalizeChar(ch, false) === '') chars.push({ ch: UNTYPEABLE, source });
      const out = normalizeChar(ch, simple);
      for (const c of out) chars.push({ ch: c, source });
      i += width - 1;
    }
  }
  return chars;
}

/** `<sup>[12]</sup>` style footnote markers on any site. */
function isBracketFootnote(el: Element) {
  return el.tagName === 'SUP' && /^\s*\[[^\]]*\]\s*$/.test(el.textContent ?? '');
}

/** Removes words like /ˈtjʊərɪŋ/ that would otherwise be typed half-missing. */
function dropUntypeableWords(chars: Char[]): Char[] {
  const out: Char[] = [];
  let word: Char[] = [];
  const flush = () => {
    if (!word.some((c) => c.ch === UNTYPEABLE)) out.push(...word);
    word = [];
  };
  for (const c of chars) {
    if (c.ch === ' ') {
      flush();
      out.push(c);
    } else word.push(c);
  }
  flush();
  return out;
}

/** Trims and collapses whitespace runs to one space. */
function collapse(chars: Char[]): Char[] {
  const out: Char[] = [];
  for (const c of chars) {
    if (c.ch === ' ' && (out.length === 0 || out[out.length - 1]!.ch === ' ')) continue;
    out.push(c);
  }
  while (out.length > 0 && out[out.length - 1]!.ch === ' ') out.pop();
  return out;
}
