import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts']
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@browser': path.resolve(__dirname, 'src/browser-extension'),
      '@mobile': path.resolve(__dirname, 'src/mobile')
    }
  }
});