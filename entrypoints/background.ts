import { sendToTab } from '@/lib/messaging';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command, tab) => {
    const target =
      tab?.id != null ? tab : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    if (target?.id == null) return;
    await sendToTab(target.id, { type: command === 'pick-section' ? 'pick' : 'toggle' });
  });
});
