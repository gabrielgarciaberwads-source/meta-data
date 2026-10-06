import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/dashboard',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4178',
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
