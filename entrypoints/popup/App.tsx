import { useEffect, useState } from 'react';
import { sendToTab } from '@/lib/messaging';
import {
  historyItem,
  picksItem,
  removePick,
  settingsItem,
  TIME_OPTIONS,
  WORD_OPTIONS,
  type Settings,
  type TestResult,
} from '@/lib/storage';

function useItem<T>(item: { getValue(): Promise<T>; watch(cb: (value: T) => void): () => void }) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    void item.getValue().then(setValue);
    return item.watch(setValue);
  }, [item]);
  return value;
}

function App() {
  const settings = useItem(settingsItem);
  const history = useItem(historyItem) ?? [];
  const picks = useItem(picksItem) ?? {};
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'test' | 'stats' | 'shortcuts'>('test');

  useEffect(() => {
    void browser.commands
      .getAll()
      .then((commands) =>
        setShortcuts(Object.fromEntries(commands.map((c) => [c.name ?? '', c.shortcut || 'not set']))),
      );
  }, []);

  if (!settings) return null;

  const update = (change: Partial<Settings>) => settingsItem.setValue({ ...settings, ...change });
  const lengths = settings.mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS;
  const length = settings.mode === 'time' ? settings.time : settings.words;
  const best = bestFor(history, settings);

  const missingShortcut = Object.values(shortcuts).some((s) => s === 'not set');
  const openShortcuts = () => {
    void browser.tabs.create({
      url: import.meta.env.FIREFOX ? 'about:addons' : 'chrome://extensions/shortcuts',
    });
    window.close();
  };

  const start = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await sendToTab(tab.id, { type: 'toggle' });
    window.close();
  };

  return (
    <main>
      <header>
        <h1>
          <Logo />
          Typinground
        </h1>
      </header>

      <button className="start" onClick={start}>
        <span>Start on this page</span>
        <kbd>{shortcuts['toggle-typing']}</kbd>
      </button>

      <nav className="tabs">
        <button className={tab === 'test' ? 'on' : ''} onClick={() => setTab('test')}>
          Test
        </button>
        <button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
          Stats{history.length > 0 && <span className="count">{history.length}</span>}
        </button>
        <button className={tab === 'shortcuts' ? 'on' : ''} onClick={() => setTab('shortcuts')}>
          Shortcuts{missingShortcut && <span className="dot" aria-label="needs attention" />}
        </button>
      </nav>

      {tab === 'test' && (
        <section className="card">
          <div className="field">
            <span className="field-label">Mode</span>
            <div className="segmented two">
              {(['time', 'words'] as const).map((mode) => (
                <button
                  key={mode}
                  className={settings.mode === mode ? 'on' : ''}
                  onClick={() => update({ mode })}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">{settings.mode === 'time' ? 'Seconds' : 'Words'}</span>
            <div className="segmented">
              {lengths.map((n) => (
                <button
                  key={n}
                  className={n === length ? 'on' : ''}
                  onClick={() => update(settings.mode === 'time' ? { time: n } : { words: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="toggle">
            <span>
              Simple mode
              <small>Lowercase, no punctuation</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.simple}
              onChange={(e) => update({ simple: e.target.checked })}
            />
          </label>
          <label className="toggle">
            <span>
              Always pick a section
              <small>Choose what to type every time</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.alwaysPick}
              onChange={(e) => update({ alwaysPick: e.target.checked })}
            />
          </label>
        </section>
      )}

      {tab === 'stats' && (
        <>
          <section>
            <h2>
              Stats · {settings.mode} {length}
              {settings.simple ? ' simple' : ''}
            </h2>
            <div className="bests">
              <Stat label="best wpm" value={best ? Math.round(best.wpm) : '-'} />
              <Stat label="avg last 10" value={average(history, settings) ?? '-'} />
              <Stat label="tests" value={history.length} />
            </div>
          </section>

          <section>
            <h2>Recent</h2>
            {history.length === 0 ? (
              <p className="empty">No tests yet. Open any article and press {shortcuts['toggle-typing']}.</p>
            ) : (
              <ul className="recent">
                {history.slice(0, 4).map((r) => (
                  <li key={r.at}>
                    <strong>{Math.round(r.wpm)}</strong>
                    <span className="meta">
                      <span title={r.host}>{r.host}</span>
                      <small>
                        {Math.round(r.accuracy)}% acc · {r.mode} {r.limit}
                      </small>
                    </span>
                    <span className="when">{ago(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {Object.keys(picks).length > 0 && (
            <section>
              <h2>Saved sections</h2>
              <ul className="picks">
                {Object.entries(picks).map(([host, selector]) => (
                  <li key={host} title={selector}>
                    <span>{host}</span>
                    <button className="link" onClick={() => removePick(host)}>
                      forget
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'shortcuts' && (
        <>
          {missingShortcut && (
            <p className="warn">
              Your browser didn't assign one of the shortcuts, usually because another extension already uses
              it. Set it below.
            </p>
          )}
          <section>
            <h2>Anywhere in the browser</h2>
            <ul className="keys">
              <li>
                <span>Start or stop typing</span>
                <kbd className={shortcuts['toggle-typing'] === 'not set' ? 'unset' : ''}>
                  {shortcuts['toggle-typing']}
                </kbd>
              </li>
              <li>
                <span>Pick a section</span>
                <kbd className={shortcuts['pick-section'] === 'not set' ? 'unset' : ''}>
                  {shortcuts['pick-section']}
                </kbd>
              </li>
            </ul>
            <button className="secondary" onClick={openShortcuts}>
              Change shortcuts
            </button>
          </section>
          <section>
            <h2>During a test</h2>
            <ul className="keys">
              <li>
                <span>New test</span>
                <kbd>Tab</kbd>
              </li>
              <li>
                <span>Repeat same text</span>
                <kbd>Enter</kbd>
              </li>
              <li>
                <span>Delete word</span>
                <kbd>Ctrl+Backspace</kbd>
              </li>
              <li>
                <span>Exit</span>
                <kbd>Esc</kbd>
              </li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="9" width="56" height="51" rx="14" fill="#00255a" />
      <rect x="4" y="4" width="56" height="49" rx="14" fill="#004296" />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 15c5.5 0 9 1.6 9 5.5 0-3.9 3.5-5.5 9-5.5" />
        <path d="M32 20.5v20" />
        <path d="M23 46c5.5 0 9-1.6 9-5.5 0 3.9 3.5 5.5 9 5.5" />
      </g>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function sameTest(settings: Settings) {
  const limit = settings.mode === 'time' ? settings.time : settings.words;
  return (r: TestResult) => r.mode === settings.mode && r.limit === limit && r.simple === settings.simple;
}

function bestFor(history: TestResult[], settings: Settings) {
  return history
    .filter(sameTest(settings))
    .reduce<TestResult | null>((best, r) => (!best || r.wpm > best.wpm ? r : best), null);
}

function average(history: TestResult[], settings: Settings) {
  const recent = history.filter(sameTest(settings)).slice(0, 10);
  if (recent.length === 0) return null;
  return Math.round(recent.reduce((sum, r) => sum + r.wpm, 0) / recent.length);
}

function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export default App;
