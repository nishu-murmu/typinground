export type TabMessage = { type: 'toggle' } | { type: 'pick' };

/** Sends a message to a tab's content script, injecting it first on tabs opened before install. */
export async function sendToTab(tabId: number, message: TabMessage) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['/content-scripts/content.js'],
      });
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // Pages like chrome:// and the Web Store can't run extensions.
    }
  }
}
