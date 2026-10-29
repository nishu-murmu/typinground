/**
 * The typing test itself, the usual rules: space moves to the next word, backspace
 * can return to an earlier word only if it has a mistake. No DOM; time is passed in.
 */

export type Mode = 'time' | 'words';
export type CharState = 'untyped' | 'correct' | 'incorrect' | 'missed';

/** How many letters past the end of a word are accepted. */
const MAX_EXTRA = 20;

export interface Stats {
  wpm: number;
  raw: number;
  accuracy: number;
  seconds: number;
  chars: { correct: number; incorrect: number; extra: number; missed: number };
}

export class TypingEngine {
  readonly words: string[];
  /** Index of each word's first character in `target`. */
  readonly wordStarts: number[];
  readonly target: string;
  readonly typed: string[];
  wordIndex = 0;
  startedAt: number | null = null;
  finishedAt: number | null = null;
  /** WPM at the end of each whole second, for the result chart. */
  readonly samples: number[] = [];
  private keystrokes = 0;
  private correctKeystrokes = 0;

  constructor(
    text: string,
    readonly mode: Mode,
    /** Seconds in time mode, words in words mode. */
    readonly limit: number,
  ) {
    const all = text.split(' ').filter(Boolean);
    this.words = mode === 'words' ? all.slice(0, limit) : all;
    this.target = this.words.join(' ');
    this.typed = this.words.map(() => '');
    this.wordStarts = [];
    let start = 0;
    for (const word of this.words) {
      this.wordStarts.push(start);
      start += word.length + 1;
    }
  }

  get started() {
    return this.startedAt !== null;
  }

  get finished() {
    return this.finishedAt !== null;
  }

  get currentWord() {
    return this.words[this.wordIndex] ?? '';
  }

  get currentTyped() {
    return this.typed[this.wordIndex] ?? '';
  }

  /** Letters typed past the end of the current word. */
  get extra() {
    return this.currentTyped.slice(this.currentWord.length);
  }

  /** Position of the caret in `target`. */
  get cursor() {
    return (this.wordStarts[this.wordIndex] ?? 0) + Math.min(this.currentTyped.length, this.currentWord.length);
  }

  input(ch: string, now: number) {
    if (this.finished || this.words.length === 0) return;
    if (ch === ' ') {
      if (this.currentTyped === '') return;
      this.begin(now);
      this.keystrokes++;
      if (this.currentTyped === this.currentWord) this.correctKeystrokes++;
      if (this.wordIndex === this.words.length - 1) this.finish(now);
      else this.wordIndex++;
      return;
    }
    this.begin(now);
    this.keystrokes++;
    const typed = this.currentTyped;
    if (this.currentWord[typed.length] === ch) this.correctKeystrokes++;
    if (typed.length < this.currentWord.length + MAX_EXTRA) this.typed[this.wordIndex] = typed + ch;
    if (this.wordIndex === this.words.length - 1 && this.currentTyped === this.currentWord) {
      this.finish(now);
    }
  }

  backspace(wholeWord = false) {
    if (this.finished) return;
    if (this.currentTyped === '') {
      const previous = this.wordIndex - 1;
      if (previous < 0 || this.typed[previous] === this.words[previous]) return;
      this.wordIndex = previous;
      if (!wholeWord) return;
    }
    this.typed[this.wordIndex] = wholeWord ? '' : this.currentTyped.slice(0, -1);
  }

  /** Advances the clock: ends time tests and records per-second samples. */
  tick(now: number) {
    if (this.startedAt === null || this.finished) return;
    if (this.mode === 'time' && now - this.startedAt >= this.limit * 1000) {
      this.finish(this.startedAt + this.limit * 1000);
      return;
    }
    this.sample(now);
  }

  /** Seconds left in time mode, or seconds elapsed in words mode. */
  clock(now: number) {
    const elapsed = this.startedAt === null ? 0 : ((this.finishedAt ?? now) - this.startedAt) / 1000;
    return this.mode === 'time' ? Math.max(0, this.limit - elapsed) : elapsed;
  }

  charState(wordIndex: number, charIndex: number): CharState {
    const typed = this.typed[wordIndex] ?? '';
    if (charIndex < typed.length) {
      return typed[charIndex] === this.words[wordIndex]?.[charIndex] ? 'correct' : 'incorrect';
    }
    return wordIndex < this.wordIndex || (wordIndex === this.wordIndex && this.finished)
      ? 'missed'
      : 'untyped';
  }

  stats(now: number): Stats {
    const end = this.finishedAt ?? now;
    const seconds = this.startedAt === null ? 0 : (end - this.startedAt) / 1000;
    const minutes = seconds / 60;
    const chars = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    let typedChars = 0;
    for (let i = 0; i <= this.wordIndex && i < this.words.length; i++) {
      const word = this.words[i]!;
      const typed = this.typed[i]!;
      const committed = i < this.wordIndex || this.finished;
      typedChars += typed.length + (i < this.wordIndex ? 1 : 0);
      for (let j = 0; j < word.length; j++) {
        if (j < typed.length) chars[typed[j] === word[j] ? 'correct' : 'incorrect']++;
        else if (committed) chars.missed++;
      }
      chars.extra += Math.max(0, typed.length - word.length);
    }
    return {
      wpm: minutes > 0 ? round(this.correctWordChars() / 5 / minutes) : 0,
      raw: minutes > 0 ? round(typedChars / 5 / minutes) : 0,
      accuracy: this.keystrokes > 0 ? round((this.correctKeystrokes / this.keystrokes) * 100) : 0,
      seconds: round(seconds),
      chars,
    };
  }

  private wpmAt(time: number) {
    const minutes = (time - (this.startedAt ?? time)) / 60000;
    return minutes > 0 ? round(this.correctWordChars() / 5 / minutes) : 0;
  }

  /** Characters of correctly typed words plus their spaces, the basis of WPM. */
  private correctWordChars() {
    let count = 0;
    for (let i = 0; i < this.wordIndex; i++) {
      if (this.typed[i] === this.words[i]) count += this.words[i]!.length + 1;
    }
    // The word in progress counts while it's right so far (and fully once finished).
    const word = this.currentWord ?? '';
    const typed = this.currentTyped ?? '';
    if (typed.length <= word.length && word.startsWith(typed)) count += typed.length;
    return count;
  }

  private begin(now: number) {
    if (this.startedAt === null) this.startedAt = now;
  }

  private finish(now: number) {
    this.sample(now);
    this.finishedAt = now;
  }

  private sample(now: number) {
    const startedAt = this.startedAt ?? now;
    while ((this.samples.length + 1) * 1000 <= now - startedAt) {
      this.samples.push(this.wpmAt(startedAt + (this.samples.length + 1) * 1000));
    }
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
