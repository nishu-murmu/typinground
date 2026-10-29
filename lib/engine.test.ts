import { describe, expect, it } from 'vitest';
import { TypingEngine } from './engine';

function type(engine: TypingEngine, text: string, start = 0, perChar = 100) {
  let now = start;
  for (const ch of text) {
    engine.input(ch, now);
    now += perChar;
  }
  return now;
}

describe('TypingEngine', () => {
  it('cuts the text to the word limit in words mode', () => {
    const engine = new TypingEngine('one two three four', 'words', 2);
    expect(engine.target).toBe('one two');
  });

  it('finishes when the last word is typed correctly', () => {
    const engine = new TypingEngine('the cat', 'words', 2);
    type(engine, 'the cat');
    expect(engine.finished).toBe(true);
    expect(engine.stats(0).chars).toEqual({ correct: 6, incorrect: 0, extra: 0, missed: 0 });
  });

  it('computes WPM from correct words', () => {
    // 12 words of 4 letters plus 11 spaces = 59 characters, finished at 11.8s:
    // 59 / 5 / (11.8 / 60) = 60 wpm.
    const engine = new TypingEngine('aaaa '.repeat(12).trim(), 'words', 12);
    type(engine, 'aaaa '.repeat(12).trim(), 0, 0);
    engine.finishedAt = 11_800;
    expect(engine.stats(0).wpm).toBe(60);
    expect(engine.stats(0).accuracy).toBe(100);
  });

  it('skips to the next word on space and counts the rest as missed', () => {
    const engine = new TypingEngine('hello world', 'words', 2);
    type(engine, 'he ');
    expect(engine.wordIndex).toBe(1);
    expect(engine.charState(0, 2)).toBe('missed');
    expect(engine.charState(1, 0)).toBe('untyped');
  });

  it('ignores space at the start of a word', () => {
    const engine = new TypingEngine('a b', 'words', 2);
    engine.input(' ', 0);
    expect(engine.wordIndex).toBe(0);
    expect(engine.started).toBe(false);
  });

  it('tracks extra letters past the end of a word', () => {
    const engine = new TypingEngine('hi there', 'words', 2);
    type(engine, 'hiya');
    expect(engine.extra).toBe('ya');
    expect(engine.cursor).toBe(2);
  });

  it('backspaces into an earlier word only when it has a mistake', () => {
    const engine = new TypingEngine('one two three', 'words', 3);
    type(engine, 'one ');
    engine.backspace();
    expect(engine.wordIndex).toBe(1);

    type(engine, 'twx ');
    engine.backspace();
    expect(engine.wordIndex).toBe(1);
    engine.backspace();
    expect(engine.currentTyped).toBe('tw');
  });

  it('clears the whole word with ctrl+backspace', () => {
    const engine = new TypingEngine('one two', 'words', 2);
    type(engine, 'tw');
    engine.backspace(true);
    expect(engine.currentTyped).toBe('');
  });

  it('ends a time test at the time limit and records samples', () => {
    const engine = new TypingEngine('a b c d e f g h', 'time', 2);
    type(engine, 'a b ', 0, 100);
    engine.tick(2_500);
    expect(engine.finished).toBe(true);
    expect(engine.finishedAt).toBe(2_000);
    expect(engine.samples).toHaveLength(2);
    expect(engine.clock(5_000)).toBe(0);
  });

  it('counts mistyped keystrokes against accuracy', () => {
    const engine = new TypingEngine('ab', 'words', 1);
    type(engine, 'xb');
    engine.backspace();
    engine.backspace();
    type(engine, 'ab');
    expect(engine.stats(1000).accuracy).toBe(75);
  });
});
