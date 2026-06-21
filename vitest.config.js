import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Exclude Deno-specific tests (run with `deno test` separately)
    exclude: ['**/node_modules/**', 'supabase/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['assets/js/chat-widget.js'],
      thresholds: {
        lines: 75,
      },
    },
  },
});
