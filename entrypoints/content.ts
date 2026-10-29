import type { TabMessage } from '@/lib/messaging';
import { Session } from '@/lib/session';

export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    // Nothing runs on the page until the shortcut is pressed.
    let session: Session | null = null;
    browser.runtime.onMessage.addListener((message: TabMessage) => {
      session ??= new Session();
      if (message.type === 'toggle') void session.toggle();
      else if (message.type === 'pick') void session.pick();
    });
    ctx.onInvalidated(() => session?.stop());
  },
});
