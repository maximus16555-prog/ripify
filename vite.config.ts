import { defineConfig } from 'vite';
export default defineConfig({ build: { rollupOptions: { output: { manualChunks: { engine: ['three'] } } } }, server: { port: 5173, strictPort: true } });
