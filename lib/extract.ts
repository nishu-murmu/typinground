/**
 * Finds the main reading flow of a page: the column of paragraphs a person would read,
 * without navigation, sidebars, footers and link lists.
 */

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd';
const HEADING = /^H[1-6]$/;

/** Subtrees that are never the reading flow when picking automatically. */
const EXCLUDED = [
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'table',
  'pre',
  'code',
  '[role=navigation]',
  '[role=complementary]',
  '[role=banner]',
  '[role=contentinfo]',
  '[role=note]',
  '.hatnote',
  '.noprint',
  '[aria-hidden=true]',
  '[hidden]',
  '.navbox',
  '.infobox',
  '.sidebar',
  '.toc',
  '#toc',
  '.references',
  '.reflist',
  '.metadata',
  '.ambox',
].join(',');

/** Noise even inside a section the user picked. */
const ALWAYS_EXCLUDED = '[aria-hidden=true], [hidden], [role=note], .hatnote, .noprint';

export interface Extraction {
  container: Element;
  blocks: HTMLElement[];
  /** Index of the first block visible in the viewport. */
  startIndex: number;
}

/**
 * Picks the reading flow. With `picked`, the user chose the container, so the
 * auto-pick filters are relaxed to whatever is inside it.
 */
export function extract(picked?: Element | null): Extraction | null {
  if (picked) {
    const blocks = collectBlocks(picked, true);
    if (blocks.length === 0) return null;
    return { container: picked, blocks, startIndex: firstVisible(blocks) };
  }

  const candidates = collectBlocks(document.body, false);
  if (candidates.length === 0) return null;

  // Readability-style scoring: each paragraph lends its length to its ancestors,
  // so the element holding the most prose wins.
  const scores = new Map<Element, number>();
  for (const block of candidates) {
    if (HEADING.test(block.tagName)) continue;
    const length = textLength(block);
    let ancestor = block.parentElement;
    for (let depth = 1; ancestor && depth <= 3; depth++) {
      scores.set(ancestor, (scores.get(ancestor) ?? 0) + length / depth);
      ancestor = ancestor.parentElement;
    }
  }
  let container: Element = document.body;
  let best = -1;
  for (const [element, score] of scores) {
    if (score > best) {
      best = score;
      container = element;
    }
  }

  const blocks = candidates.filter((block) => container.contains(block));
  return { container, blocks, startIndex: firstVisible(blocks) };
}

function collectBlocks(root: Element, picked: boolean): HTMLElement[] {
  if (root instanceof HTMLElement && root.matches(BLOCK_SELECTOR) && !hasBlockChild(root)) {
    return isVisible(root) ? [root] : [];
  }
  const elements = [
    ...root.querySelectorAll<HTMLElement>(`${BLOCK_SELECTOR}, div`),
  ];
  return elements.filter((el) => {
    if (el.tagName === 'DIV') {
      // Plenty of sites put prose straight into divs.
      if (directText(el) < 40 || hasBlockChild(el) || el.querySelector('div')) return false;
    } else if (hasBlockChild(el)) {
      // Keep the innermost blocks so no text is typed twice.
      return false;
    }
    if (!isVisible(el)) return false;
    if (isExcluded(el, root, picked)) return false;
    const length = textLength(el);
    const isHeading = HEADING.test(el.tagName);
    if (!picked && length < (isHeading ? 2 : 30)) return false;
    if (length === 0) return false;
    if (!picked && !isHeading && linkDensity(el, length) > 0.5) return false;
    return true;
  });
}

function hasBlockChild(el: Element) {
  return el.querySelector(BLOCK_SELECTOR) !== null;
}

/** Excluded subtrees count only below the root, so picking an <aside> still works. */
function isExcluded(el: Element, root: Element, picked: boolean) {
  const excluded = el.closest(picked ? ALWAYS_EXCLUDED : EXCLUDED);
  return excluded !== null && root.contains(excluded) && excluded !== root;
}

function isVisible(el: HTMLElement) {
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function textLength(el: Element) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length;
}

function directText(el: Element) {
  let length = 0;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) length += (node.textContent ?? '').trim().length;
    else if (node instanceof HTMLElement && !node.matches('div, ' + BLOCK_SELECTOR)) {
      length += (node.textContent ?? '').trim().length;
    }
  }
  return length;
}

function linkDensity(el: Element, length: number) {
  let linked = 0;
  for (const a of el.querySelectorAll('a')) linked += textLength(a);
  return length === 0 ? 0 : linked / length;
}

function firstVisible(blocks: HTMLElement[]) {
  const index = blocks.findIndex((block) => {
    const rect = block.getBoundingClientRect();
    return rect.top >= -4 && rect.top < window.innerHeight;
  });
  if (index !== -1) return index;
  const partly = blocks.findIndex((block) => block.getBoundingClientRect().bottom > 0);
  return partly === -1 ? 0 : partly;
}
