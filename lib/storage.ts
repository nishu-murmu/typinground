import { storage } from 'wxt/utils/storage';
import type { Mode } from './engine';

export interface Settings {
  mode: Mode;
  time: number;
  words: number;
  /** Lowercase, no punctuation: numbers comparable with plain word-list tests. */
  simple: boolean;
  /** Open the section picker every time instead of picking automatically. */
  alwaysPick: boolean;
}

export interface TestResult {
  at: number;
  host: string;
  mode: Mode;
  limit: number;
  simple: boolean;
  wpm: number;
  raw: number;
  accuracy: number;
  seconds: number;
  chars: { correct: number; incorrect: number; extra: number; missed: number };
}

export const TIME_OPTIONS = [15, 30, 60, 120];
export const WORD_OPTIONS = [10, 25, 50, 100];
const HISTORY_LIMIT = 500;

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: { mode: 'time', time: 30, words: 25, simple: false, alwaysPick: false },
});

export const historyItem = storage.defineItem<TestResult[]>('local:history', { fallback: [] });

/** Saved section picks: hostname → CSS selector. */
export const picksItem = storage.defineItem<Record<string, string>>('local:picks', {
  fallback: {},
});

export async function addResult(result: TestResult) {
  const history = await historyItem.getValue();
  await historyItem.setValue([result, ...history].slice(0, HISTORY_LIMIT));
}

export async function savePick(host: string, selector: string) {
  await picksItem.setValue({ ...(await picksItem.getValue()), [host]: selector });
}

export async function removePick(host: string) {
  const { [host]: _, ...rest } = await picksItem.getValue();
  await picksItem.setValue(rest);
}
