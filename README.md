# Typinground

Turn any webpage into a typing test. Press a shortcut on an article and its text becomes the test: you type over the page itself, with time (15/30/60/120s) and word (10/25/50/100) modes, and get WPM and accuracy at the end.

## Use

| Key | What it does |
| --- | --- |
| `Alt+Shift+T` | Start or stop typing mode on the current page |
| `Alt+Shift+P` | Pick the section to type (hover, `↑`/`↓` to widen or narrow, click to choose). Remembered per site |
| `Tab` | New test from the first paragraph on screen |
| `Enter` (on results) | Repeat the same text |
| `Esc` | Exit |
| Click a paragraph | Restart the test there |

Shortcuts can be changed at `chrome://extensions/shortcuts`. Settings, history and saved sections are in the toolbar popup.

Pages without much text (or where extensions can't run text extraction) fall back to a common-words test.

## Develop

```bash
bun install
bun run dev          # opens Chrome with the extension loaded
bun run test         # engine unit tests
bun run compile      # type check
bun run build        # production build in .output/chrome-mv3
```

To load a build manually: open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `.output/chrome-mv3`.

## Landing page

`site/` is the landing page (no build step). Deploy the whole folder to any static host.

- `index.html`: the page, with canonical URL, Open Graph/Twitter tags and JSON-LD (Organization, WebSite, SoftwareApplication, HowTo, FAQPage).
- `sitemap.xml`, `robots.txt` (allows search and AI crawlers), `llms.txt` (plain summary for AI assistants), `site.webmanifest`.
- `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png` (1200×630 share card).
- `fonts/`: Iosevka subset to Latin (about 9 KB per weight).

The domain is set to `https://typinground.pages.dev` in `index.html`, `sitemap.xml`, `robots.txt` and `llms.txt`. If your Cloudflare Pages project or domain is different, replace it in those four files. Update `<lastmod>` in `sitemap.xml` when the page changes.

Analytics use [Umami Cloud](https://cloud.umami.is) (cookie-free, so no consent banner). Add the site there, then paste its website ID into `window.UMAMI_WEBSITE_ID` at the top of `site/index.html`. Nothing is tracked until the ID is set, or when the page is opened locally. Events:

| Event | When |
| --- | --- |
| `get-extension` | Any "Get Typinground" button; `location` is `nav`, `hero`, `demo-results`, `closing`, `chrome-store` or `firefox-addons` |
| `try-demo` | "Try it" buttons; `location` is `hero` or `closing` |
| `demo-start` / `demo-finish` | Someone types in the demo; `finish` includes their `wpm` |
| `view-section` | A visitor scrolls to `features`, `shortcuts`, `install` or `faq` |
| `announcement-click` | The "New" pill at the top |

## How it works

- `lib/extract.ts` finds the main reading column by scoring which element holds the most prose, skipping nav, sidebars, footers and link lists.
- `lib/picker.ts` is the manual override: a hover picker that saves a CSS selector per site.
- `lib/textmap.ts` normalizes text to keyboard characters (curly quotes, dashes, accents), drops footnote markers and untypeable words, and remembers where each character lives in the page.
- `lib/engine.ts` is the typing test itself (pure TypeScript, unit-tested).
- `lib/render.ts` paints progress onto the page's own text with the CSS Custom Highlight API, so the page's DOM is never modified.
- `lib/ui.ts` draws the HUD, caret, spotlight, results and picker inside a shadow root.
