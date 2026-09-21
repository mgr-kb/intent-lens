import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ define: { 'import.meta.env.VITE_JEV_MOCK': JSON.stringify(process.env.VITE_JEV_MOCK === '1' ? '1' : '0') }, resolve: { alias: { '../jev/runtime-client': fileURLToPath(new URL(process.env.VITE_JEV_MOCK === '1' ? './src/jev/mock.ts' : './src/jev/real.ts', import.meta.url)) } }, base: './', build: { outDir: process.env.VITE_JEV_MOCK === '1' ? 'dist-mock' : 'dist', target: 'chrome120', rolldownOptions: {
  input: { options: 'options.html', background: 'src/background/index.ts' },
  output: { minify: { compress: { dropConsole: true } }, entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
} } });
