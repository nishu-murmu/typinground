import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Typinground',
    description: 'Turn any webpage into a typing test.',
    permissions: ['storage', 'activeTab', 'scripting'],
    commands: {
      'toggle-typing': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: 'Toggle typing mode on this page',
      },
      'pick-section': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Pick the section of the page to type',
      },
    },
  },
});
